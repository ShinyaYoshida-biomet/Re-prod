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
    pending_edit::PendingEditStore,
    process::{spawn_agent, AcpChild, ProcessConfig, SpawnedPipes},
    session::AcpSessionManager,
    types::{
        AcpInitializeResponse, AcpPermissionDecision, AcpPermissionRequestPayload, AcpPlanStep,
        AcpPlanStepStatus, AcpSessionUpdate, AcpSessionUpdateEnvelope,
    },
};
use crate::edit::{EditOperation, EditService, EditStatus, EditTextFileRequest};

const BROADCAST_BUFFER: usize = 128;

/// Runtime wrapper shared by desktop and server runtimes to orchestrate ACP agents.
pub struct AcpGateway {
    child: Option<AcpChild>,
    conn: Option<AcpConnection>,
    workspace_root: PathBuf,
    sessions: AcpSessionManager,
    edit_service: std::sync::Arc<EditService>,
    pending_edits: std::sync::Arc<tokio::sync::Mutex<PendingEditStore>>,
    updates_tx: broadcast::Sender<AcpSessionUpdateEnvelope>,
    permission_tx: broadcast::Sender<AcpPermissionRequestPayload>,
}

impl AcpGateway {
    pub fn new(workspace_root: PathBuf) -> Self {
        let (updates_tx, _) = broadcast::channel(BROADCAST_BUFFER);
        let (permission_tx, _) = broadcast::channel(BROADCAST_BUFFER);
        let edit_service = std::sync::Arc::new(EditService::new(workspace_root.clone()));
        let pending_edits =
            std::sync::Arc::new(tokio::sync::Mutex::new(PendingEditStore::default()));
        Self {
            child: None,
            conn: None,
            workspace_root,
            sessions: AcpSessionManager::new(),
            edit_service,
            pending_edits,
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

        let (connection, updates, permission_requests) = match AcpConnection::initialize(
            self.workspace_root.clone(),
            self.edit_service.clone(),
            self.pending_edits.clone(),
            writer,
            reader,
        )
        .await
        {
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

    pub async fn accept_pending_edit(&self, edit_id: &str) -> Result<()> {
        let edit = {
            let store = self.pending_edits.lock().await;
            store
                .get_edit(edit_id)
                .ok_or_else(|| anyhow!("Pending edit not found"))?
        };

        let current = self.edit_service.read_text_file(&edit.file_path).await?;
        if current.sha256 != edit.base_sha256 {
            return Err(anyhow!(
                "Pending edit base mismatch: file changed since edit was created"
            ));
        }

        let request = EditTextFileRequest {
            path: edit.file_path.clone(),
            operation: EditOperation::Replace,
            expected_sha256: edit
                .expected_sha256
                .clone()
                .or_else(|| Some(edit.base_sha256.clone())),
            new_text: Some(edit.new_text.clone()),
            edits: None,
        };
        let result = self.edit_service.edit_text_file(request).await?;
        if matches!(result.status, EditStatus::Conflict) {
            return Err(anyhow!("Conflict detected while applying pending edit"));
        }

        let mut store = self.pending_edits.lock().await;
        store.remove_edit(edit_id);
        Ok(())
    }

    pub async fn update_pending_edit(&self, edit_id: &str, new_text: &str) -> Result<()> {
        let mut store = self.pending_edits.lock().await;
        store
            .update_edit_text(edit_id, new_text.to_string())
            .map_err(|error| anyhow!(error))?;
        Ok(())
    }

    pub async fn reject_pending_edit(&self, edit_id: &str) -> Result<()> {
        let mut store = self.pending_edits.lock().await;
        if store.remove_edit(edit_id).is_none() {
            return Err(anyhow!("Pending edit not found"));
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp::pending_edit::PendingEdit;
    use crate::edit::sha256_hex;
    use tokio::fs;
    use uuid::Uuid;

    #[tokio::test]
    async fn accept_pending_edit_persists_and_clears() {
        let workspace = std::env::temp_dir().join(format!("acp-accept-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace).await.unwrap();
        let file_path = workspace.join("sample.R");
        fs::write(&file_path, "old").await.unwrap();

        let gateway = AcpGateway::new(workspace.clone());
        let request = EditTextFileRequest {
            path: "sample.R".to_string(),
            operation: EditOperation::Replace,
            expected_sha256: None,
            new_text: Some("new".to_string()),
            edits: None,
        };
        let result = gateway
            .edit_service
            .preview_text_file(request, None)
            .await
            .unwrap();

        let pending = PendingEdit {
            id: "edit-1".to_string(),
            session_id: "s1".to_string(),
            tool_call_id: "tool-1".to_string(),
            file_path: "sample.R".to_string(),
            old_text: result.old_text.clone(),
            new_text: result.new_text.clone(),
            unified_diff: result.unified_diff.clone(),
            base_sha256: result.old_sha256.clone(),
            expected_sha256: None,
        };

        {
            let mut store = gateway.pending_edits.lock().await;
            store
                .register_pending_edit(pending.clone(), &result)
                .unwrap();
        }

        gateway.accept_pending_edit(&pending.id).await.unwrap();
        let disk_contents = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(disk_contents, "new");

        let store = gateway.pending_edits.lock().await;
        assert!(store.get_edit(&pending.id).is_none());
    }

    #[tokio::test]
    async fn reject_pending_edit_keeps_disk_unchanged() {
        let workspace = std::env::temp_dir().join(format!("acp-reject-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace).await.unwrap();
        let file_path = workspace.join("sample.R");
        fs::write(&file_path, "old").await.unwrap();

        let gateway = AcpGateway::new(workspace.clone());
        let request = EditTextFileRequest {
            path: "sample.R".to_string(),
            operation: EditOperation::Replace,
            expected_sha256: None,
            new_text: Some("new".to_string()),
            edits: None,
        };
        let result = gateway
            .edit_service
            .preview_text_file(request, None)
            .await
            .unwrap();

        let pending = PendingEdit {
            id: "edit-2".to_string(),
            session_id: "s2".to_string(),
            tool_call_id: "tool-2".to_string(),
            file_path: "sample.R".to_string(),
            old_text: result.old_text.clone(),
            new_text: result.new_text.clone(),
            unified_diff: result.unified_diff.clone(),
            base_sha256: result.old_sha256.clone(),
            expected_sha256: None,
        };

        {
            let mut store = gateway.pending_edits.lock().await;
            store
                .register_pending_edit(pending.clone(), &result)
                .unwrap();
        }

        gateway.reject_pending_edit(&pending.id).await.unwrap();
        let disk_contents = fs::read_to_string(&file_path).await.unwrap();
        assert_eq!(disk_contents, "old");
    }

    #[tokio::test]
    async fn update_pending_edit_refreshes_overlay() {
        let workspace = std::env::temp_dir().join(format!("acp-update-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace).await.unwrap();
        let file_path = workspace.join("sample.R");
        fs::write(&file_path, "old").await.unwrap();

        let gateway = AcpGateway::new(workspace.clone());
        let request = EditTextFileRequest {
            path: "sample.R".to_string(),
            operation: EditOperation::Replace,
            expected_sha256: None,
            new_text: Some("new".to_string()),
            edits: None,
        };
        let result = gateway
            .edit_service
            .preview_text_file(request, None)
            .await
            .unwrap();

        let pending = PendingEdit {
            id: "edit-update".to_string(),
            session_id: "s-update".to_string(),
            tool_call_id: "tool-update".to_string(),
            file_path: "sample.R".to_string(),
            old_text: result.old_text.clone(),
            new_text: result.new_text.clone(),
            unified_diff: result.unified_diff.clone(),
            base_sha256: result.old_sha256.clone(),
            expected_sha256: None,
        };

        {
            let mut store = gateway.pending_edits.lock().await;
            store
                .register_pending_edit(pending.clone(), &result)
                .unwrap();
        }

        gateway
            .update_pending_edit(&pending.id, "new-updated")
            .await
            .unwrap();

        let store = gateway.pending_edits.lock().await;
        let updated = store.get_edit(&pending.id).unwrap();
        assert_eq!(updated.new_text, "new-updated");
        let overlay = store
            .overlay_for(&pending.session_id, &pending.file_path)
            .unwrap();
        assert_eq!(overlay.text, "new-updated");
        assert_eq!(overlay.sha256, sha256_hex("new-updated"));
    }

    #[tokio::test]
    async fn accept_pending_edit_rejects_base_mismatch() {
        let workspace = std::env::temp_dir().join(format!("acp-mismatch-{}", Uuid::new_v4()));
        fs::create_dir_all(&workspace).await.unwrap();
        let file_path = workspace.join("sample.R");
        fs::write(&file_path, "old").await.unwrap();

        let gateway = AcpGateway::new(workspace.clone());
        let base_hash = sha256_hex("old");
        let pending = PendingEdit {
            id: "edit-3".to_string(),
            session_id: "s3".to_string(),
            tool_call_id: "tool-3".to_string(),
            file_path: "sample.R".to_string(),
            old_text: "old".to_string(),
            new_text: "new".to_string(),
            unified_diff: String::new(),
            base_sha256: base_hash,
            expected_sha256: None,
        };

        let preview = gateway
            .edit_service
            .preview_text_file(
                EditTextFileRequest {
                    path: "sample.R".to_string(),
                    operation: EditOperation::Replace,
                    expected_sha256: None,
                    new_text: Some("new".to_string()),
                    edits: None,
                },
                None,
            )
            .await
            .unwrap();

        {
            let mut store = gateway.pending_edits.lock().await;
            store
                .register_pending_edit(pending.clone(), &preview)
                .unwrap();
        }

        fs::write(&file_path, "changed").await.unwrap();

        let result = gateway.accept_pending_edit(&pending.id).await;
        assert!(result.is_err());

        let store = gateway.pending_edits.lock().await;
        assert!(store.get_edit(&pending.id).is_some());
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
