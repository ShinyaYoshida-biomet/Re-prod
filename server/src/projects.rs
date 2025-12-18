use anyhow::{anyhow, Context, Result};
use crate::handlers::stream_buffer::StreamBuffer;
use reprod_core::{
    ai::tools::{FileSystemTool, RContextTool},
    execution_repository::{ExecutionRepository, TimelineExecutionRepository},
    fs::FileSystem,
    plot_history::PlotHistoryManager,
    timeline::JsonTimeline,
};
use reprod_core::{
    project::{
        default_config_path, default_registry_path, locate_config, ProjectConfig,
        ProjectDescriptor, ProjectRecord, ProjectRegistry,
    },
    Config, RExecutor,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionSnapshot {
    version: u32,
    saved_at: u64,
    #[serde(default)]
    editor: SessionEditor,
    #[serde(default)]
    view: SessionView,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionEditor {
    #[serde(default)]
    filepath: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionView {
    #[serde(default)]
    panes: SessionPanes,
    #[serde(default)]
    modals: SessionModals,
    #[serde(default = "default_zoom")]
    zoom: f32,
}

impl Default for SessionView {
    fn default() -> Self {
        Self {
            panes: SessionPanes::default(),
            modals: SessionModals::default(),
            zoom: default_zoom(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionPanes {
    #[serde(default = "true_bool")]
    files: bool,
    #[serde(default = "true_bool")]
    editor: bool,
    #[serde(default = "true_bool")]
    assistant: bool,
}

impl Default for SessionPanes {
    fn default() -> Self {
        Self {
            files: true,
            editor: true,
            assistant: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionModals {
    #[serde(default)]
    export: bool,
    #[serde(default)]
    shortcuts: bool,
    #[serde(default)]
    about: bool,
    #[serde(default)]
    session_info: bool,
    #[serde(default)]
    settings: bool,
    #[serde(default)]
    projects: bool,
}

fn true_bool() -> bool {
    true
}

fn default_zoom() -> f32 {
    1.0
}

pub struct ProjectRuntime {
    pub descriptor: ProjectDescriptor,
    pub timeline: Arc<JsonTimeline>,
    pub execution_repo: Arc<dyn ExecutionRepository>,
    pub stream_buffer: Arc<Mutex<StreamBuffer>>,
    pub file_system: Arc<FileSystem>,
    pub filesystem_tool: Arc<FileSystemTool>,
    pub r_context_tool: Arc<RContextTool>,
    pub r_executor: Arc<Mutex<RExecutor>>,
    pub plot_history: Arc<Mutex<PlotHistoryManager>>,
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
        Ok(Self {
            descriptor,
            timeline,
            execution_repo,
            stream_buffer: Arc::new(Mutex::new(StreamBuffer::new())),
            file_system: Arc::new(FileSystem::new(&filesystem_root)),
            filesystem_tool: Arc::new(FileSystemTool::new(filesystem_root)),
            r_context_tool: Arc::new(RContextTool::new()),
            r_executor: Arc::new(Mutex::new(r_executor)),
            plot_history,
        })
    }
}

pub struct ProjectController {
    registry: Mutex<ProjectRegistry>,
    runtimes: Mutex<HashMap<String, Arc<ProjectRuntime>>>,
    base_temp_dir: PathBuf,
    config: Arc<Mutex<Config>>,
}

impl ProjectController {
    pub async fn new(config: Arc<Mutex<Config>>) -> Result<Self> {
        let registry_path = default_registry_path()?;
        let registry = ProjectRegistry::load(registry_path)?;
        let base_temp_dir = std::env::temp_dir().join("reprod");
        std::fs::create_dir_all(&base_temp_dir)
            .with_context(|| format!("Failed to create {}", base_temp_dir.display()))?;

        let controller = Self {
            registry: Mutex::new(registry),
            runtimes: Mutex::new(HashMap::new()),
            base_temp_dir,
            config,
        };
        controller.ensure_default_project().await?;
        Ok(controller)
    }

    pub async fn list_projects(&self) -> Vec<ProjectRecord> {
        let registry = self.registry.lock().await;
        registry.records().to_vec()
    }

    pub async fn default_runtime(&self) -> Result<Arc<ProjectRuntime>> {
        let registry = self.registry.lock().await;
        let project_id = registry
            .records()
            .iter()
            .max_by_key(|record| record.last_opened_at.unwrap_or(0))
            .map(|record| record.id.clone())
            .ok_or_else(|| anyhow!("No projects registered"))?;
        drop(registry);
        self.runtime_for(&project_id).await
    }
    pub async fn runtime_for(&self, project_id: &str) -> Result<Arc<ProjectRuntime>> {
        {
            let runtimes = self.runtimes.lock().await;
            if let Some(runtime) = runtimes.get(project_id) {
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
                self.refresh_registry(&descriptor).await?;

                return Ok(runtime);
            }
        }

        let descriptor = self.load_descriptor(project_id).await?;
        let config = Config::load_with_project(Some(&descriptor.root_path))?;
        let mut runtimes = self.runtimes.lock().await;
        if let Some(existing) = runtimes.get(project_id) {
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
        self.refresh_registry(&runtime.descriptor).await?;
        runtimes.insert(project_id.to_string(), runtime.clone());
        drop(runtimes);

        {
            let mut global_cfg = self.config.lock().await;
            *global_cfg = config;
        }

        Ok(runtime)
    }

    pub async fn create_new_project(&self, root: &Path, name: &str) -> Result<ProjectDescriptor> {
        if root.exists() {
            return Err(anyhow!(
                "Project directory {} already exists",
                root.display()
            ));
        }
        std::fs::create_dir_all(root)
            .with_context(|| format!("Failed to create {}", root.display()))?;
        self.register_project(ProjectDescriptor::create(root, name, None)?)
            .await
    }

    pub async fn add_existing_project(&self, root: &Path) -> Result<ProjectDescriptor> {
        if !root.exists() {
            return Err(anyhow!("Directory {} does not exist", root.display()));
        }

        let descriptor = if locate_config(root).is_ok() {
            ProjectDescriptor::load(root)?
        } else {
            let name = root
                .file_name()
                .and_then(|os| os.to_str())
                .unwrap_or("Re-prod Project");
            ProjectDescriptor::create(root, name, None)?
        };

        self.register_project(descriptor).await
    }

    pub async fn clone_project(
        &self,
        remote: &str,
        destination: &Path,
        name: Option<String>,
    ) -> Result<ProjectDescriptor> {
        if destination.exists() {
            return Err(anyhow!(
                "Destination {} already exists",
                destination.display()
            ));
        }

        let status = Command::new("git")
            .arg("clone")
            .arg(remote)
            .arg(destination)
            .status()
            .context("Failed to spawn git clone")?;

        if !status.success() {
            return Err(anyhow!("git clone failed with status {}", status));
        }

        let project_name = name.unwrap_or_else(|| {
            destination
                .file_name()
                .and_then(|os| os.to_str())
                .unwrap_or("Cloned Project")
                .to_string()
        });

        let mut descriptor = if locate_config(destination).is_ok() {
            ProjectDescriptor::load(destination)?
        } else {
            ProjectDescriptor::create(destination, &project_name, Some(remote.to_string()))?
        };
        descriptor.config.git_remote = Some(remote.to_string());
        descriptor.update_config()?;

        self.register_project(descriptor).await
    }

    pub async fn load_state(&self, project_id: &str) -> Result<Option<serde_json::Value>> {
        let runtime = self.runtime_for(project_id).await?;
        let state_path = runtime
            .descriptor
            .root_path
            .join(".reprod")
            .join("state.json");
        if !state_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&state_path)
            .with_context(|| format!("Failed to read {}", state_path.display()))?;
        let value: serde_json::Value =
            serde_json::from_str(&content).context("Failed to parse project state document")?;

        match serde_json::from_value::<SessionSnapshot>(value) {
            Ok(snapshot) => Ok(Some(
                serde_json::to_value(snapshot).context("Failed to serialize project state")?,
            )),
            Err(error) => {
                tracing::warn!(
                    "Ignoring invalid project state for {}: {}",
                    runtime.descriptor.config.id,
                    error
                );
                Ok(None)
            }
        }
    }

    pub async fn save_state(&self, project_id: &str, payload: serde_json::Value) -> Result<()> {
        let runtime = self.runtime_for(project_id).await?;
        let state_path = runtime
            .descriptor
            .root_path
            .join(".reprod")
            .join("state.json");
        if let Some(parent) = state_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create project state directory {}",
                    parent.display()
                )
            })?;
        }
        let snapshot: SessionSnapshot = serde_json::from_value(payload)
            .context("Project state payload contains unsupported fields")?;
        let content =
            serde_json::to_string_pretty(&snapshot).context("Failed to serialize project state")?;
        std::fs::write(&state_path, content)
            .with_context(|| format!("Failed to write {}", state_path.display()))
    }

    async fn ensure_default_project(&self) -> Result<()> {
        let mut registry = self.registry.lock().await;
        if registry.records().is_empty() {
            let cwd =
                std::env::current_dir().context("Failed to determine current working directory")?;
            let mut descriptor = if locate_config(&cwd).is_ok() {
                ProjectDescriptor::load(&cwd)?
            } else {
                let name = cwd
                    .file_name()
                    .and_then(|os| os.to_str())
                    .unwrap_or("Re-prod Project");
                ProjectDescriptor::create(&cwd, name, None)?
            };
            descriptor.config.touch_opened();
            descriptor.update_config()?;
            registry.upsert(ProjectRecord::from(&descriptor));
            registry.save()?;
        }
        drop(registry);
        Ok(())
    }

    async fn register_project(
        &self,
        mut descriptor: ProjectDescriptor,
    ) -> Result<ProjectDescriptor> {
        descriptor.config.touch_opened();
        descriptor.update_config()?;
        let mut registry = self.registry.lock().await;
        registry.upsert(ProjectRecord::from(&descriptor));
        registry.save()?;
        drop(registry);
        Ok(descriptor)
    }

    async fn load_descriptor(&self, project_id: &str) -> Result<ProjectDescriptor> {
        let registry = self.registry.lock().await;
        let record = registry
            .records()
            .iter()
            .find(|entry| entry.id == project_id)
            .cloned()
            .ok_or_else(|| anyhow!("Unknown project id {}", project_id))?;
        drop(registry);

        let path = PathBuf::from(record.path);
        match ProjectDescriptor::load(&path) {
            Ok(descriptor) => Ok(descriptor),
            Err(error) => {
                tracing::warn!(
                    "Project config missing for {}: {}. Recreating default config.",
                    path.display(),
                    error
                );

                ProjectDescriptor::ensure_layout(&path)?;

                let mut config = ProjectConfig::new(&record.name, record.git_remote.clone());
                config.id = record.id.clone();
                if record.created_at > 0 {
                    config.created_at = record.created_at;
                }
                config.last_opened_at = record.last_opened_at;

                let config_path = default_config_path(&path);
                config.save(&config_path)?;

                Ok(ProjectDescriptor {
                    config,
                    root_path: path,
                    config_path,
                })
            }
        }
    }
    async fn refresh_registry(&self, descriptor: &ProjectDescriptor) -> Result<()> {
        let mut registry = self.registry.lock().await;
        registry.upsert(ProjectRecord::from(descriptor));
        registry.save()
    }
}
