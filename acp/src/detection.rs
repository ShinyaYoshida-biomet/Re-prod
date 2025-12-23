use std::path::{Path, PathBuf};

use anyhow::Result;
use which::which;

use crate::config::AcpConfig;
use crate::types::AcpDetectedAgent;

struct KnownAgent {
    id: &'static str,
    name: &'static str,
    commands: &'static [&'static str],
}

const KNOWN_AGENTS: &[KnownAgent] = &[
    KnownAgent {
        id: "claude-code-acp",
        name: "Claude Code (ACP)",
        commands: &["claude-code-acp"],
    },
    KnownAgent {
        id: "codex",
        name: "Codex CLI",
        commands: &["codex", "codex-cli"],
    },
    KnownAgent {
        id: "gemini",
        name: "Gemini CLI",
        commands: &["gemini", "gemini-cli"],
    },
];

/// Locate an agent binary, honoring absolute/path-like inputs and Windows `.cmd` fallbacks.
pub fn find_agent_binary(command: &str) -> Option<PathBuf> {
    let path_like = Path::new(command);
    if path_like.is_absolute() || command.contains(std::path::MAIN_SEPARATOR) {
        if path_like.exists() {
            return Some(path_like.to_path_buf());
        }
        #[cfg(windows)]
        {
            let with_cmd = path_like.with_extension("cmd");
            if with_cmd.exists() {
                return Some(with_cmd);
            }
            let with_exe = path_like.with_extension("exe");
            if with_exe.exists() {
                return Some(with_exe);
            }
        }
    }

    if let Ok(path) = which(command) {
        return Some(path);
    }

    #[cfg(windows)]
    {
        if !command.to_ascii_lowercase().ends_with(".cmd") {
            if let Ok(path) = which(format!("{command}.cmd")) {
                return Some(path);
            }
        }
        if !command.to_ascii_lowercase().ends_with(".exe") {
            if let Ok(path) = which(format!("{command}.exe")) {
                return Some(path);
            }
        }
    }

    None
}

pub fn detect_agents() -> Result<Vec<AcpDetectedAgent>> {
    let mut detected = Vec::new();
    for agent in KNOWN_AGENTS {
        let mut found_cmd = None;
        let mut found_path: Option<PathBuf> = None;
        for &cmd in agent.commands {
            if let Some(path) = find_agent_binary(cmd) {
                found_cmd = Some(cmd.to_string());
                found_path = Some(path);
                break;
            }
        }

        detected.push(AcpDetectedAgent {
            id: agent.id.to_string(),
            name: agent.name.to_string(),
            command: found_cmd
                .clone()
                .unwrap_or_else(|| agent.commands[0].to_string()),
            available: found_cmd.is_some(),
            path: found_path,
        });
    }
    Ok(detected)
}

pub fn resolve_active_agent_command(
    cfg: &AcpConfig,
    detected: &[AcpDetectedAgent],
) -> Option<String> {
    if cfg.active_mode != crate::config::ACP_MODE_EXTERNAL_AGENT {
        return None;
    }
    let active_id = cfg.active_agent.as_deref()?;
    detected
        .iter()
        .find(|agent| agent.id == active_id && agent.available)
        .map(|agent| {
            agent
                .path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| agent.command.clone())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_absolute_binary() {
        let temp = std::env::temp_dir().join(format!("acp-detect-{}", std::process::id()));
        std::fs::write(&temp, b"echo").unwrap();
        let path = find_agent_binary(temp.to_str().unwrap());
        assert_eq!(path.as_deref(), Some(temp.as_path()));
        let _ = std::fs::remove_file(&temp);
    }

    #[cfg(windows)]
    #[test]
    fn falls_back_to_cmd_extension() {
        let temp_dir = std::env::temp_dir();
        let cmd_path = temp_dir.join("acp-detect-cmd.cmd");
        std::fs::write(&cmd_path, b"echo off").unwrap();
        let path = find_agent_binary("acp-detect-cmd");
        assert_eq!(path.as_deref(), Some(cmd_path.as_path()));
        let _ = std::fs::remove_file(&cmd_path);
    }

    #[test]
    fn resolves_active_agent_command_from_config() {
        let cfg = AcpConfig {
            active_mode: crate::config::ACP_MODE_EXTERNAL_AGENT.to_string(),
            active_agent: Some("codex".to_string()),
        };
        let detected = vec![
            AcpDetectedAgent {
                id: "codex".to_string(),
                name: "Codex CLI".to_string(),
                command: "codex".to_string(),
                available: true,
                path: None,
            },
            AcpDetectedAgent {
                id: "gemini".to_string(),
                name: "Gemini CLI".to_string(),
                command: "gemini".to_string(),
                available: false,
                path: None,
            },
        ];

        let resolved = resolve_active_agent_command(&cfg, &detected);
        assert_eq!(resolved.as_deref(), Some("codex"));
    }
}
