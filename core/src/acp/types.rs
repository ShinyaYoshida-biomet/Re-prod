use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpInitializeResponse {
    pub workspace_root: std::path::PathBuf,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPromptMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpContextRequest {
    pub user_input: String,
    pub active_buffer_path: Option<String>,
    pub console_history_limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPromptRequest {
    pub session_id: String,
    pub messages: Vec<AcpPromptMessage>,
    pub context: Option<AcpContextRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionUpdateEnvelope {
    pub session_id: String,
    pub update: AcpSessionUpdate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpAvailableCommand {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AcpPlanStepStatus {
    Pending,
    Running,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPlanStep {
    pub id: String,
    pub title: String,
    pub status: AcpPlanStepStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "startedAt")]
    pub started_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "finishedAt")]
    pub finished_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "waitingReason")]
    pub waiting_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AcpSessionUpdate {
    UserMessageChunk {
        text: String,
    },
    AgentMessageChunk {
        text: String,
    },
    AgentThoughtChunk {
        text: String,
    },
    Plan {
        steps: Vec<AcpPlanStep>,
    },
    ToolCall {
        id: String,
        title: String,
        kind: String,
        status: String,
        locations: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    ToolCallUpdate {
        id: String,
        status: Option<String>,
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    AvailableCommands {
        commands: Vec<AcpAvailableCommand>,
    },
    Done,
}

impl AcpSessionUpdate {
    /// Short label for tracing / logging.
    pub fn kind_label(&self) -> &'static str {
        match self {
            Self::UserMessageChunk { .. } => "UserMessageChunk",
            Self::AgentMessageChunk { .. } => "AgentMessageChunk",
            Self::AgentThoughtChunk { .. } => "AgentThoughtChunk",
            Self::Plan { .. } => "Plan",
            Self::ToolCall { .. } => "ToolCall",
            Self::ToolCallUpdate { .. } => "ToolCallUpdate",
            Self::AvailableCommands { .. } => "AvailableCommands",
            Self::Done => "Done",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpCancelRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionRequestPayload {
    pub request_id: String,
    pub session_id: String,
    pub tool_call_id: String,
    pub tool_title: Option<String>,
    pub tool_kind: Option<String>,
    pub raw_input: Option<String>,
    pub trust_key: String,
    pub locations: Vec<String>,
    pub options: Vec<AcpPermissionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AcpPermissionDecisionOutcome {
    AllowOnce,
    AllowAlways,
    RejectOnce,
    RejectAlways,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionDecision {
    pub request_id: String,
    pub outcome: AcpPermissionDecisionOutcome,
    pub option_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remember_scope: Option<AcpPermissionDecisionScope>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AcpPermissionDecisionScope {
    None,
    Session,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpDetectedAgent {
    pub id: String,
    pub name: String,
    pub command: String,
    pub available: bool,
    pub path: Option<std::path::PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpAgentConfig {
    pub active_mode: String,
    pub active_agent: Option<String>,
    pub active_agent_command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_agent_args: Option<Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;
}
