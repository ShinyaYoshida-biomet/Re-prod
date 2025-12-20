mod client;
pub mod commands;
mod connection;
mod process;
mod session;
pub mod types;

use std::path::{Path, PathBuf};

use crate::acp::{
    connection::AcpConnection,
    process::{spawn_agent, AcpChild, ProcessConfig, SpawnedPipes},
    session::AcpSessionManager,
};
use agent_client_protocol::{ContentBlock, ContentChunk, SessionNotification, SessionUpdate};
use anyhow::{anyhow, Result};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::info;
use types::{
    AcpInitializeResponse, AcpSessionUpdate, AcpSessionUpdate::Done, AcpSessionUpdateEnvelope,
};

/// Manages the lifecycle of the external ACP agent and simple in-memory sessions.
pub struct AcpManager {
    child: Option<AcpChild>,
    conn: Option<AcpConnection>,
    workspace_root: PathBuf,
    sessions: AcpSessionManager,
}

impl AcpManager {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            child: None,
            conn: None,
            workspace_root,
            sessions: AcpSessionManager::new(),
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

        let SpawnedPipes {
            mut child,
            reader,
            writer,
        } = spawn_agent(config).await?;
        child.notify_ready().await?;

        let (connection, updates) =
            AcpConnection::initialize(self.workspace_root.clone(), writer, reader).await?;
        self.forward_updates(app_handle.clone(), updates);

        self.child = Some(child);
        self.conn = Some(connection);
        info!("ACP agent spawned");

        app_handle.emit("acp://status", "ready").ok();

        Ok(AcpInitializeResponse {
            workspace_root: self.workspace_root.clone(),
            status: "ready".to_string(),
        })
    }

    pub async fn create_session(&mut self) -> Result<String> {
        let conn = self
            .conn
            .as_ref()
            .ok_or_else(|| anyhow!("ACP connection not initialized"))?;

        let session_id = conn
            .create_session(self.workspace_root.to_string_lossy().to_string())
            .await?;

        let id_string = session_id.to_string();
        self.sessions
            .register(id_string.clone(), self.workspace_root.clone());
        Ok(id_string)
    }

    pub fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.exists(session_id)
    }

    pub fn remove_session(&mut self, session_id: &str) {
        self.sessions.remove(session_id);
    }

    pub async fn cancel(&self, session_id: &str) -> Result<()> {
        let conn = self
            .conn
            .as_ref()
            .ok_or_else(|| anyhow!("ACP connection not initialized"))?;

        conn.cancel(agent_client_protocol::SessionId::new(
            session_id.to_string(),
        ))
        .await?;
        Ok(())
    }

    pub async fn send_prompt(
        &self,
        app_handle: &AppHandle,
        session_id: &str,
        messages: Vec<String>,
    ) -> Result<()> {
        let conn = self
            .conn
            .as_ref()
            .ok_or_else(|| anyhow!("ACP connection not initialized"))?;

        let request = AcpConnection::make_prompt_from_strings(session_id.to_string(), messages);
        conn.prompt(request).await?;
        let payload = AcpSessionUpdateEnvelope {
            session_id: session_id.to_string(),
            update: Done,
        };
        let _ = app_handle.emit("acp://session-update", payload);

        Ok(())
    }

    pub async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            child.shutdown().await;
        }
    }

    fn forward_updates(
        &self,
        app_handle: AppHandle,
        updates: UnboundedReceiver<SessionNotification>,
    ) {
        tauri::async_runtime::spawn(async move {
            let mut updates = updates;
            while let Some(notification) = updates.recv().await {
                let payload = AcpSessionUpdateEnvelope {
                    session_id: notification.session_id.to_string(),
                    update: map_session_update(&notification.update),
                };
                let _ = app_handle.emit("acp://session-update", payload);
            }
        });
    }
}

fn map_session_update(update: &SessionUpdate) -> AcpSessionUpdate {
    match update {
        SessionUpdate::UserMessageChunk(chunk) => AcpSessionUpdate::UserMessageChunk {
            text: stringify_chunk(chunk),
        },
        SessionUpdate::AgentMessageChunk(chunk) => AcpSessionUpdate::AgentMessageChunk {
            text: stringify_chunk(chunk),
        },
        SessionUpdate::AgentThoughtChunk(chunk) => AcpSessionUpdate::AgentMessageChunk {
            text: stringify_chunk(chunk),
        },
        SessionUpdate::Plan(plan) => AcpSessionUpdate::AgentThoughtChunk {
            text: format!("{plan:?}"),
        },
        other => AcpSessionUpdate::AgentMessageChunk {
            text: format!("{other:?}"),
        },
    }
}

fn stringify_chunk(chunk: &ContentChunk) -> String {
    match &chunk.content {
        ContentBlock::Text(text) => text.text.clone(),
        other => format!("{other:?}"),
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
