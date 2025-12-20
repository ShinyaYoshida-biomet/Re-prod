use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct AcpInitializeResponse {
    #[ts(type = "string")]
    pub workspace_root: std::path::PathBuf,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct AcpPromptMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct AcpPromptRequest {
    pub session_id: String,
    pub messages: Vec<AcpPromptMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct AcpSessionUpdateEnvelope {
    pub session_id: String,
    pub update: AcpSessionUpdate,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub enum AcpSessionUpdate {
    UserMessageChunk { text: String },
    AgentMessageChunk { text: String },
    AgentThoughtChunk { text: String },
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub struct AcpCancelRequest {
    pub session_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        AcpInitializeResponse::export().unwrap();
        AcpPromptMessage::export().unwrap();
        AcpPromptRequest::export().unwrap();
        AcpSessionUpdateEnvelope::export().unwrap();
        AcpSessionUpdate::export().unwrap();
        AcpCancelRequest::export().unwrap();
    }
}
