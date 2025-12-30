use std::path::{Path, PathBuf};

use agent_client_protocol::{
    ContentBlock, ContentChunk, PlanEntryStatus, SessionNotification, SessionUpdate,
    ToolCallContent, ToolCallStatus,
};
use anyhow::{anyhow, Result};
use serde_json::Value;
use tokio::sync::{broadcast, mpsc::UnboundedReceiver};
use tracing::{info, warn};

use super::{
    connection::{AcpConnection, PermissionDecisionMessage},
    process::{spawn_agent, AcpChild, ProcessConfig, SpawnedPipes},
    session::AcpSessionManager,
    types::{
        AcpInitializeResponse, AcpPermissionDecision, AcpPermissionRequestPayload, AcpPlanStep,
        AcpPlanStepStatus, AcpSessionUpdate, AcpSessionUpdateEnvelope,
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
            match AcpConnection::initialize(self.workspace_root.clone(), writer, reader).await {
                Ok(result) => result,
                Err(err) => {
                    warn!(error = %err, "ACP initialize failed; shutting down agent");
                    child.shutdown().await;
                    return Err(err);
                }
            };
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
        // The prompt() call awaits the agent's PromptResponse, which comes when
        // the agent signals EndTurn. Meanwhile, session updates (text chunks,
        // tool calls, etc.) flow through forward_updates() independently.
        // Only after prompt() returns do we send Done to signal turn completion.
        conn.prompt(request).await?;
        let payload = AcpSessionUpdateEnvelope {
            session_id: session_id.to_string(),
            update: AcpSessionUpdate::Done,
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
        SessionUpdate::Plan(plan) => AcpSessionUpdate::Plan {
            steps: map_plan_steps(plan),
        },
        SessionUpdate::ToolCall(tool_call) => AcpSessionUpdate::ToolCall {
            id: tool_call.tool_call_id.to_string(),
            title: tool_call.title.clone(),
            kind: format!("{:?}", tool_call.kind),
            status: format!("{:?}", tool_call.status),
            locations: tool_call
                .locations
                .iter()
                .map(|loc| loc.path.to_string_lossy().to_string())
                .collect(),
            input: tool_call.raw_input.clone(),
            output: tool_output_from(tool_call.raw_output.as_ref(), &tool_call.content),
            error: tool_error_from(
                tool_call.status,
                tool_call.raw_output.as_ref(),
                &tool_call.content,
            ),
        },
        SessionUpdate::ToolCallUpdate(tool_call_update) => {
            let content = tool_call_update.fields.content.as_ref().and_then(|blocks| {
                if blocks.is_empty() {
                    None
                } else {
                    Some(
                        blocks
                            .iter()
                            .map(|block| format!("{block:?}"))
                            .collect::<Vec<_>>()
                            .join("\n"),
                    )
                }
            });
            let output = tool_call_update
                .fields
                .raw_output
                .clone()
                .or_else(|| content.clone().map(Value::String));
            let error = tool_call_update.fields.status.as_ref().and_then(|status| {
                if matches!(status, ToolCallStatus::Failed) {
                    output.as_ref().map(|value| value.to_string())
                } else {
                    None
                }
            });

            AcpSessionUpdate::ToolCallUpdate {
                id: tool_call_update.tool_call_id.to_string(),
                status: tool_call_update
                    .fields
                    .status
                    .as_ref()
                    .map(|s| format!("{s:?}")),
                content,
                input: tool_call_update.fields.raw_input.clone(),
                output,
                error,
            }
        }
        SessionUpdate::AvailableCommandsUpdate(commands_update) => {
            AcpSessionUpdate::AvailableCommands {
                commands: commands_update
                    .available_commands
                    .iter()
                    .map(|cmd| super::types::AcpAvailableCommand {
                        name: cmd.name.clone(),
                        description: cmd.description.clone(),
                    })
                    .collect(),
            }
        }
        SessionUpdate::CurrentModeUpdate(update) => AcpSessionUpdate::AgentThoughtChunk {
            text: format!("mode: {}", update.current_mode_id),
        },
        _ => AcpSessionUpdate::AgentMessageChunk {
            text: format!("{update:?}"),
        },
    }
}

fn map_plan_steps(plan: &agent_client_protocol::Plan) -> Vec<AcpPlanStep> {
    plan.entries
        .iter()
        .enumerate()
        .map(|(index, entry)| AcpPlanStep {
            id: format!("plan-{}", index + 1),
            title: entry.content.clone(),
            status: map_plan_status(&entry.status),
            kind: Some("plan".to_string()),
            error: None,
            started_at: None,
            finished_at: None,
            waiting_reason: None,
        })
        .collect()
}

fn map_plan_status(status: &PlanEntryStatus) -> AcpPlanStepStatus {
    match status {
        PlanEntryStatus::Pending => AcpPlanStepStatus::Pending,
        PlanEntryStatus::InProgress => AcpPlanStepStatus::Running,
        PlanEntryStatus::Completed => AcpPlanStepStatus::Done,
        _ => AcpPlanStepStatus::Pending,
    }
}

fn stringify_chunk(chunk: &ContentChunk) -> String {
    match &chunk.content {
        ContentBlock::Text(text) => text.text.clone(),
        other => format!("{other:?}"),
    }
}

fn tool_output_from(raw_output: Option<&Value>, content: &[ToolCallContent]) -> Option<Value> {
    if let Some(output) = raw_output {
        return Some(output.clone());
    }
    let content_text = stringify_tool_content(content)?;
    Some(Value::String(content_text))
}

fn tool_error_from(
    status: ToolCallStatus,
    raw_output: Option<&Value>,
    content: &[ToolCallContent],
) -> Option<String> {
    if !matches!(status, ToolCallStatus::Failed) {
        return None;
    }
    if let Some(output) = raw_output {
        return Some(output.to_string());
    }
    stringify_tool_content(content)
}

fn stringify_tool_content(content: &[ToolCallContent]) -> Option<String> {
    if content.is_empty() {
        return None;
    }
    Some(
        content
            .iter()
            .map(|block| format!("{block:?}"))
            .collect::<Vec<_>>()
            .join("\n"),
    )
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
