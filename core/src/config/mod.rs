use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub r_path: String,
    pub anthropic_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    #[serde(default = "default_ai_provider")]
    pub default_ai_provider: String,
    #[serde(default = "default_active_models")]
    pub active_models: HashMap<String, String>,
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
    /// Load config from ~/.reprod/auth.json (Codex pattern)
    pub fn load() -> Result<Self> {
        let config_path = Self::config_path()?;

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(config_path)?;
        let config = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Save config to ~/.reprod/auth.json
    pub fn save(&self) -> Result<()> {
        let config_path = Self::config_path()?;

        // Ensure parent directory exists
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(config_path, content)?;
        Ok(())
    }

    /// Get config path: ~/.reprod/auth.json
    fn config_path() -> Result<PathBuf> {
        let home =
            dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Could not find home directory"))?;
        Ok(home.join(".reprod").join("auth.json"))
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
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

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
}
