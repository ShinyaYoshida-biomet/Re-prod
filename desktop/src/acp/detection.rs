use std::path::PathBuf;

use anyhow::Result;
use which::which;

use crate::acp::types::AcpDetectedAgent;

const KNOWN_AGENTS: &[(&str, &str)] = &[
    ("claude-code-acp", "Claude Code (ACP)"),
    ("codex-cli", "Codex CLI"),
    ("gemini-cli", "Gemini CLI"),
];

pub fn detect_agents() -> Result<Vec<AcpDetectedAgent>> {
    let mut detected = Vec::new();
    for (command, display_name) in KNOWN_AGENTS {
        let path = which(command).ok();
        detected.push(AcpDetectedAgent {
            id: command.to_string(),
            name: display_name.to_string(),
            command: command.to_string(),
            available: path.is_some(),
            path: path.map(PathBuf::from),
        });
    }
    Ok(detected)
}
