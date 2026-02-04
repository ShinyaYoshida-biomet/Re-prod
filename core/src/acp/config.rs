use std::path::PathBuf;

use crate::config::{app_config_dir, workspace_root_override};
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

pub const ACP_MODE_API: &str = "api";
pub const ACP_MODE_EXTERNAL_AGENT: &str = "external_agent";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpConfig {
    #[serde(default = "default_mode")]
    pub active_mode: String,
    pub active_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_agent_command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_agent_args: Option<Vec<String>>,
}

fn default_mode() -> String {
    ACP_MODE_API.to_string()
}

impl Default for AcpConfig {
    fn default() -> Self {
        Self {
            active_mode: default_mode(),
            active_agent: None,
            active_agent_command: None,
            active_agent_args: None,
        }
    }
}

fn config_path() -> Result<PathBuf> {
    Ok(app_config_dir()?.join("acp.json"))
}

fn fallback_config_path() -> Option<PathBuf> {
    workspace_root_override()
        .or_else(|| std::env::current_dir().ok())
        .map(|root| root.join(".reprod").join("acp.json"))
}

fn read_config_from_path(path: &PathBuf) -> Result<AcpConfig> {
    let content = match std::fs::read_to_string(path) {
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
    Ok(cfg)
}

fn write_config_to_path(path: &PathBuf, cfg: &AcpConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        if let Err(err) = std::fs::create_dir_all(parent) {
            error!(
                path = %path.display(),
                error = %err,
                "Failed to create ACP config directory"
            );
            return Err(err.into());
        }
    }
    let content = match serde_json::to_string_pretty(cfg) {
        Ok(content) => content,
        Err(err) => {
            error!(path = %path.display(), error = %err, "Failed to serialize ACP config");
            return Err(err.into());
        }
    };
    if let Err(err) = std::fs::write(path, content) {
        error!(path = %path.display(), error = %err, "Failed to write ACP config");
        return Err(err.into());
    }
    Ok(())
}

pub fn load_acp_config() -> Result<AcpConfig> {
    let primary = config_path().ok();
    if let Some(path) = primary {
        info!(path = %path.display(), "Loading ACP config");
        if path.exists() {
            let cfg = read_config_from_path(&path)?;
            info!(path = %path.display(), "Loaded ACP config");
            return Ok(cfg);
        }
        warn!(path = %path.display(), "ACP config not found; checking fallback");
    } else {
        warn!("ACP config path unavailable; checking fallback");
    }

    if let Some(fallback) = fallback_config_path() {
        info!(path = %fallback.display(), "Loading ACP config (fallback)");
        if fallback.exists() {
            let cfg = read_config_from_path(&fallback)?;
            info!(path = %fallback.display(), "Loaded ACP config (fallback)");
            return Ok(cfg);
        }
        warn!(
            path = %fallback.display(),
            "ACP config not found in fallback; using defaults"
        );
    } else {
        warn!("ACP fallback config path unavailable; using defaults");
    }

    Ok(AcpConfig::default())
}

pub fn save_acp_config(cfg: &AcpConfig) -> Result<()> {
    let primary = config_path().ok();
    if let Some(path) = primary {
        info!(path = %path.display(), "Saving ACP config");
        if write_config_to_path(&path, cfg).is_ok() {
            info!(path = %path.display(), "Saved ACP config");
            return Ok(());
        }
        warn!(path = %path.display(), "Failed to save ACP config; trying fallback");
    } else {
        warn!("ACP config path unavailable; trying fallback");
    }

    let fallback = fallback_config_path()
        .ok_or_else(|| anyhow::anyhow!("ACP fallback config path unavailable"))?;
    info!(path = %fallback.display(), "Saving ACP config (fallback)");
    write_config_to_path(&fallback, cfg)?;
    info!(path = %fallback.display(), "Saved ACP config (fallback)");
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
    use crate::acp::test_support::ENV_LOCK;
    use crate::config::{APP_DIR_ENV, WORKSPACE_ROOT_ENV};
    use std::{env, fs};

    fn with_env_lock<T>(f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap();
        f()
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

    #[test]
    fn loads_from_fallback_when_primary_missing() {
        with_env_lock(|| {
            let temp = env::temp_dir().join(format!("acp-fallback-{}", std::process::id()));
            let _ = fs::remove_dir_all(&temp);
            fs::create_dir_all(&temp).unwrap();

            let app_dir = temp.join("appdata");
            let prev_app = set_env_var(APP_DIR_ENV, app_dir.to_string_lossy().as_ref());
            let prev_root = set_env_var(WORKSPACE_ROOT_ENV, temp.to_string_lossy().as_ref());

            let fallback_dir = temp.join(".reprod");
            fs::create_dir_all(&fallback_dir).unwrap();
            fs::write(
                fallback_dir.join("acp.json"),
                r#"{"active_mode":"external_agent","active_agent":"codex"}"#,
            )
            .unwrap();

            let cfg = load_acp_config().unwrap();
            assert_eq!(cfg.active_mode, ACP_MODE_EXTERNAL_AGENT);
            assert_eq!(cfg.active_agent.as_deref(), Some("codex"));

            restore_env_var(WORKSPACE_ROOT_ENV, prev_root);
            restore_env_var(APP_DIR_ENV, prev_app);
        });
    }
}
