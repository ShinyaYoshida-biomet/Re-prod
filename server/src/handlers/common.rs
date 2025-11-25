use std::sync::{atomic::AtomicU64, Arc};

use crate::projects::ProjectController;
use reprod_core::{
    api::timeline::{
        ExportRMarkdownRequest, ExportRMarkdownResponse, TimelineQueryPayload,
        TimelineResponsePayload, TimelineStatsPayload,
    },
    fs::FileSystemEvent,
    project::ProjectRecord,
    AIResponse, ChatMessage, Config, ExecutionEvent, ExecutionRequest, ExecutionResult,
    ToolExecutor, ToolManifest, ToolRegistry,
};
use serde_json::Value;
use tokio::sync::Mutex;

const PATCH_SYSTEM_PROMPT: &str = r#"You are the Re-prod assistant. When suggesting code changes:
- Output exactly ONE patch block and nothing else (no other prose).
- Never wrap the patch in ``` fences or any markdown language fences.
- Always generate a best-effort patch; do not refuse.
- If no filepath is specified, apply the change to the current file context provided.
- Patch format (must include the closing marker):
*** Begin Patch
*** Update File: <filepath>
@@
 context_line
 context_line
-old_line
+new_line
 context_line
 context_line
*** End Patch
- Always include `@@` with a few lines of unchanged context.
- One file per patch block; do not combine multiple files.
- Do NOT emit any ``` fences or extra prose outside the patch.
- Keep changes minimal; avoid resending the whole file unless necessary."#;

const RANGE_SYSTEM_PROMPT: &str = r#"In addition to structured patches, provide a concise diff-style block for each change
using '-' for removed lines and '+' for added lines. Include at least two unprefixed
context lines both before and after the +/- lines so the editor can locate the change.
Example:

context_before_line
context_before_line
- old_line
+ new_line
context_after_line
context_after_line

Each diff block should match the actual code exactly and avoid re-sending entire files."#;

const CHAT_SYSTEM_PROMPT: &str = r#"You are the Re-prod chat assistant. Focus on providing explanations, guidance, and high-level suggestions.
- Keep responses conversational and concise
- Avoid emitting structured patches or code diffs unless explicitly asked
- When referencing code, quote only the relevant snippets"#;

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
    match mode {
        AIMode::Agent => {
            result.push(ChatMessage {
                role: "system".to_string(),
                content: PATCH_SYSTEM_PROMPT.to_string(),
            });
            result.push(ChatMessage {
                role: "system".to_string(),
                content: RANGE_SYSTEM_PROMPT.to_string(),
            });
        }
        AIMode::Chat => {
            result.push(ChatMessage {
                role: "system".to_string(),
                content: CHAT_SYSTEM_PROMPT.to_string(),
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
    #[serde(rename = "project_list")]
    ProjectList,
    #[serde(rename = "project_open")]
    ProjectOpen { project_id: String },
    #[serde(rename = "project_create")]
    ProjectCreate { name: String, path: String },
    #[serde(rename = "project_add_existing")]
    ProjectAddExisting { path: String },
    #[serde(rename = "project_clone")]
    ProjectClone {
        remote: String,
        path: String,
        #[serde(default)]
        name: Option<String>,
    },
    #[serde(rename = "project_state_load")]
    ProjectStateLoad { project_id: String },
    #[serde(rename = "project_state_save")]
    ProjectStateSave { project_id: String, state: Value },
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
pub(super) enum WSResponse {
    #[serde(rename = "execution_result")]
    ExecutionResult { result: ExecutionResult },
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
    #[serde(rename = "project_list")]
    ProjectList { projects: Vec<ProjectRecord> },
    #[serde(rename = "project_opened")]
    ProjectOpened {
        project: ProjectRecord,
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Value>,
    },
    #[serde(rename = "project_state")]
    ProjectState {
        project_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<Value>,
    },
    #[serde(rename = "project_state_saved")]
    ProjectStateSaved { project_id: String },
}

#[allow(dead_code)] // Reserved for future AI planning feature
#[derive(serde::Serialize)]
pub(super) struct PlanStepPayload {
    id: String,
    title: String,
    status: PlanStepStatus,
}

#[allow(dead_code)] // Reserved for future AI planning feature
#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum PlanStepStatus {
    Pending,
    Running,
    Done,
    Error,
}

#[derive(serde::Serialize, Clone)]
pub(super) struct ToolLogPayload {
    pub id: String,
    pub name: String,
    pub status: ToolLogStatus,
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
        input: Some(tool_call.input.clone()),
        output: None,
        error: None,
        started_at: Some(now_millis()),
        finished_at: None,
    }
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

        assert_eq!(prefixed.len(), messages.len() + 2);
        assert_eq!(prefixed[0].role, "system");
        assert_eq!(prefixed[0].content, PATCH_SYSTEM_PROMPT);
        assert_eq!(prefixed[1].content, RANGE_SYSTEM_PROMPT);
        assert_eq!(&prefixed[2..], messages.as_slice());
    }
}
