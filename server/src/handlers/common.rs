use std::sync::{atomic::AtomicU64, Arc, OnceLock};

use crate::projects::ProjectController;
use reprod_core::acp::types::{
    AcpPermissionDecision, AcpPermissionRequestPayload, AcpPromptMessage, AcpSessionUpdate,
};
use reprod_core::{
    api::timeline::{
        ExportRMarkdownRequest, ExportRMarkdownResponse, TimelineQueryPayload,
        TimelineResponsePayload, TimelineStatsPayload,
    },
    fs::FileSystemEvent,
    plot_history::PlotHistoryEntry,
    project::ProjectRecord,
    AIResponse, ChatMessage, Config, ExecutionEvent, ExecutionRequest, RunOutputChunk, RunSummary,
    ToolExecutor, ToolManifest, ToolRegistry,
};
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::Mutex;

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

#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum AIMode {
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

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
pub(super) enum WSRequest {
    #[serde(rename = "execute")]
    Execute { request: ExecutionRequest },
    #[serde(rename = "ai_message")]
    AIMessage {
        messages: Vec<ChatMessage>,
        #[serde(default)]
        enable_tools: bool,
        #[serde(default)]
        request_id: Option<String>,
        #[serde(default)]
        stream: bool,
        #[serde(default)]
        mode: AIMode,
    },
    #[serde(rename = "list_tools")]
    ListTools,
    #[serde(rename = "execute_tool")]
    ExecuteTool {
        tool_id: String,
        capability_id: String,
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
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub(super) enum WSResponse {
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
        code_blocks: Option<Vec<Value>>,
    },
    #[allow(dead_code)] // Reserved for future AI planning feature
    #[serde(rename = "ai_plan_updated")]
    AIPlanUpdated {
        id: String,
        plan: Vec<PlanStepPayload>,
    },
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
    SessionRestarted { cleared_events: u64 },
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
        data: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "project_opened")]
    ProjectOpened {
        project: ProjectRecord,
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Value>,
    },
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
        active_plot_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "plot_history_cleared")]
    PlotHistoryCleared {
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Vec<PlotHistoryEntry>>,
        #[serde(rename = "activePlotId", skip_serializing_if = "Option::is_none")]
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
    #[serde(rename = "acp://session-update")]
    AcpSessionUpdate {
        session_id: String,
        update: AcpSessionUpdate,
    },
    #[serde(rename = "acp://permission-request")]
    AcpPermissionRequest {
        request: AcpPermissionRequestPayload,
    },
}

#[allow(dead_code)] // Reserved for future AI planning feature
#[derive(serde::Serialize, Clone)]
pub(super) struct PlanStepPayload {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) status: PlanStepStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<String>,
    #[serde(rename = "startedAt", skip_serializing_if = "Option::is_none")]
    pub(super) started_at: Option<i64>,
    #[serde(rename = "finishedAt", skip_serializing_if = "Option::is_none")]
    pub(super) finished_at: Option<i64>,
    #[serde(rename = "waitingReason", skip_serializing_if = "Option::is_none")]
    pub(super) waiting_reason: Option<String>,
}

#[allow(dead_code)] // Reserved for future AI planning feature
#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(super) enum PlanStepStatus {
    Pending,
    Running,
    Done,
    Error,
}

impl PlanStepPayload {
    pub(super) fn new(
        id: impl Into<String>,
        title: impl Into<String>,
        kind: Option<String>,
    ) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            status: PlanStepStatus::Pending,
            kind,
            error: None,
            started_at: None,
            finished_at: None,
            waiting_reason: None,
        }
    }

    pub(super) fn mark_status(&mut self, status: PlanStepStatus) {
        self.status = status;
        match status {
            PlanStepStatus::Running => {
                if self.started_at.is_none() {
                    self.started_at = Some(now_millis());
                }
            }
            PlanStepStatus::Done | PlanStepStatus::Error => {
                if self.started_at.is_none() {
                    self.started_at = Some(now_millis());
                }
                self.finished_at = Some(now_millis());
            }
            PlanStepStatus::Pending => {}
        }
    }
}

#[derive(serde::Serialize, Clone)]
pub(super) struct ToolLogPayload {
    pub id: String,
    pub name: String,
    pub status: ToolLogStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "startedAt", skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(rename = "finishedAt", skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub(super) enum ToolLogStatus {
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
    if name == "web_search" {
        return Some("Fetch".to_string());
    }
    None
}

pub(super) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub(super) fn build_streaming_payload(
    stream: bool,
    stream_id: &str,
    content: String,
) -> Vec<WSResponse> {
    if stream {
        vec![
            WSResponse::AIResponseChunk {
                id: stream_id.to_string(),
                chunk: content.clone(),
            },
            WSResponse::AIResponseComplete {
                id: stream_id.to_string(),
                final_text: content,
                code_blocks: None,
            },
        ]
    } else {
        vec![WSResponse::AIResponse { response: content }]
    }
}

pub(super) fn error_response(message: impl Into<String>) -> Vec<WSResponse> {
    vec![WSResponse::Error {
        message: message.into(),
    }]
}

pub(super) fn single_response(response: WSResponse) -> Vec<WSResponse> {
    vec![response]
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
}
