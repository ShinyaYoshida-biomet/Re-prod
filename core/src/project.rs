use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::config::app_config_dir;

const REGISTRY_VERSION: u32 = 1;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
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

#[derive(Debug, Serialize, Deserialize)]
struct RegistryDocument {
    version: u32,
    #[serde(default)]
    projects: Vec<ProjectRecord>,
}

impl Default for RegistryDocument {
    fn default() -> Self {
        Self {
            version: REGISTRY_VERSION,
            projects: Vec::new(),
        }
    }
}

pub struct ProjectRegistry {
    path: PathBuf,
    doc: RegistryDocument,
}

impl ProjectRegistry {
    pub fn load(path: PathBuf) -> Result<Self> {
        if !path.exists() {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!(
                        "Failed to create project registry directory {}",
                        parent.display()
                    )
                })?;
            }
            return Ok(Self {
                path,
                doc: RegistryDocument::default(),
            });
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        let doc: RegistryDocument =
            serde_json::from_str(&content).context("Failed to parse project registry")?;
        Ok(Self { path, doc })
    }

    pub fn records(&self) -> &[ProjectRecord] {
        &self.doc.projects
    }

    pub fn upsert(&mut self, record: ProjectRecord) {
        if let Some(existing) = self
            .doc
            .projects
            .iter_mut()
            .find(|entry| entry.id == record.id)
        {
            *existing = record;
        } else {
            self.doc.projects.push(record);
        }
    }

    pub fn remove(&mut self, project_id: &str) {
        self.doc.projects.retain(|entry| entry.id != project_id);
    }

    pub fn save(&self) -> Result<()> {
        let content =
            serde_json::to_string_pretty(&self.doc).context("Failed to serialize registry")?;
        fs::write(&self.path, content)
            .with_context(|| format!("Failed to write {}", self.path.display()))
    }
}

pub fn default_registry_path() -> Result<PathBuf> {
    let new_path = app_config_dir()?.join("projects.json");
    if new_path.exists() {
        return Ok(new_path);
    }

    if let Some(legacy) = legacy_registry_path() {
        if legacy.exists() {
            if let Some(parent) = new_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&legacy, &new_path)
                .with_context(|| format!("Failed to migrate registry from {}", legacy.display()))?;
            return Ok(new_path);
        }
    }

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(new_path)
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

fn legacy_registry_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".reprod").join("projects.json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::APP_DIR_ENV;
    use std::sync::Mutex;
    use tempfile::tempdir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_env_lock<T>(f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap();
        f()
    }

    fn set_env_var(key: &str, value: &str) -> Option<String> {
        let prev = std::env::var(key).ok();
        std::env::set_var(key, value);
        prev
    }

    fn restore_env_var(key: &str, prev: Option<String>) {
        match prev {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    fn test_registry_path_migrates_from_legacy() {
        with_env_lock(|| {
            let temp = tempdir().unwrap();
            let app_dir = temp.path().join("appdata");
            let home_dir = temp.path().join("home");

            let prev_app = set_env_var(APP_DIR_ENV, app_dir.to_string_lossy().as_ref());
            let prev_home = set_env_var("HOME", home_dir.to_string_lossy().as_ref());

            let legacy = home_dir.join(".reprod").join("projects.json");
            std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
            std::fs::write(
                &legacy,
                r#"{"version":1,"projects":[{"id":"1","name":"legacy","path":"/tmp","created_at":1,"last_opened_at":null}]}"#,
            )
            .unwrap();

            let expected = app_config_dir().unwrap().join("projects.json");
            let path = default_registry_path().unwrap();
            assert_eq!(path, expected);
            assert!(path.exists());

            let migrated = std::fs::read_to_string(path).unwrap();
            assert!(migrated.contains("legacy"));

            restore_env_var(APP_DIR_ENV, prev_app);
            restore_env_var("HOME", prev_home);
        });
    }
}
