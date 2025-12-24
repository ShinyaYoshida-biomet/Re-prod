use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, env, fs, path::Path, path::PathBuf};

pub const APP_DIR_ENV: &str = "REPROD_APP_DIR";
const LEGACY_DIR_NAME: &str = ".reprod";
const APP_DIR_NAME: &str = "Re-prod";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub r_path: String,
    pub anthropic_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    #[serde(default = "default_ai_provider")]
    pub default_ai_provider: String,
    #[serde(default = "default_active_models")]
    pub active_models: HashMap<String, String>,
    #[serde(skip)]
    source_path: Option<PathBuf>,
}

fn default_ai_provider() -> String {
    "openai".to_string()
}

fn default_active_models() -> HashMap<String, String> {
    HashMap::from([
        ("openai".to_string(), "gpt-4o".to_string()),
        (
            "anthropic".to_string(),
            "claude-3-5-sonnet-20240620".to_string(),
        ),
    ])
}

impl Config {
    pub fn model_for(&self, provider: &str) -> String {
        self.active_models
            .get(provider)
            .cloned()
            .unwrap_or_else(|| {
                default_active_models()
                    .get(provider)
                    .cloned()
                    .unwrap_or_else(|| "gpt-4o".to_string())
            })
    }
}

impl Config {
    /// Load config with priority: project auth.json → global app config → legacy ~/.reprod → default.
    pub fn load_with_project(project_root: Option<&Path>) -> Result<Self> {
        if let Some(root) = project_root {
            let project_auth = project_auth_path(root);
            if project_auth.exists() {
                return Self::load_from_path(project_auth);
            }
        }

        let global_path = global_auth_path()?;
        if global_path.exists() {
            return Self::load_from_path(global_path);
        }

        if let Some(legacy) = legacy_auth_path() {
            if legacy.exists() {
                let config = Self::load_from_path(legacy)?;
                // Migrate legacy → global path for future reads.
                if let Some(parent) = global_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                let content = serde_json::to_string_pretty(&config)?;
                fs::write(&global_path, content)?;
                return Ok(Self {
                    source_path: Some(global_path),
                    ..config
                });
            }
        }

        Ok(Self {
            source_path: Some(global_path),
            ..Self::default()
        })
    }

    /// Load config without a project context (global first, then legacy, then default).
    pub fn load() -> Result<Self> {
        Self::load_with_project(None)
    }

    fn load_from_path(path: PathBuf) -> Result<Self> {
        let content = std::fs::read_to_string(&path)?;
        let mut config: Self = serde_json::from_str(&content)?;
        config.source_path = Some(path);
        Ok(config)
    }

    /// Save config to the path it was loaded from, or the global path if unset.
    pub fn save(&self) -> Result<()> {
        let path = self
            .source_path
            .clone()
            .unwrap_or_else(|| global_auth_path().expect("Failed to resolve config path"));

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        Ok(())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            r_path: "Rscript".to_string(),
            anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
            openai_api_key: std::env::var("OPENAI_API_KEY").ok(),
            default_ai_provider: default_ai_provider(),
            active_models: default_active_models(),
            source_path: Some(global_auth_path().unwrap_or_else(|_| PathBuf::from("auth.json"))),
        }
    }
}

pub fn app_config_dir() -> Result<PathBuf> {
    if let Ok(path) = env::var(APP_DIR_ENV) {
        return Ok(PathBuf::from(path));
    }
    dirs::config_dir()
        .map(|p| p.join(APP_DIR_NAME))
        .ok_or_else(|| anyhow::anyhow!("Could not find OS config directory"))
}

pub fn global_auth_path() -> Result<PathBuf> {
    Ok(app_config_dir()?.join("auth.json"))
}

fn legacy_auth_path() -> Option<PathBuf> {
    if let Ok(home) = env::var("HOME") {
        return Some(PathBuf::from(home).join(LEGACY_DIR_NAME).join("auth.json"));
    }
    #[cfg(windows)]
    {
        if let Ok(home) = env::var("USERPROFILE") {
            return Some(PathBuf::from(home).join(LEGACY_DIR_NAME).join("auth.json"));
        }
    }
    dirs::home_dir().map(|home| home.join(LEGACY_DIR_NAME).join("auth.json"))
}

fn project_auth_path(root: &Path) -> PathBuf {
    root.join(".reprod").join("auth.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, fs, sync::Mutex};
    use tempfile::tempdir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_env_lock<T>(f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap();
        f()
    }

    fn write_config(path: &Path, cfg: &Config) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let json = serde_json::to_string_pretty(cfg).unwrap();
        fs::write(path, json).unwrap();
    }

    fn set_env_var(key: &str, value: &str) -> Option<String> {
        let prev = env::var(key).ok();
        env::set_var(key, value);
        prev
    }

    fn restore_env_var(key: &str, prev: Option<String>) {
        match prev {
            Some(val) => env::set_var(key, val),
            None => env::remove_var(key),
        }
    }

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.r_path, "Rscript");
        assert_eq!(config.default_ai_provider, "openai");
        assert_eq!(config.model_for("openai"), "gpt-4o".to_string());
    }

    #[test]
    fn test_default_ai_provider() {
        assert_eq!(default_ai_provider(), "openai");
    }

    #[test]
    fn test_config_serialization() {
        let config = Config {
            r_path: "/usr/bin/Rscript".to_string(),
            anthropic_api_key: Some("test-anthropic-key".to_string()),
            openai_api_key: Some("test-openai-key".to_string()),
            default_ai_provider: "anthropic".to_string(),
            active_models: HashMap::from([
                (
                    "anthropic".to_string(),
                    "claude-3-5-sonnet-20240620".to_string(),
                ),
                ("openai".to_string(), "gpt-4o".to_string()),
            ]),
            source_path: None,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("r_path"));
        assert!(json.contains("/usr/bin/Rscript"));
        assert!(json.contains("anthropic_api_key"));
        assert!(json.contains("test-anthropic-key"));
        assert!(json.contains("openai_api_key"));
        assert!(json.contains("test-openai-key"));
        assert!(json.contains("default_ai_provider"));
        assert!(json.contains("anthropic"));
    }

    #[test]
    fn test_config_deserialization() {
        let json = r#"{
            "r_path": "/custom/path/Rscript",
            "anthropic_api_key": "key123",
            "openai_api_key": "key456",
            "default_ai_provider": "anthropic"
        }"#;

        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.r_path, "/custom/path/Rscript");
        assert_eq!(config.anthropic_api_key, Some("key123".to_string()));
        assert_eq!(config.openai_api_key, Some("key456".to_string()));
        assert_eq!(config.default_ai_provider, "anthropic");
        assert_eq!(config.model_for("openai"), "gpt-4o".to_string());
    }

    #[test]
    fn test_config_deserialization_with_missing_optional_fields() {
        let json = r#"{
            "r_path": "Rscript"
        }"#;

        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.r_path, "Rscript");
        assert_eq!(config.anthropic_api_key, None);
        assert_eq!(config.openai_api_key, None);
        assert_eq!(config.default_ai_provider, "openai"); // default value
        assert_eq!(
            config.model_for("anthropic"),
            "claude-3-5-sonnet-20240620".to_string()
        );
    }

    #[test]
    fn test_config_deserialization_with_null_api_keys() {
        let json = r#"{
            "r_path": "Rscript",
            "anthropic_api_key": null,
            "openai_api_key": null,
            "default_ai_provider": "openai"
        }"#;

        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.anthropic_api_key, None);
        assert_eq!(config.openai_api_key, None);
        assert_eq!(config.model_for("openai"), "gpt-4o".to_string());
    }

    #[test]
    fn test_config_roundtrip() {
        let original = Config {
            r_path: "/usr/local/bin/Rscript".to_string(),
            anthropic_api_key: Some("anthropic123".to_string()),
            openai_api_key: None,
            default_ai_provider: "anthropic".to_string(),
            active_models: HashMap::from([(
                "anthropic".to_string(),
                "claude-3-5-sonnet-20240620".to_string(),
            )]),
            source_path: None,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: Config = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.r_path, original.r_path);
        assert_eq!(deserialized.anthropic_api_key, original.anthropic_api_key);
        assert_eq!(deserialized.openai_api_key, original.openai_api_key);
        assert_eq!(
            deserialized.default_ai_provider,
            original.default_ai_provider
        );
        assert_eq!(
            deserialized.model_for("anthropic"),
            "claude-3-5-sonnet-20240620".to_string()
        );
    }

    #[test]
    fn test_config_save_and_load() {
        let temp_dir = env::temp_dir();
        let test_config_path = temp_dir.join(format!("reprod-test-{}.json", uuid::Uuid::new_v4()));

        // Override config_path for testing
        let config = Config {
            r_path: "/test/path/Rscript".to_string(),
            anthropic_api_key: Some("test-key".to_string()),
            openai_api_key: None,
            default_ai_provider: "anthropic".to_string(),
            active_models: default_active_models(),
            source_path: None,
        };

        // Manually save to temp location
        let json = serde_json::to_string_pretty(&config).unwrap();
        std::fs::write(&test_config_path, json).unwrap();

        // Load and verify
        let content = std::fs::read_to_string(&test_config_path).unwrap();
        let loaded: Config = serde_json::from_str(&content).unwrap();

        assert_eq!(loaded.r_path, config.r_path);
        assert_eq!(loaded.anthropic_api_key, config.anthropic_api_key);
        assert_eq!(loaded.default_ai_provider, config.default_ai_provider);

        // Cleanup
        std::fs::remove_file(test_config_path).ok();
    }

    #[test]
    fn test_config_with_both_api_keys() {
        let config = Config {
            r_path: "Rscript".to_string(),
            anthropic_api_key: Some("anthropic-key".to_string()),
            openai_api_key: Some("openai-key".to_string()),
            default_ai_provider: "openai".to_string(),
            active_models: default_active_models(),
            source_path: None,
        };

        assert!(config.anthropic_api_key.is_some());
        assert!(config.openai_api_key.is_some());
        assert_eq!(config.default_ai_provider, "openai");
    }

    #[test]
    fn test_config_with_custom_r_path() {
        let config = Config {
            r_path: "/opt/R/4.3.0/bin/Rscript".to_string(),
            anthropic_api_key: None,
            openai_api_key: None,
            default_ai_provider: "openai".to_string(),
            active_models: default_active_models(),
            source_path: None,
        };

        assert_eq!(config.r_path, "/opt/R/4.3.0/bin/Rscript");
    }

    #[test]
    fn test_default_provider_is_openai() {
        let config = Config::default();
        assert_eq!(config.default_ai_provider, "openai");
    }

    #[test]
    fn test_config_clone() {
        let config = Config::default();
        let cloned = config.clone();

        assert_eq!(config.r_path, cloned.r_path);
        assert_eq!(config.default_ai_provider, cloned.default_ai_provider);
        assert_eq!(config.model_for("openai"), cloned.model_for("openai"));
    }

    #[test]
    fn test_project_auth_precedence_and_save_path() {
        with_env_lock(|| {
            let temp = tempdir().unwrap();
            let app_dir = temp.path().join("appdata");
            let project_dir = temp.path().join("project");
            let project_auth = project_dir.join(".reprod").join("auth.json");
            let global_auth = app_dir.join("auth.json");

            let prev_app = set_env_var(APP_DIR_ENV, app_dir.to_string_lossy().as_ref());

            let project_cfg = Config {
                r_path: "project-R".to_string(),
                anthropic_api_key: Some("proj-key".to_string()),
                openai_api_key: None,
                default_ai_provider: default_ai_provider(),
                active_models: default_active_models(),
                source_path: None,
            };
            write_config(&project_auth, &project_cfg);

            let global_cfg = Config {
                r_path: "global-R".to_string(),
                anthropic_api_key: Some("global-key".to_string()),
                openai_api_key: None,
                default_ai_provider: default_ai_provider(),
                active_models: default_active_models(),
                source_path: None,
            };
            write_config(&global_auth, &global_cfg);

            let mut loaded = Config::load_with_project(Some(project_dir.as_path())).unwrap();
            assert_eq!(loaded.r_path, "project-R");
            assert_eq!(loaded.anthropic_api_key.as_deref(), Some("proj-key"));

            loaded.openai_api_key = Some("new-key".to_string());
            loaded.save().unwrap();

            let saved_project: Config =
                serde_json::from_str(&fs::read_to_string(&project_auth).unwrap()).unwrap();
            assert_eq!(saved_project.openai_api_key.as_deref(), Some("new-key"));

            let saved_global: Config =
                serde_json::from_str(&fs::read_to_string(&global_auth).unwrap()).unwrap();
            assert_eq!(
                saved_global.anthropic_api_key.as_deref(),
                Some("global-key")
            );

            restore_env_var(APP_DIR_ENV, prev_app);
        });
    }

    #[test]
    fn test_legacy_migrates_to_app_dir() {
        with_env_lock(|| {
            let temp = tempdir().unwrap();
            let app_dir = temp.path().join("appdata");
            let home_dir = temp.path().join("home");
            let legacy = home_dir.join(".reprod").join("auth.json");
            let global = app_dir.join("auth.json");

            let prev_app = set_env_var(APP_DIR_ENV, app_dir.to_string_lossy().as_ref());
            let prev_home = set_env_var("HOME", home_dir.to_string_lossy().as_ref());

            let legacy_cfg = Config {
                r_path: "legacy-R".to_string(),
                anthropic_api_key: Some("legacy-key".to_string()),
                openai_api_key: None,
                default_ai_provider: default_ai_provider(),
                active_models: default_active_models(),
                source_path: None,
            };
            write_config(&legacy, &legacy_cfg);

            let loaded = Config::load_with_project(None).unwrap();
            assert_eq!(loaded.r_path, "legacy-R");
            assert_eq!(loaded.anthropic_api_key.as_deref(), Some("legacy-key"));
            assert!(global.exists());

            let migrated: Config =
                serde_json::from_str(&fs::read_to_string(&global).unwrap()).unwrap();
            assert_eq!(migrated.anthropic_api_key.as_deref(), Some("legacy-key"));

            restore_env_var(APP_DIR_ENV, prev_app);
            restore_env_var("HOME", prev_home);
        });
    }
}
