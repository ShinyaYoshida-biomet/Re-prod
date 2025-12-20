use std::path::PathBuf;

use anyhow::Result;
use reprod_core::config::app_config_dir;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpConfig {
    #[serde(default = "default_mode")]
    pub active_mode: String,
    pub active_agent: Option<String>,
}

fn default_mode() -> String {
    "api".to_string()
}

impl Default for AcpConfig {
    fn default() -> Self {
        Self {
            active_mode: default_mode(),
            active_agent: None,
        }
    }
}

fn config_path() -> Result<PathBuf> {
    Ok(app_config_dir()?.join("acp.json"))
}

pub fn load_acp_config() -> Result<AcpConfig> {
    let path = config_path()?;
    if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        let cfg: AcpConfig = serde_json::from_str(&content)?;
        Ok(cfg)
    } else {
        Ok(AcpConfig::default())
    }
}

pub fn save_acp_config(cfg: &AcpConfig) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(cfg)?;
    std::fs::write(path, content)?;
    Ok(())
}
