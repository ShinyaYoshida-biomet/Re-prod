use std::{collections::HashMap, sync::{atomic::AtomicU64, Arc, OnceLock}};

use crate::projects::ProjectController;
use tokio::sync::Mutex;
use reprod_core::acp::types::{
    AcpContextRequest, AcpPermissionDecision, AcpPermissionRequestPayload, AcpPromptMessage,
};
use reprod_core::{
    api::timeline::{
        ExportRMarkdownRequest, ExportRMarkdownResponse, TimelineQueryPayload,
        TimelineResponsePayload, TimelineStatsPayload,
    },
    fs::FileSystemEvent,
    plot_history::PlotHistoryEntry,
    project::ProjectRecord,
    AIResponse, ChatMessage, Config, DiffChange, DiffHunk, EnvironmentVariable, ExecutionEvent,
    ExecutionRequest, RunOutputChunk, RunSummary, ToolExecutor, ToolManifest, ToolRegistry,
};
use serde::Deserialize;
use serde_json::Value;
use ts_rs::TS;

pub(super) use super::approval_manager::{ApprovalManager, ApprovalRule, CancelManager};
pub(super) use super::response_builders::{build_streaming_payload, error_response, now_millis, single_response};

#[derive(Debug, Deserialize)]
struct SystemPrompts {
    patch: String,
    range: String,
    chat: String,
}

fn load_system_prompts() -> &'static SystemPrompts {
    static PROMPTS: OnceLock<SystemPrompts> = OnceLock::new();
    PROMPTS.get_or_init(|| {
        let raw = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../client/src/core/ai/systemPrompts.json"
        ));
        serde_json::from_str(raw).expect("Failed to parse system prompts JSON")
    })
}

#[derive(Clone, Copy, Debug, serde::Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "lowercase")]
pub(crate) enum AIMode {
    Agent,
    Chat,
}

impl Default for AIMode {
    fn default() -> Self {
        Self::Agent
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<Config>>,
    pub tool_registry: Arc<ToolRegistry>,
    pub tool_executor: Arc<ToolExecutor>,
    pub request_counter: Arc<AtomicU64>,
    pub projects: Arc<ProjectController>,
    pub approvals: Arc<ApprovalManager>,
    pub cancels: Arc<CancelManager>,
    pub acp_permission_requests: Arc<Mutex<HashMap<String, AcpPermissionRequestPayload>>>,
}

pub(super) fn with_system_prompts(messages: &[ChatMessage], mode: AIMode) -> Vec<ChatMessage> {
    let mut result = Vec::with_capacity(messages.len() + 2);
    let prompts = load_system_prompts();
    match mode {
        AIMode::Agent => {
            result.push(ChatMessage {
                role: "system".to_string(),
                content: prompts.patch.clone(),
            });
            result.push(ChatMessage {
                role: "system".to_string(),
                content: prompts.range.clone(),
            });
        }
        AIMode::Chat => {
            result.push(ChatMessage {
                role: "system".to_string(),
                content: prompts.chat.clone(),
            });
        }
    }
    result.extend(messages.iter().cloned());
    result
}

#[derive(serde::Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(tag = "type")]
pub(crate) enum WSRequest {
    #[serde(rename = "execute")]
    Execute { request: ExecutionRequest },
    #[serde(rename = "ai_message")]
    AIMessage {
        session_id: String,
        content: String,
        #[serde(default)]
        context: Option<AcpContextRequest>,
        #[serde(default)]
        enable_tools: bool,
        #[serde(default)]
        request_id: Option<String>,
        #[serde(default)]
        stream: bool,
        #[serde(default)]
        mode: AIMode,
    },
    #[serde(rename = "agent_approval_decision")]
    AgentApprovalDecision { decision: ApprovalDecisionPayload },
    #[serde(rename = "ai_cancel")]
    AICancel { request_id: String },
    #[serde(rename = "list_tools")]
    ListTools,
    #[serde(rename = "execute_tool")]
    ExecuteTool {
        tool_id: String,
        capability_id: String,
        #[ts(type = "Record<string, any>")]
        parameters: std::collections::HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "timeline_query")]
    TimelineQuery { query: TimelineQueryPayload },
    #[serde(rename = "timeline_stats_query")]
    TimelineStatsQuery,
    #[serde(rename = "export_rmarkdown")]
    ExportRMarkdown { request: ExportRMarkdownRequest },
    #[serde(rename = "interrupt_execution")]
    InterruptExecution,
    #[serde(rename = "restart_session")]
    RestartSession,
    #[serde(rename = "fs_action")]
    FileSystemAction {
        action: String,
        path: String,
        #[serde(default)]
        content: Option<String>,
        #[serde(default)]
        to: Option<String>,
    },
    #[serde(rename = "project_switch_folder")]
    ProjectSwitchFolder { path: String },
    #[serde(rename = "project_list")]
    ProjectList,
    #[serde(rename = "project_switch")]
    ProjectSwitch { project_id: String },
    #[serde(rename = "project_create")]
    ProjectCreate {
        name: String,
        #[serde(default)]
        base_path: Option<String>,
    },
    #[serde(rename = "plot_history_get")]
    PlotHistoryGet,
    #[serde(rename = "plot_history_set_active")]
    PlotHistorySetActive { plot_id: String },
    #[serde(rename = "plot_history_export")]
    PlotHistoryExport {
        plot_id: String,
        path: String,
        #[serde(default)]
        format: Option<String>,
    },
    #[serde(rename = "plot_history_delete")]
    PlotHistoryDelete { plot_id: String },
    #[serde(rename = "plot_history_save")]
    PlotHistorySave,
    #[serde(rename = "plot_history_restore")]
    PlotHistoryRestore,
    #[serde(rename = "plot_history_clear")]
    PlotHistoryClear,
    #[serde(rename = "run_query")]
    RunQuery {
        #[serde(default)]
        limit: Option<usize>,
    },
    #[serde(rename = "acp_session_create")]
    AcpSessionCreate,
    #[serde(rename = "acp_session_prompt")]
    AcpSessionPrompt {
        session_id: String,
        messages: Vec<AcpPromptMessage>,
        #[serde(default)]
        context: Option<AcpContextRequest>,
    },
    #[serde(rename = "acp_session_cancel")]
    AcpSessionCancel { session_id: String },
    #[serde(rename = "acp_permission_decision")]
    AcpPermissionDecision { decision: AcpPermissionDecision },
    #[serde(rename = "acp_pending_edit_accept")]
    AcpPendingEditAccept { edit_id: String },
    #[serde(rename = "acp_pending_edit_reject")]
    AcpPendingEditReject { edit_id: String },
    #[serde(rename = "acp_pending_edit_update")]
    AcpPendingEditUpdate { edit_id: String, new_text: String },
    #[serde(rename = "environment_query")]
    EnvironmentQuery,
}

#[derive(serde::Serialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(tag = "type")]
pub(crate) enum WSResponse {
    #[serde(rename = "ai_response")]
    AIResponse { response: String },
    #[serde(rename = "ai_response_with_tools")]
    AIResponseWithTools { response: AIResponse },
    #[serde(rename = "ai_response_chunk")]
    AIResponseChunk { id: String, chunk: String },
    #[serde(rename = "ai_response_complete")]
    AIResponseComplete {
        id: String,
        #[serde(rename = "final")]
        final_text: String,
        #[serde(rename = "codeBlocks", skip_serializing_if = "Option::is_none")]
        #[ts(type = "Array<any>")]
        #[ts(rename = "codeBlocks")]
        code_blocks: Option<Vec<Value>>,
    },
    #[serde(rename = "agent_event")]
    AgentEvent {
        id: String,
        event: AgentEventPayload,
    },
    #[serde(rename = "approval_request")]
    ApprovalRequest {
        id: String,
        request: ApprovalRequestPayload,
    },
    #[serde(rename = "pending_edit_created")]
    PendingEditCreated { edit: PendingEditPayload },
    #[serde(rename = "ai_tool_started")]
    AIToolStarted { id: String, tool: ToolLogPayload },
    #[serde(rename = "ai_tool_finished")]
    AIToolFinished { id: String, tool: ToolLogPayload },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "tools")]
    Tools { tools: Vec<ToolManifest> },
    #[serde(rename = "tool_execution_result")]
    ToolExecutionResult {
        tool_id: String,
        capability_id: String,
        success: bool,
        stdout: Option<String>,
        stderr: Option<String>,
        #[ts(type = "number")]
        execution_time_ms: u64,
        error: Option<String>,
    },
    #[serde(rename = "timeline_response")]
    TimelineResponse { data: TimelineResponsePayload },
    #[serde(rename = "timeline_stats_response")]
    TimelineStatsResponse { stats: TimelineStatsPayload },
    #[serde(rename = "timeline_event_added")]
    TimelineEventAdded { event: ExecutionEvent },
    #[serde(rename = "export_rmarkdown_response")]
    ExportRMarkdownResponse { response: ExportRMarkdownResponse },
    #[serde(rename = "execution_interrupted")]
    ExecutionInterrupted { success: bool },
    #[serde(rename = "session_restarted")]
    SessionRestarted {
        #[ts(type = "number")]
        cleared_events: u64,
    },
    #[serde(rename = "fs_event")]
    FileSystemEvent { event: FileSystemEvent },
    #[serde(rename = "fs_result")]
    FileSystemResult {
        action: String,
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        to: Option<String>,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(type = "any")]
        data: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "project_opened")]
    ProjectOpened {
        project: ProjectRecord,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(type = "any")]
        state: Option<Value>,
    },
    #[serde(rename = "project_list_result")]
    ProjectListResult { projects: Vec<ProjectRecord> },
    #[serde(rename = "project_created")]
    ProjectCreated { project: ProjectRecord },
    #[serde(rename = "acp_pending_edit_resolved")]
    AcpPendingEditResolved {
        edit_id: String,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "acp_pending_edit_updated")]
    AcpPendingEditUpdated {
        edit_id: String,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "plot_history_state")]
    PlotHistoryState {
        #[serde(rename = "activePlotId")]
        active_plot_id: Option<String>,
        plots: Vec<PlotHistoryEntry>,
    },
    #[serde(rename = "plot_history_updated")]
    PlotHistoryUpdated {
        #[serde(rename = "activePlotId")]
        active_plot_id: Option<String>,
        plots: Vec<PlotHistoryEntry>,
    },
    #[serde(rename = "plot_history_exported")]
    PlotHistoryExported {
        success: bool,
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "plot_history_deleted")]
    PlotHistoryDeleted {
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Vec<PlotHistoryEntry>>,
        #[serde(rename = "activePlotId", skip_serializing_if = "Option::is_none")]
        #[ts(rename = "activePlotId")]
        active_plot_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "plot_history_saved")]
    PlotHistorySaved,
    #[serde(rename = "plot_history_restored")]
    PlotHistoryRestored {
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Vec<PlotHistoryEntry>>,
        #[serde(rename = "activePlotId", skip_serializing_if = "Option::is_none")]
        #[ts(rename = "activePlotId")]
        active_plot_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "plot_history_cleared")]
    PlotHistoryCleared {
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Vec<PlotHistoryEntry>>,
        #[serde(rename = "activePlotId", skip_serializing_if = "Option::is_none")]
        #[ts(rename = "activePlotId")]
        active_plot_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "run_state")]
    RunState { runs: Vec<RunSummary> },
    #[serde(rename = "run_accepted")]
    RunAccepted { run_id: String },
    #[serde(rename = "run_started")]
    RunStarted { run: RunSummary },
    #[serde(rename = "run_output")]
    RunOutput(RunOutputChunk),
    #[serde(rename = "run_finished")]
    RunFinished { run: RunSummary },
    #[serde(rename = "acp_session_created")]
    AcpSessionCreated { session_id: String },
    #[serde(rename = "environment_data")]
    EnvironmentData { variables: Vec<EnvironmentVariable> },
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "snake_case")]
pub(crate) enum ApprovalOption {
    ApproveOnce,
    ApproveSession,
    Edit,
    Deny,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub(crate) struct ApprovalRequestPayload {
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub tool: String,
    #[ts(type = "any")]
    pub preview: ToolPreviewPayload,
    #[serde(skip_serializing_if = "Option::is_none", rename = "previewText")]
    #[ts(rename = "previewText")]
    pub preview_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    pub options: Vec<ApprovalOption>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "any")]
    pub input: Option<Value>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "snake_case")]
pub(crate) struct PendingEditPayload {
    pub id: String,
    pub session_id: String,
    pub tool_call_id: String,
    pub file_path: String,
    pub old_text: String,
    pub new_text: String,
    pub unified_diff: String,
    pub base_sha256: String,
    pub expected_sha256: Option<String>,
    pub changes: Vec<DiffChange>,
    pub hunks: Vec<DiffHunk>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub(crate) struct ApprovalDecisionPayload {
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub decision: ApprovalOption,
    #[serde(skip_serializing_if = "Option::is_none", rename = "editedInput")]
    #[ts(type = "any | null")]
    #[ts(rename = "editedInput")]
    pub edited_input: Option<Value>,
}

pub(crate) fn approval_preview_text(preview: &ToolPreviewPayload) -> Option<String> {
    match preview.kind.as_str() {
        "diff" => preview.diff.clone(),
        "command" => preview.command.clone(),
        "read" => preview.filepath.clone(),
        _ => None,
    }
}

pub(crate) fn build_approval_request_payload(
    event_id: String,
    tool: String,
    preview: ToolPreviewPayload,
    options: Vec<ApprovalOption>,
    input: Option<Value>,
    title: Option<String>,
    subtitle: Option<String>,
) -> ApprovalRequestPayload {
    let preview_text = approval_preview_text(&preview);
    ApprovalRequestPayload {
        event_id,
        tool,
        preview,
        preview_text,
        title,
        subtitle,
        options,
        input,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_system_prompts_preserves_existing_conversation() {
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: "request".to_string(),
        }];

        let prefixed = with_system_prompts(&messages, AIMode::Agent);
        let prompts = load_system_prompts();

        assert_eq!(prefixed.len(), messages.len() + 2);
        assert_eq!(prefixed[0].role, "system");
        assert_eq!(prefixed[0].content, prompts.patch);
        assert_eq!(prefixed[1].content, prompts.range);
        assert_eq!(&prefixed[2..], messages.as_slice());
    }

    #[test]
    fn approval_preview_text_prefers_payload_content() {
        let diff_preview = ToolPreviewPayload {
            kind: "diff".to_string(),
            filepath: Some("note.txt".to_string()),
            diff: Some("diff".to_string()),
            command: None,
            affected_lines: None,
        };
        assert_eq!(
            approval_preview_text(&diff_preview),
            Some("diff".to_string())
        );

        let command_preview = ToolPreviewPayload {
            kind: "command".to_string(),
            filepath: None,
            diff: None,
            command: Some("ls".to_string()),
            affected_lines: None,
        };
        assert_eq!(
            approval_preview_text(&command_preview),
            Some("ls".to_string())
        );

        let read_preview = ToolPreviewPayload {
            kind: "read".to_string(),
            filepath: Some("note.txt".to_string()),
            diff: None,
            command: None,
            affected_lines: None,
        };
        assert_eq!(
            approval_preview_text(&read_preview),
            Some("note.txt".to_string())
        );
    }

    #[test]
    fn build_approval_request_payload_populates_preview_text() {
        let preview = ToolPreviewPayload {
            kind: "command".to_string(),
            filepath: None,
            diff: None,
            command: Some("ls".to_string()),
            affected_lines: None,
        };
        let payload = build_approval_request_payload(
            "event-1".to_string(),
            "tool".to_string(),
            preview,
            vec![ApprovalOption::ApproveOnce],
            None,
            None,
            None,
        );
        assert_eq!(payload.preview_text, Some("ls".to_string()));
    }
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AgentEventStatus {
    Pending,
    Running,
    Done,
    Error,
    Blocked,
    Approved,
    Denied,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PlanStepStatus {
    Pending,
    Running,
    Done,
    Error,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PlanStepKind {
    Plan,
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct PlanStepPayload {
    pub id: String,
    pub title: String,
    pub status: PlanStepStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<PlanStepKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "startedAt")]
    pub started_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "finishedAt")]
    pub finished_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "waitingReason")]
    pub waiting_reason: Option<String>,
}

#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ArtifactKind {
    FileRead,
    FileWrite,
    Command,
    /// Reserved for future test result artifact tracking.
    #[allow(dead_code)]
    TestResult,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ToolPreviewPayload {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filepath: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "affectedLines")]
    pub affected_lines: Option<u32>,
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct ArtifactDetailsPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "testsPassed")]
    pub tests_passed: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "testsFailed")]
    pub tests_failed: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "oldText")]
    pub old_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "newText")]
    pub new_text: Option<String>,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(tag = "type")]
pub(crate) enum AgentEventPayload {
    #[serde(rename = "thought")]
    Thought {
        id: String,
        #[ts(type = "string")]
        status: AgentEventStatus,
        #[ts(type = "number")]
        timestamp: i64,
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        reasoning: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: Option<String>,
    },
    #[serde(rename = "tool_request")]
    ToolRequest {
        id: String,
        #[ts(type = "string")]
        status: AgentEventStatus,
        #[ts(type = "number")]
        timestamp: i64,
        tool: String,
        #[ts(type = "any")]
        input: Value,
        #[serde(rename = "requiresApproval")]
        requires_approval: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(type = "any")]
        preview: Option<ToolPreviewPayload>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: Option<String>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        id: String,
        #[ts(type = "string")]
        status: AgentEventStatus,
        #[ts(type = "number")]
        timestamp: i64,
        #[serde(rename = "requestId")]
        request_id: String,
        tool: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(type = "any")]
        output: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: Option<String>,
    },
    #[serde(rename = "task")]
    Task {
        id: String,
        #[ts(type = "string")]
        status: AgentEventStatus,
        #[ts(type = "number")]
        timestamp: i64,
        label: String,
        deps: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: Option<String>,
    },
    #[serde(rename = "plan_update")]
    PlanUpdate {
        #[ts(type = "any")]
        steps: Vec<PlanStepPayload>,
    },
    #[serde(rename = "artifact")]
    Artifact {
        id: String,
        #[ts(type = "string")]
        status: AgentEventStatus,
        #[ts(type = "number")]
        timestamp: i64,
        #[ts(type = "string")]
        kind: ArtifactKind,
        #[serde(skip_serializing_if = "Option::is_none")]
        path: Option<String>,
        summary: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(type = "any")]
        details: Option<ArtifactDetailsPayload>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: Option<String>,
    },
    #[serde(rename = "error")]
    Error {
        id: String,
        #[ts(type = "string")]
        status: AgentEventStatus,
        #[ts(type = "number")]
        timestamp: i64,
        message: String,
        recoverable: bool,
        #[serde(skip_serializing_if = "Option::is_none", rename = "suggestedAction")]
        #[ts(rename = "suggestedAction")]
        suggested_action: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "parentId")]
        #[ts(rename = "parentId")]
        parent_id: Option<String>,
    },
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub(crate) struct ToolLogPayload {
    pub id: String,
    pub name: String,
    #[ts(type = "string")]
    pub status: ToolLogStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "any")]
    pub input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "any")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "startedAt", skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | null")]
    #[ts(rename = "startedAt")]
    pub started_at: Option<i64>,
    #[serde(rename = "finishedAt", skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | null")]
    #[ts(rename = "finishedAt")]
    pub finished_at: Option<i64>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ToolLogStatus {
    #[allow(dead_code)] // Reserved for future use
    Pending,
    Running,
    Done,
    Error,
}

pub(super) fn tool_log_from_call(tool_call: &reprod_core::ToolCall) -> ToolLogPayload {
    ToolLogPayload {
        id: tool_call.id.clone(),
        name: tool_call.name.clone(),
        status: ToolLogStatus::Running,
        kind: tool_kind_from_name(&tool_call.name),
        input: Some(tool_call.input.clone()),
        output: None,
        error: None,
        started_at: Some(now_millis()),
        finished_at: None,
    }
}

fn tool_kind_from_name(name: &str) -> Option<String> {
    match name {
        "web_search" => Some("Fetch".to_string()),
        "search_repo" => Some("Search".to_string()),
        "git_status" | "git_diff" | "git_log" => Some("Git".to_string()),
        "propose_text_edit" | "apply_pending_edit" => Some("Edit".to_string()),
        _ => None,
    }
}

