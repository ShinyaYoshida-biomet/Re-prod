use crate::acp::AcpService;
use crate::handlers::stream_buffer::StreamBuffer;
use anyhow::{anyhow, Context, Result};
use reprod_core::{
    acp::pending_edit::PendingEditStore,
    ai::session::LocalAgentSession,
    ai::tools::{FileSystemTool, RContextTool},
    edit::EditService,
    execution_repository::{ExecutionRepository, TimelineExecutionRepository},
    fs::FileSystem,
    plot_history::PlotHistoryEntry,
    plot_history::PlotHistoryManager,
    timeline::JsonTimeline,
    web_search::{cloud_provider::CloudWebSearchProvider, WebSearchRegistry},
};
use reprod_core::{
    config::workspace_root_override,
    project::{locate_config, ProjectDescriptor, ProjectRecord},
    Config, ExecutionEvent, RExecutor, RunOutputChunk, RunSummary,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::{broadcast, Mutex};

#[derive(Debug, Clone)]
pub enum RuntimeBroadcastEvent {
    RunStarted {
        run: RunSummary,
    },
    RunOutput {
        chunk: RunOutputChunk,
    },
    RunFinished {
        run: RunSummary,
    },
    TimelineEventAdded {
        event: ExecutionEvent,
    },
    PlotHistoryUpdated {
        active_plot_id: Option<String>,
        plots: Vec<PlotHistoryEntry>,
    },
}

pub struct ProjectRuntime {
    pub descriptor: ProjectDescriptor,
    pub timeline: Arc<JsonTimeline>,
    pub execution_repo: Arc<dyn ExecutionRepository>,
    pub stream_buffer: Arc<Mutex<StreamBuffer>>,
    pub run_events: broadcast::Sender<RuntimeBroadcastEvent>,
    pub file_system: Arc<FileSystem>,
    pub filesystem_tool: Arc<FileSystemTool>,
    pub edit_service: Arc<EditService>,
    pub r_context_tool: Arc<RContextTool>,
    pub r_executor: Arc<Mutex<RExecutor>>,
    pub plot_history: Arc<Mutex<PlotHistoryManager>>,
    pub acp: Arc<AcpService>,
    pub web_search_registry: Arc<Mutex<WebSearchRegistry>>,
    pub pending_edits: Arc<Mutex<PendingEditStore>>,
    pub local_sessions: Arc<Mutex<HashMap<String, LocalAgentSession>>>,
    pub acp_conversations: Arc<Mutex<HashMap<String, String>>>,
    pub acp_session_streams: Arc<Mutex<HashMap<String, String>>>,
    pub acp_tool_titles: Arc<Mutex<HashMap<String, HashMap<String, String>>>>,
    pub acp_last_chunk_kind: Arc<Mutex<HashMap<String, String>>>,
    /// Accumulated raw message text per stream_id, used to parse code blocks at Done.
    pub acp_accumulated_text: Arc<Mutex<HashMap<String, String>>>,
}

impl ProjectRuntime {
    fn new(
        mut descriptor: ProjectDescriptor,
        config: Config,
        base_temp_dir: &Path,
    ) -> Result<Self> {
        ProjectDescriptor::ensure_layout(&descriptor.root_path)?;
        descriptor.config.touch_opened();
        descriptor.update_config()?;
        let timeline_path = descriptor.root_path.join(".reprod").join("timeline.ndjson");
        let timeline = JsonTimeline::new(timeline_path).unwrap_or_else(|error| {
            tracing::warn!(
                "Failed to initialize timeline storage for {}: {}. Using in-memory timeline.",
                descriptor.root_path.display(),
                error
            );
            JsonTimeline::new_in_memory().expect("Failed to create in-memory timeline")
        });
        let timeline = Arc::new(timeline);

        let execution_repo: Arc<dyn ExecutionRepository> =
            Arc::new(TimelineExecutionRepository::new(timeline.clone()));

        let plot_history_path = descriptor.root_path.join(".reprod").join("plots");
        let plot_history_manager = PlotHistoryManager::new(plot_history_path)?;
        let plot_history = Arc::new(Mutex::new(plot_history_manager));

        let temp_dir = base_temp_dir.join(&descriptor.config.id);
        std::fs::create_dir_all(&temp_dir).with_context(|| {
            format!(
                "Failed to create project temp directory {}",
                temp_dir.display()
            )
        })?;

        let r_executor = RExecutor::builder(temp_dir, config.r_path)
            .with_shared_timeline(timeline.clone())
            .with_plot_history(plot_history.clone())
            .with_working_dir(descriptor.root_path.clone())
            .use_persistent_mode()
            .disable_run_recording()
            .build();

        let filesystem_root = descriptor.root_path.clone();
        let (run_events, _) = broadcast::channel(1024);
        let acp = Arc::new(AcpService::new(descriptor.root_path.clone()));
        let web_search_registry = Arc::new(Mutex::new(WebSearchRegistry::new()));
        match CloudWebSearchProvider::from_env() {
            Ok(Some(provider)) => {
                if let Ok(mut registry) = web_search_registry.try_lock() {
                    registry.register_provider(provider);
                } else {
                    tracing::warn!("Web search registry locked during initialization");
                }
            }
            Ok(None) => {
                tracing::info!("Web search provider not configured; skipping initialization");
            }
            Err(error) => {
                tracing::warn!("Failed to initialize web search provider: {}", error);
            }
        }
        Ok(Self {
            descriptor,
            timeline,
            execution_repo,
            stream_buffer: Arc::new(Mutex::new(StreamBuffer::new())),
            run_events,
            file_system: Arc::new(FileSystem::new(&filesystem_root)),
            filesystem_tool: Arc::new(FileSystemTool::new(filesystem_root.clone())),
            edit_service: Arc::new(EditService::new(filesystem_root)),
            r_context_tool: Arc::new(RContextTool::new()),
            r_executor: Arc::new(Mutex::new(r_executor)),
            plot_history,
            acp,
            web_search_registry,
            pending_edits: Arc::new(Mutex::new(PendingEditStore::default())),
            local_sessions: Arc::new(Mutex::new(HashMap::new())),
            acp_conversations: Arc::new(Mutex::new(HashMap::new())),
            acp_session_streams: Arc::new(Mutex::new(HashMap::new())),
            acp_tool_titles: Arc::new(Mutex::new(HashMap::new())),
            acp_last_chunk_kind: Arc::new(Mutex::new(HashMap::new())),
            acp_accumulated_text: Arc::new(Mutex::new(HashMap::new())),
        })
    }
}

pub struct ProjectController {
    runtimes: Mutex<HashMap<String, Arc<ProjectRuntime>>>,
    base_temp_dir: PathBuf,
    config: Arc<Mutex<Config>>,
}

impl ProjectController {
    pub async fn new(config: Arc<Mutex<Config>>) -> Result<Self> {
        let base_temp_dir = std::env::temp_dir().join("reprod");
        std::fs::create_dir_all(&base_temp_dir)
            .with_context(|| format!("Failed to create {}", base_temp_dir.display()))?;

        Ok(Self {
            runtimes: Mutex::new(HashMap::new()),
            base_temp_dir,
            config,
        })
    }

    pub async fn default_runtime(&self) -> Result<Arc<ProjectRuntime>> {
        let root = match workspace_root_override() {
            Some(path) => path,
            None => {
                std::env::current_dir().context("Failed to determine current working directory")?
            }
        };
        self.runtime_for_path(&root).await
    }

    pub async fn runtime_for_path(&self, path: &Path) -> Result<Arc<ProjectRuntime>> {
        let canonical = path
            .canonicalize()
            .with_context(|| format!("Failed to resolve {}", path.display()))?;
        let key = canonical.to_string_lossy().to_string();

        {
            let runtimes = self.runtimes.lock().await;
            if let Some(runtime) = runtimes.get(&key) {
                let runtime = runtime.clone();
                drop(runtimes);

                let config = Config::load_with_project(Some(&runtime.descriptor.root_path))?;
                {
                    let mut global_cfg = self.config.lock().await;
                    *global_cfg = config;
                }

                let mut descriptor = runtime.descriptor.clone();
                descriptor.config.touch_opened();
                descriptor.update_config()?;

                return Ok(runtime);
            }
        }

        if !canonical.exists() {
            return Err(anyhow!("Directory {} does not exist", canonical.display()));
        }
        if !canonical.is_dir() {
            return Err(anyhow!("Path {} is not a directory", canonical.display()));
        }

        let descriptor = if locate_config(&canonical).is_ok() {
            ProjectDescriptor::load(&canonical)?
        } else {
            let name = canonical
                .file_name()
                .and_then(|os| os.to_str())
                .unwrap_or("Workspace");
            ProjectDescriptor::create(&canonical, name, None)?
        };

        let config = Config::load_with_project(Some(&descriptor.root_path))?;
        let mut runtimes = self.runtimes.lock().await;
        if let Some(existing) = runtimes.get(&key) {
            {
                let mut global_cfg = self.config.lock().await;
                *global_cfg = config;
            }
            return Ok(existing.clone());
        }

        let runtime = Arc::new(ProjectRuntime::new(
            descriptor,
            config.clone(),
            &self.base_temp_dir,
        )?);
        runtimes.insert(key, runtime.clone());
        drop(runtimes);

        {
            let mut global_cfg = self.config.lock().await;
            *global_cfg = config;
        }

        Ok(runtime)
    }

    pub async fn list_projects(&self, root: &Path) -> Result<Vec<ProjectRecord>> {
        if !root.exists() {
            return Err(anyhow!("Project root {} does not exist", root.display()));
        }
        if !root.is_dir() {
            return Err(anyhow!(
                "Project root {} is not a directory",
                root.display()
            ));
        }

        let mut records = Vec::new();
        if locate_config(root).is_ok() {
            let descriptor = ProjectDescriptor::load(root)?;
            records.push(ProjectRecord::from(&descriptor));
        }

        for entry in
            std::fs::read_dir(root).with_context(|| format!("Failed to read {}", root.display()))?
        {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let path = entry.path();
            if locate_config(&path).is_err() {
                continue;
            }
            let descriptor = ProjectDescriptor::load(&path)?;
            records.push(ProjectRecord::from(&descriptor));
        }

        records.sort_by(|a, b| {
            let a_opened = a.last_opened_at.unwrap_or(0);
            let b_opened = b.last_opened_at.unwrap_or(0);
            b_opened.cmp(&a_opened).then_with(|| a.name.cmp(&b.name))
        });

        Ok(records)
    }

    pub async fn runtime_for_project_id(
        &self,
        root: &Path,
        project_id: &str,
    ) -> Result<Arc<ProjectRuntime>> {
        let records = self.list_projects(root).await?;
        let record = records
            .into_iter()
            .find(|record| record.id == project_id)
            .ok_or_else(|| anyhow!("Project {} not found", project_id))?;
        let path = PathBuf::from(record.path);
        self.runtime_for_path(&path).await
    }

    pub async fn create_project(
        &self,
        root: &Path,
        name: &str,
        base_path: Option<&Path>,
    ) -> Result<ProjectRecord> {
        if name.trim().is_empty() {
            return Err(anyhow!("Project name cannot be empty"));
        }

        if !root.exists() {
            return Err(anyhow!("Project root {} does not exist", root.display()));
        }
        if !root.is_dir() {
            return Err(anyhow!(
                "Project root {} is not a directory",
                root.display()
            ));
        }

        let canonical_root = root
            .canonicalize()
            .with_context(|| format!("Failed to resolve {}", root.display()))?;
        let base = base_path.unwrap_or(root);
        let canonical_base = base
            .canonicalize()
            .with_context(|| format!("Failed to resolve {}", base.display()))?;
        if !canonical_base.starts_with(&canonical_root) {
            return Err(anyhow!("Project base path is outside the allowed root"));
        }

        let slug = slugify_project_dir(name);
        let mut candidate = canonical_base.join(&slug);
        let mut suffix = 2u32;
        while candidate.exists() {
            candidate = canonical_base.join(format!("{slug}-{suffix}"));
            suffix += 1;
        }

        std::fs::create_dir_all(&candidate).with_context(|| {
            format!("Failed to create project directory {}", candidate.display())
        })?;
        let descriptor = ProjectDescriptor::create(&candidate, name, None)?;
        Ok(ProjectRecord::from(&descriptor))
    }
}

fn slugify_project_dir(name: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[tokio::test]
    async fn runtime_for_path_creates_reprod_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("create workspace");

        let controller = ProjectController::new(Arc::new(Mutex::new(Config::default())))
            .await
            .expect("controller");
        let runtime = controller
            .runtime_for_path(&workspace)
            .await
            .expect("runtime");

        let reprod_dir = runtime.descriptor.root_path.join(".reprod");
        assert!(reprod_dir.is_dir());
        assert!(reprod_dir.join("config.json").exists());
    }

    #[tokio::test]
    async fn runtime_for_path_rejects_file_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let file_path = temp.path().join("not-a-dir");
        std::fs::write(&file_path, "data").expect("write file");

        let controller = ProjectController::new(Arc::new(Mutex::new(Config::default())))
            .await
            .expect("controller");
        let result = controller.runtime_for_path(&file_path).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_projects_returns_project_records() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("projects");
        std::fs::create_dir_all(&root).expect("create root");

        let alpha_path = root.join("alpha");
        std::fs::create_dir_all(&alpha_path).expect("create alpha");
        let alpha = ProjectDescriptor::create(&alpha_path, "Alpha", None).expect("alpha");

        let beta_path = root.join("beta");
        std::fs::create_dir_all(&beta_path).expect("create beta");
        let beta = ProjectDescriptor::create(&beta_path, "Beta", None).expect("beta");

        let controller = ProjectController::new(Arc::new(Mutex::new(Config::default())))
            .await
            .expect("controller");
        let projects = controller.list_projects(&root).await.expect("projects");

        let ids: HashSet<String> = projects.into_iter().map(|p| p.id).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&alpha.config.id));
        assert!(ids.contains(&beta.config.id));
    }

    #[tokio::test]
    async fn runtime_for_project_id_finds_matching_project() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("projects");
        std::fs::create_dir_all(&root).expect("create root");

        let project_path = root.join("gamma");
        std::fs::create_dir_all(&project_path).expect("create project");
        let descriptor =
            ProjectDescriptor::create(&project_path, "Gamma", None).expect("descriptor");

        let controller = ProjectController::new(Arc::new(Mutex::new(Config::default())))
            .await
            .expect("controller");
        let runtime = controller
            .runtime_for_project_id(&root, &descriptor.config.id)
            .await
            .expect("runtime");

        assert_eq!(runtime.descriptor.config.id, descriptor.config.id);
    }

    #[tokio::test]
    async fn create_project_creates_unique_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("projects");
        std::fs::create_dir_all(&root).expect("create root");

        let controller = ProjectController::new(Arc::new(Mutex::new(Config::default())))
            .await
            .expect("controller");
        let project = controller
            .create_project(&root, "My Project", None)
            .await
            .expect("project");

        let project_path = PathBuf::from(&project.path);
        assert!(project_path.exists());
        assert!(project_path.join(".reprod").join("config.json").exists());
        assert_eq!(project.name, "My Project");
    }
}
