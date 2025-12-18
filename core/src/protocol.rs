use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Result of code execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub plots: Vec<PlotInfo>,
    pub execution_time_ms: u64,
}

/// Plot information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlotInfo {
    #[serde(default)]
    pub id: String,
    pub filename: String,
    pub base64_data: String,
    pub index: u32,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub timestamp: Option<u64>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub storage_path: Option<String>,
    #[serde(default)]
    pub snapshot_path: Option<String>,
}

/// Chat message for AI communication
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Tool call from AI
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

/// AI response with optional tool calls
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AIResponse {
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub stop_reason: String,
}

/// Tool result to send back to AI
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolResult {
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

/// File change event
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileChangeEvent {
    pub event_type: String,
    pub path: String,
}

/// Source of an R execution request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum ExecutionSource {
    Selection,
    Cell,
    WholeDocument,
    #[default]
    Unknown,
}

/// Actor initiating the execution event (user vs AI).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum ExecutionActor {
    #[default]
    User,
    Ai,
}

/// Type of code block captured during execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CodeBlockKind {
    Section,
    Chunk,
    Document,
    Selection,
}

/// Metadata describing a captured code block.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CodeBlockMetadata {
    pub id: String,
    pub index: u32,
    pub kind: CodeBlockKind,
    pub label: Option<String>,
    pub start_line: u32,
    pub end_line: u32,
    pub code: String,
}

/// Context supplied when triggering R execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ExecutionContext {
    #[serde(default)]
    pub source: ExecutionSource,
    #[serde(default)]
    pub document_path: Option<String>,
    #[serde(default)]
    pub cell_index: Option<u32>,
    /// Epoch milliseconds supplied by the caller (0 if unknown).
    #[serde(default)]
    pub triggered_at_ms: u64,
    #[serde(default)]
    pub actor: ExecutionActor,
}

/// Incoming execution request from UI/backend client.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionRequest {
    pub code: String,
    #[serde(default)]
    pub context: ExecutionContext,
    #[serde(default)]
    pub blocks: Vec<CodeBlockMetadata>,
    /// Optional plot width in pixels (defaults to DEFAULT_PLOT_WIDTH if not specified)
    #[serde(default)]
    pub plot_width: Option<u32>,
    /// Optional plot height in pixels (defaults to DEFAULT_PLOT_HEIGHT if not specified)
    #[serde(default)]
    pub plot_height: Option<u32>,
}

/// Snapshot of the environment used when executing R code.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentSnapshot {
    pub r_path: String,
    pub working_dir: String,
    pub temp_dir: String,
}

/// Event emitted to the timeline after execution completes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionEvent {
    pub event_id: String,
    pub context: ExecutionContext,
    pub blocks: Vec<CodeBlockMetadata>,
    pub result: ExecutionResult,
    pub environment: EnvironmentSnapshot,
    pub created_at_ms: u64,
    #[serde(default = "default_run_status")]
    pub status: RunStatus,
    #[serde(default)]
    pub started_at_ms: u64,
    #[serde(default)]
    pub finished_at_ms: Option<u64>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

pub fn default_run_status() -> RunStatus {
    RunStatus::Succeeded
}

/// Request to execute a tool capability
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolExecutionRequest {
    pub tool_id: String,
    pub capability_id: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Artifact generated during tool execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArtifactInfo {
    pub path: String,
    pub artifact_type: String,
    pub label: Option<String>,
    pub record_as: String,
}

/// Result of tool execution with provenance metadata
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolExecutionResult {
    pub tool_id: String,
    pub capability_id: String,
    pub success: bool,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub artifacts: Vec<ArtifactInfo>,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

/// Status of a run
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Interrupted,
}

/// Summary metadata for a run
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunSummary {
    pub run_id: String,
    pub status: RunStatus,
    pub started_at_ms: u64,
    #[serde(default)]
    pub finished_at_ms: Option<u64>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub has_stdout: bool,
    #[serde(default)]
    pub has_stderr: bool,
    #[serde(default)]
    pub artifacts: Option<Vec<ArtifactInfo>>,
    #[serde(default)]
    pub plots: Option<Vec<PlotInfo>>, // optional lightweight plot summary
    #[serde(default)]
    pub error: Option<String>,
}

/// Output chunk streamed during execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunOutputChunk {
    pub run_id: String,
    pub stream: RunStream,
    pub chunk: String,
    pub at_ms: u64,
}

/// Stream kind for run output
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunStream {
    Stdout,
    Stderr,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn execution_request_roundtrip() {
        let request = ExecutionRequest {
            code: "print('hello')".to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("analysis.R".to_string()),
                cell_index: Some(2),
                triggered_at_ms: 1_706_000_000_000,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".to_string(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Setup".to_string()),
                start_line: 1,
                end_line: 3,
                code: "# Setup ----\nprint('hello')".to_string(),
            }],
            plot_width: None,
            plot_height: None,
        };

        let json = serde_json::to_string(&request).expect("serialize");
        let parsed: ExecutionRequest = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(parsed, request);
    }

    #[test]
    fn execution_event_roundtrip() {
        let event = ExecutionEvent {
            event_id: "evt-123".to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Selection,
                document_path: Some("analysis.R".into()),
                cell_index: None,
                triggered_at_ms: 1_706_000_123_000,
                actor: ExecutionActor::Ai,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-xyz".into(),
                index: 1,
                kind: CodeBlockKind::Selection,
                label: Some("Selection".into()),
                start_line: 10,
                end_line: 14,
                code: "x <- 1:10".into(),
            }],
            result: ExecutionResult {
                success: true,
                output: "[1] 1 2 3".into(),
                error: None,
                plots: vec![PlotInfo {
                    id: "plot-1".into(),
                    filename: "plot.png".into(),
                    base64_data: "ZGF0YQ==".into(),
                    index: 1,
                    width: Some(800),
                    height: Some(600),
                    timestamp: Some(1_706_000_123_500),
                    code: Some("plot(1:10)".into()),
                    storage_path: Some(".reprod/plots/plot.png".into()),
                    snapshot_path: None,
                }],
                execution_time_ms: 42,
            },
            environment: EnvironmentSnapshot {
                r_path: "Rscript".into(),
                working_dir: "/tmp".into(),
                temp_dir: "/tmp/reprod".into(),
            },
            created_at_ms: 1_706_000_123_500,
            status: RunStatus::Succeeded,
            started_at_ms: 1_706_000_123_000,
            finished_at_ms: Some(1_706_000_123_500),
            duration_ms: Some(500),
        };

        let value = serde_json::to_value(&event).expect("serialize");
        let decoded: ExecutionEvent = serde_json::from_value(value).expect("deserialize");

        assert_eq!(decoded, event);
    }
}
