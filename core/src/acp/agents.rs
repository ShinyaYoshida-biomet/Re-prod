#[derive(Debug, Clone, Copy)]
pub struct AgentDescriptor {
    pub id: &'static str,
    pub name: &'static str,
    pub commands: &'static [&'static str],
    pub download: Option<AgentDownload>,
}

#[derive(Debug, Clone, Copy)]
pub enum AgentDownload {
    GithubRelease(GithubReleaseSpec),
}

#[derive(Debug, Clone, Copy)]
pub struct GithubReleaseSpec {
    pub repo: &'static str,
    pub asset_prefix: &'static str,
    pub binary_name: &'static str,
}

pub const AGENTS: &[AgentDescriptor] = &[
    AgentDescriptor {
        id: "claude-code-acp",
        name: "Claude Code (ACP)",
        commands: &["claude-code-acp"],
        download: Some(AgentDownload::GithubRelease(GithubReleaseSpec {
            repo: "zed-industries/claude-code-acp",
            asset_prefix: "claude-code-acp",
            binary_name: "claude-code-acp",
        })),
    },
    AgentDescriptor {
        id: "codex",
        name: "Codex CLI (ACP Adapter)",
        commands: &["codex-acp"],
        download: Some(AgentDownload::GithubRelease(GithubReleaseSpec {
            repo: "zed-industries/codex-acp",
            asset_prefix: "codex-acp",
            binary_name: "codex-acp",
        })),
    },
    AgentDescriptor {
        id: "gemini",
        name: "Gemini CLI",
        commands: &["gemini", "gemini-cli"],
        download: None,
    },
];
