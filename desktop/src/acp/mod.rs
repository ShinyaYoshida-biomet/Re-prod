pub mod types;

mod commands;
mod process;

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use crate::acp::process::{spawn_agent, AcpChild, ProcessConfig};
use anyhow::{anyhow, Result};
use tauri::AppHandle;
use tracing::info;
use types::{AcpInitializeResponse, AcpSessionUpdate, AcpSessionUpdateEnvelope};
use uuid::Uuid;

/// Manages the lifecycle of the external ACP agent and simple in-memory sessions.
pub struct AcpManager {
    child: Option<AcpChild>,
    workspace_root: PathBuf,
    sessions: HashSet<String>,
}

impl AcpManager {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            child: None,
            workspace_root,
            sessions: HashSet::new(),
        }
    }

    pub async fn initialize(
        &mut self,
        app_handle: &AppHandle,
        config: ProcessConfig,
    ) -> Result<AcpInitializeResponse> {
        if self.child.is_some() {
            return Ok(AcpInitializeResponse {
                workspace_root: self.workspace_root.clone(),
                status: "already_running".to_string(),
            });
        }

        let mut child = spawn_agent(config).await?;
        child.notify_ready().await?;

        self.child = Some(child);
        info!("ACP agent spawned");

        app_handle.emit("acp://status", "ready").ok();

        Ok(AcpInitializeResponse {
            workspace_root: self.workspace_root.clone(),
            status: "ready".to_string(),
        })
    }

    pub fn create_session(&mut self) -> String {
        let id = Uuid::new_v4().to_string();
        self.sessions.insert(id.clone());
        id
    }

    pub fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.contains(session_id)
    }

    pub fn remove_session(&mut self, session_id: &str) {
        self.sessions.remove(session_id);
    }

    pub async fn send_placeholder_update(
        &self,
        app_handle: &AppHandle,
        session_id: &str,
        text: &str,
    ) -> Result<()> {
        let payload = AcpSessionUpdateEnvelope {
            session_id: session_id.to_string(),
            update: AcpSessionUpdate::AgentMessageChunk {
                text: text.to_string(),
            },
        };
        app_handle
            .emit("acp://session-update", payload)
            .map_err(|err| anyhow!(err.to_string()))
    }

    pub async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            child.shutdown().await;
        }
    }
}

/// Build a ProcessConfig using the current workspace root and optional overrides.
pub fn build_process_config(
    workspace_root: &Path,
    command: Option<String>,
    args: Option<Vec<String>>,
) -> ProcessConfig {
    ProcessConfig {
        command: command.unwrap_or_else(|| "claude-code-acp".to_string()),
        args: args.unwrap_or_default(),
        cwd: workspace_root.to_path_buf(),
        env: Default::default(),
    }
}

pub use commands::{acp_cancel, acp_create_session, acp_initialize, acp_send_prompt, AcpState};
