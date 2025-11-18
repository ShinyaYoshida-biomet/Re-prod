use std::env;
use std::path::Path;

/// Information about the shell to launch inside the PTY.
#[derive(Clone)]
pub struct ShellInfo {
    pub program: String,
    pub args: Vec<String>,
}

#[cfg(not(target_os = "windows"))]
const UNIX_FALLBACK_SHELLS: &[&str] = &[
    "/bin/zsh",
    "/bin/bash",
    "/usr/local/bin/zsh",
    "/usr/local/bin/bash",
    "/usr/bin/zsh",
    "/usr/bin/bash",
];

#[cfg(target_os = "windows")]
const POWERSHELL_PATH: &str = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";

pub fn detect_shell() -> ShellInfo {
    if let Ok(shell) = env::var("SHELL") {
        if !shell.trim().is_empty() {
            return ShellInfo {
                program: shell,
                args: vec!["-l".to_string()],
            };
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for candidate in UNIX_FALLBACK_SHELLS {
            if Path::new(candidate).exists() {
                return ShellInfo {
                    program: candidate.to_string(),
                    args: vec!["-l".to_string()],
                };
            }
        }

        ShellInfo {
            program: "/bin/bash".to_string(),
            args: vec!["-l".to_string()],
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(comspec) = env::var("COMSPEC") {
            if !comspec.trim().is_empty() {
                return ShellInfo {
                    program: comspec,
                    args: Vec::new(),
                };
            }
        }

        if Path::new(POWERSHELL_PATH).exists() {
            return ShellInfo {
                program: POWERSHELL_PATH.to_string(),
                args: vec!["-NoExit".to_string()],
            };
        }

        if let Some(wsl_path) = detect_wsl_shell() {
            return ShellInfo {
                program: wsl_path,
                args: Vec::new(),
            };
        }

        ShellInfo {
            program: "cmd.exe".to_string(),
            args: Vec::new(),
        }
    }
}

#[cfg(target_os = "windows")]
fn detect_wsl_shell() -> Option<String> {
    if env::var_os("WSL_INTEROP").is_some() || env::var_os("WSLENV").is_some() {
        return Some("wsl.exe".to_string());
    }
    None
}
