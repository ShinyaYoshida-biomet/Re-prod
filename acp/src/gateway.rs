use std::path::{Path, PathBuf};

use agent_client_protocol::{ContentBlock, ContentChunk, SessionNotification, SessionUpdate};
use anyhow::{anyhow, Result};
use tokio::sync::{broadcast, mpsc::UnboundedReceiver};
use tracing::{info, warn};

use crate::{
    connection::{AcpConnection, PermissionDecisionMessage},
    process::{spawn_agent, AcpChild, ProcessConfig, SpawnedPipes},
    session::AcpSessionManager,
    types::{
        AcpInitializeResponse, AcpPermissionDecision, AcpPermissionRequestPayload,
        AcpSessionUpdate, AcpSessionUpdate::Done, AcpSessionUpdateEnvelope,
    },
};

const BROADCAST_BUFFER: usize = 128;

/// Runtime wrapper shared by desktop and server runtimes to orchestrate ACP agents.
pub struct AcpGateway {
    child: Option<AcpChild>,
    conn: Option<AcpConnection>,
    workspace_root: PathBuf,
    sessions: AcpSessionManager,
    updates_tx: broadcast::Sender<AcpSessionUpdateEnvelope>,
    permission_tx: broadcast::Sender<AcpPermissionRequestPayload>,
}

impl AcpGateway {
    pub fn new(workspace_root: PathBuf) -> Self {
        let (updates_tx, _) = broadcast::channel(BROADCAST_BUFFER);
        let (permission_tx, _) = broadcast::channel(BROADCAST_BUFFER);
        Self {
            child: None,
            conn: None,
            workspace_root,
            sessions: AcpSessionManager::new(),
            updates_tx,
            permission_tx,
        }
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    pub fn is_running(&self) -> bool {
        self.child.is_some()
    }

    pub fn subscribe_session_updates(&self) -> broadcast::Receiver<AcpSessionUpdateEnvelope> {
        self.updates_tx.subscribe()
    }

    pub fn subscribe_permission_requests(
        &self,
    ) -> broadcast::Receiver<AcpPermissionRequestPayload> {
        self.permission_tx.subscribe()
    }

    pub async fn initialize(&mut self, config: ProcessConfig) -> Result<AcpInitializeResponse> {
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

        let (connection, updates, permission_requests) =
            AcpConnection::initialize(self.workspace_root.clone(), writer, reader).await?;
        self.forward_updates(updates);
        self.forward_permission_requests(permission_requests);

        self.child = Some(child);
        self.conn = Some(connection);
        info!(workspace = %self.workspace_root.display(), "ACP agent spawned");

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

    pub async fn respond_permission(&self, decision: AcpPermissionDecision) -> Result<()> {
        let conn = self
            .conn
            .as_ref()
            .ok_or_else(|| anyhow!("ACP connection not initialized"))?;
        let mapped: PermissionDecisionMessage = decision.try_into()?;
        conn.respond_permission(mapped).await
    }

    pub async fn send_prompt(&self, session_id: &str, messages: Vec<String>) -> Result<()> {
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
        let _ = self.updates_tx.send(payload);
        Ok(())
    }

    pub async fn shutdown(&mut self) {
        self.conn = None;
        if let Some(mut child) = self.child.take() {
            child.shutdown().await;
        }
    }

    fn forward_updates(&self, updates: UnboundedReceiver<SessionNotification>) {
        let mut updates = updates;
        let tx = self.updates_tx.clone();
        tokio::spawn(async move {
            while let Some(notification) = updates.recv().await {
                let payload = AcpSessionUpdateEnvelope {
                    session_id: notification.session_id.to_string(),
                    update: map_session_update(&notification.update),
                };
                if tx.send(payload).is_err() {
                    // No listeners right now; drop the update quietly.
                }
            }
        });
    }

    fn forward_permission_requests(
        &self,
        requests: UnboundedReceiver<AcpPermissionRequestPayload>,
    ) {
        let mut requests = requests;
        let tx = self.permission_tx.clone();
        tokio::spawn(async move {
            while let Some(request) = requests.recv().await {
                if tx.send(request.clone()).is_err() {
                    warn!("ACP permission request dropped; no active subscribers");
                }
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
        SessionUpdate::AgentThoughtChunk(chunk) => AcpSessionUpdate::AgentThoughtChunk {
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
