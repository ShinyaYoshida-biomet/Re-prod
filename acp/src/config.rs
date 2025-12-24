use std::path::PathBuf;

use anyhow::{bail, Result};
use reprod_core::config::app_config_dir;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

pub const ACP_MODE_API: &str = "api";
pub const ACP_MODE_EXTERNAL_AGENT: &str = "external_agent";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpConfig {
    #[serde(default = "default_mode")]
    pub active_mode: String,
    pub active_agent: Option<String>,
}

fn default_mode() -> String {
    ACP_MODE_API.to_string()
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
    info!(path = %path.display(), "Loading ACP config");
    if path.exists() {
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(err) => {
                error!(path = %path.display(), error = %err, "Failed to read ACP config");
                return Err(err.into());
            }
        };
        let cfg: AcpConfig = match serde_json::from_str(&content) {
            Ok(cfg) => cfg,
            Err(err) => {
                error!(path = %path.display(), error = %err, "Failed to parse ACP config");
                return Err(err.into());
            }
        };
        info!(path = %path.display(), "Loaded ACP config");
        Ok(cfg)
    } else {
        warn!(path = %path.display(), "ACP config not found; using defaults");
        Ok(AcpConfig::default())
    }
}

pub fn save_acp_config(cfg: &AcpConfig) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = match serde_json::to_string_pretty(cfg) {
        Ok(content) => content,
        Err(err) => {
            error!(path = %path.display(), error = %err, "Failed to serialize ACP config");
            return Err(err.into());
        }
    };
    if let Err(err) = std::fs::write(&path, content) {
        error!(path = %path.display(), error = %err, "Failed to write ACP config");
        return Err(err.into());
    }
    info!(path = %path.display(), "Saved ACP config");
    Ok(())
}

pub fn normalize_active_mode(mode: &str) -> Result<String> {
    let normalized = mode.to_lowercase();
    if normalized != ACP_MODE_API && normalized != ACP_MODE_EXTERNAL_AGENT {
        bail!("Invalid active_mode; use 'api' or 'external_agent'");
    }
    Ok(normalized)
}

pub fn is_external_mode(mode: &str) -> bool {
    mode == ACP_MODE_EXTERNAL_AGENT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_active_mode() {
        assert_eq!(normalize_active_mode("API").unwrap(), ACP_MODE_API);
        assert_eq!(
            normalize_active_mode("external_agent").unwrap(),
            ACP_MODE_EXTERNAL_AGENT
        );
    }

    #[test]
    fn rejects_invalid_mode() {
        let err = normalize_active_mode("other").unwrap_err();
        assert!(err.to_string().contains("Invalid active_mode"));
    }
}
