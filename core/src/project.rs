use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub git_remote: Option<String>,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub last_opened_at: Option<u64>,
    #[serde(default = "default_version")]
    pub version: u32,
}

fn default_version() -> u32 {
    1
}

impl ProjectConfig {
    pub fn new(name: &str, git_remote: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            git_remote,
            created_at: now_millis(),
            last_opened_at: None,
            version: default_version(),
        }
    }

    pub fn load(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)
            .with_context(|| format!("Failed to read project config {}", path.display()))?;
        let mut config: Self =
            serde_json::from_str(&content).context("Failed to parse project config")?;
        if config.version == 0 {
            config.version = default_version();
        }
        if config.created_at == 0 {
            config.created_at = now_millis();
        }
        Ok(config)
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create project config dir {}", parent.display())
            })?;
        }
        let content =
            serde_json::to_string_pretty(self).context("Failed to serialize project config")?;
        fs::write(path, content)
            .with_context(|| format!("Failed to write project config {}", path.display()))
    }

    pub fn touch_opened(&mut self) {
        self.last_opened_at = Some(now_millis());
    }
}

#[derive(Debug, Clone)]
pub struct ProjectDescriptor {
    pub config: ProjectConfig,
    pub root_path: PathBuf,
    pub config_path: PathBuf,
}

impl ProjectDescriptor {
    pub fn load(root: &Path) -> Result<Self> {
        let config_path = locate_config(root)?;
        let config = ProjectConfig::load(&config_path)?;
        Ok(Self {
            config,
            root_path: root.to_path_buf(),
            config_path,
        })
    }

    pub fn create(root: &Path, name: &str, git_remote: Option<String>) -> Result<Self> {
        let config_path = default_config_path(root);
        let config = ProjectConfig::new(name, git_remote);
        config.save(&config_path)?;
        Ok(Self {
            config,
            root_path: root.to_path_buf(),
            config_path,
        })
    }

    pub fn update_config(&mut self) -> Result<()> {
        self.config.save(&self.config_path)
    }

    pub fn ensure_layout(root: &Path) -> Result<()> {
        let meta_dir = root.join(".reprod");
        fs::create_dir_all(&meta_dir).with_context(|| {
            format!(
                "Failed to create project metadata directory {}",
                meta_dir.display()
            )
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    #[ts(type = "number")]
    pub created_at: u64,
    #[ts(type = "number | null")]
    pub last_opened_at: Option<u64>,
    #[serde(default)]
    pub git_remote: Option<String>,
}

impl From<&ProjectDescriptor> for ProjectRecord {
    fn from(project: &ProjectDescriptor) -> Self {
        Self {
            id: project.config.id.clone(),
            name: project.config.name.clone(),
            path: project.root_path.to_string_lossy().into_owned(),
            created_at: project.config.created_at,
            last_opened_at: project.config.last_opened_at,
            git_remote: project.config.git_remote.clone(),
        }
    }
}

pub fn locate_config(root: &Path) -> Result<PathBuf> {
    let primary = default_config_path(root);
    if primary.exists() {
        return Ok(primary);
    }

    let legacy = root.join("reprod.json");
    if legacy.exists() {
        return Ok(legacy);
    }

    Err(anyhow::anyhow!(
        "No project config found in {}",
        root.display()
    ))
}

pub fn default_config_path(root: &Path) -> PathBuf {
    root.join(".reprod").join("config.json")
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
