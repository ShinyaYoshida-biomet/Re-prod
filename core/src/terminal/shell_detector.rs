use std::env;
use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ShellDetectionError {
    #[error("No shell detected")]
    ShellNotFound,

    #[error("Failed to interpret shell path")]
    InvalidShellPath,
}

/// Information about the shell to launch inside the PTY.
#[derive(Clone, Debug)]
pub struct ShellInfo {
    pub program: String,
    pub args: Vec<String>,
}

impl ShellInfo {
    const fn with_args(program: String, args: Vec<String>) -> Self {
        Self { program, args }
    }
}

/// Detect the user's preferred shell, with optional override.
///
/// # Arguments
/// * `shell_override` - Optional shell command to use instead of detection
///
/// # Returns
/// * `Ok(ShellInfo)` - Detected or specified shell info
/// * `Err(ShellDetectionError)` - If no shell could be found
pub fn detect_shell(shell_override: Option<String>) -> Result<ShellInfo, ShellDetectionError> {
    if let Some(shell) = shell_override {
        return Ok(parse_shell_command(shell));
    }

    #[cfg(unix)]
    {
        if let Some(shell_path) = env::var_os("SHELL") {
            if let Some(shell_info) = shell_from_path(PathBuf::from(shell_path)) {
                return Ok(shell_info);
            }
        }

        for fallback in &["/bin/zsh", "/bin/bash"] {
            if PathBuf::from(fallback).exists() {
                return Ok(ShellInfo::with_args(fallback.to_string(), Vec::new()));
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(comspec) = env::var("COMSPEC") {
            return Ok(ShellInfo::with_args(comspec, Vec::new()));
        }

        const FALLBACKS: &[(&str, &[&str])] = &[
            ("pwsh.exe", &["-NoLogo"]),
            ("powershell.exe", &["-NoLogo"]),
            ("cmd.exe", &[]),
        ];

        for &(program, args) in FALLBACKS {
            if executable_in_path(program) {
                return Ok(ShellInfo::with_args(
                    program.to_string(),
                    args.iter().map(|value| value.to_string()).collect(),
                ));
            }
        }

        if env::var_os("WSL_DISTRO_NAME").is_some() && executable_in_path("wsl.exe") {
            return Ok(ShellInfo::with_args(
                "wsl.exe".to_string(),
                vec!["-e".to_string(), "bash".to_string()],
            ));
        }
    }

    Err(ShellDetectionError::ShellNotFound)
}

fn parse_shell_command(raw: String) -> ShellInfo {
    let mut parts = raw
        .split_whitespace()
        .map(|part| part.to_string())
        .collect::<Vec<_>>();

    if parts.is_empty() {
        return ShellInfo::with_args(raw, Vec::new());
    }

    let program = parts.remove(0);
    ShellInfo::with_args(program, parts)
}

fn shell_from_path(path: PathBuf) -> Option<ShellInfo> {
    let program = path.to_string_lossy().to_string();
    if program.is_empty() {
        return None;
    }

    Some(ShellInfo::with_args(program, Vec::new()))
}

#[cfg(windows)]
fn executable_in_path(name: &str) -> bool {
    env::var_os("PATH")
        .and_then(|paths| {
            env::split_paths(&paths).find(|dir| {
                let candidate = dir.join(name);
                candidate.exists()
            })
        })
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_shell_command_simple() {
        let info = parse_shell_command("/bin/bash".to_string());
        assert_eq!(info.program, "/bin/bash");
        assert!(info.args.is_empty());
    }

    #[test]
    fn test_parse_shell_command_with_args() {
        let info = parse_shell_command("/bin/bash -l -i".to_string());
        assert_eq!(info.program, "/bin/bash");
        assert_eq!(info.args, vec!["-l", "-i"]);
    }

    #[test]
    fn test_detect_shell_with_override() {
        let result = detect_shell(Some("/usr/bin/fish -l".to_string()));
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.program, "/usr/bin/fish");
        assert_eq!(info.args, vec!["-l"]);
    }
}
