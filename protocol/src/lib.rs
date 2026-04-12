use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ===== Execution Types =====

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub plots: Vec<PlotInfo>,
    pub execution_time_ms: u64,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AIResponse {
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub stop_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolResult {
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileChangeEvent {
    pub event_type: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentVariable {
    pub name: String,
    #[serde(rename = "type")]
    pub var_type: String,
    pub size: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionSource {
    Selection,
    Cell,
    WholeDocument,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionActor {
    #[default]
    User,
    Ai,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CodeBlockKind {
    Section,
    Chunk,
    Document,
    Selection,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ExecutionContext {
    #[serde(default)]
    pub source: ExecutionSource,
    #[serde(default)]
    pub document_path: Option<String>,
    #[serde(default)]
    pub cell_index: Option<u32>,
    #[serde(default)]
    pub triggered_at_ms: u64,
    #[serde(default)]
    pub actor: ExecutionActor,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionRequest {
    pub code: String,
    #[serde(default)]
    pub context: ExecutionContext,
    #[serde(default)]
    pub blocks: Vec<CodeBlockMetadata>,
    #[serde(default)]
    pub plot_width: Option<u32>,
    #[serde(default)]
    pub plot_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EnvironmentSnapshot {
    pub r_version: Option<String>,
    pub r_path: String,
    pub working_dir: String,
    pub temp_dir: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolExecutionRequest {
    pub tool_id: String,
    pub capability_id: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArtifactInfo {
    pub path: String,
    pub artifact_type: String,
    pub label: Option<String>,
    pub record_as: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Interrupted,
}

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
    pub plots: Option<Vec<PlotInfo>>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunOutputChunk {
    pub run_id: String,
    pub stream: RunStream,
    pub chunk: String,
    pub at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunStream {
    Stdout,
    Stderr,
}

// ===== Diff Types =====

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffChange {
    pub id: String,
    #[serde(rename = "type")]
    pub change_type: DiffChangeType,
    pub original_start_line: u32,
    pub original_end_line: u32,
    pub modified_start_line: u32,
    pub modified_end_line: u32,
    pub old_lines: Vec<String>,
    pub new_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiffChangeType {
    Add,
    Remove,
    Modify,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: DiffLineType,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineType {
    Context,
    Add,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub id: String,
    pub index: u32,
    pub change: DiffChange,
    pub lines: Vec<DiffLine>,
}

// ===== File System Types =====

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FileSystemEvent {
    Created { path: String },
    Deleted { path: String },
    Modified { path: String },
    Renamed { from: String, to: String },
    Error { message: String },
}

// ===== Project Types =====

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
    #[serde(default)]
    pub last_opened_at: Option<u64>,
    #[serde(default)]
    pub git_remote: Option<String>,
}

// ===== Plot History Types =====

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlotHistoryEntry {
    pub id: String,
    pub timestamp: i64,
    pub width: u32,
    pub height: u32,
    pub filename: String,
    pub storage_path: String,
    pub data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlotHistorySnapshot {
    pub active_plot_id: Option<String>,
    pub plots: Vec<PlotHistoryEntry>,
}

// ===== Timeline Types =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineQueryPayload {
    pub filters: Option<TimelineFiltersPayload>,
    pub sort: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineFiltersPayload {
    pub actor: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: Option<u64>,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
    #[serde(rename = "hasPlots")]
    pub has_plots: Option<bool>,
    #[serde(rename = "hasErrors")]
    pub has_errors: Option<bool>,
    #[serde(rename = "codeContains")]
    pub code_contains: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineResponsePayload {
    pub events: Vec<ExecutionEvent>,
    pub total: u32,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
    pub query: TimelineQueryEcho,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineQueryEcho {
    pub filters: Option<TimelineFiltersEcho>,
    pub sort: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineFiltersEcho {
    pub actor: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "startTime")]
    pub start_time: Option<u64>,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
    #[serde(rename = "hasPlots")]
    pub has_plots: Option<bool>,
    #[serde(rename = "hasErrors")]
    pub has_errors: Option<bool>,
    #[serde(rename = "codeContains")]
    pub code_contains: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineStatsPayload {
    #[serde(rename = "totalEvents")]
    pub total_events: u32,
    #[serde(rename = "totalPlots")]
    pub total_plots: u32,
    #[serde(rename = "totalErrors")]
    pub total_errors: u32,
    #[serde(rename = "userActions")]
    pub user_actions: u32,
    #[serde(rename = "aiActions")]
    pub ai_actions: u32,
    #[serde(rename = "sessionStartTime")]
    pub session_start_time: u64,
    #[serde(rename = "sessionEndTime")]
    pub session_end_time: u64,
    #[serde(rename = "sessionDuration")]
    pub session_duration: u64,
}

// ===== Export Types =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRMarkdownRequest {
    pub mode: String,
    #[serde(default = "default_export_format")]
    pub format: String,
    #[serde(rename = "outputPath")]
    pub output_path: String,
    #[serde(rename = "documentPath")]
    pub document_path: Option<String>,
    #[serde(rename = "codeFolding")]
    pub code_folding: Option<String>,
    #[serde(rename = "includeTimestamps")]
    pub include_timestamps: bool,
    #[serde(rename = "showActor")]
    pub show_actor: bool,
    #[serde(rename = "embedPlots")]
    pub embed_plots: bool,
    #[serde(rename = "includeOutputs")]
    pub include_outputs: bool,
    #[serde(rename = "includeErrors")]
    pub include_errors: bool,
    #[serde(rename = "includeSummary")]
    pub include_summary: bool,
    #[serde(rename = "outputTruncation")]
    pub output_truncation: Option<OutputTruncationPayload>,
    #[serde(rename = "pdfOptions")]
    pub pdf_options: Option<PdfOptionsPayload>,
}

fn default_export_format() -> String {
    "rmarkdown".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfOptionsPayload {
    #[serde(default = "bool_true")]
    pub toc: bool,
    #[serde(rename = "includeSource", default = "bool_true")]
    pub include_source: bool,
    #[serde(rename = "highlightTheme", default = "default_highlight_theme")]
    pub highlight_theme: String,
    #[serde(rename = "figWidth", default = "default_fig_width")]
    pub fig_width: f64,
    #[serde(rename = "figHeight", default = "default_fig_height")]
    pub fig_height: f64,
    #[serde(rename = "latexPreamble")]
    pub latex_preamble: Option<String>,
}

const fn bool_true() -> bool {
    true
}

fn default_highlight_theme() -> String {
    "tango".to_string()
}

const fn default_fig_width() -> f64 {
    7.0
}

const fn default_fig_height() -> f64 {
    5.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputTruncationPayload {
    #[serde(default = "default_head_lines")]
    pub head_lines: usize,
    #[serde(default = "default_tail_lines")]
    pub tail_lines: usize,
    #[serde(default = "default_max_lines")]
    pub max_lines: usize,
}

impl Default for OutputTruncationPayload {
    fn default() -> Self {
        Self {
            head_lines: default_head_lines(),
            tail_lines: default_tail_lines(),
            max_lines: default_max_lines(),
        }
    }
}

const fn default_head_lines() -> usize {
    20
}

const fn default_tail_lines() -> usize {
    8
}

const fn default_max_lines() -> usize {
    200
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRMarkdownResponse {
    pub success: bool,
    #[serde(rename = "outputPath")]
    pub output_path: String,
    pub error: Option<String>,
}

// ===== ACP Types =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPromptMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpContextRequest {
    pub user_input: String,
    #[serde(default)]
    pub active_buffer_path: Option<String>,
    #[serde(default)]
    pub console_history_limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionDecision {
    pub request_id: String,
    pub outcome: AcpPermissionDecisionOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpPermissionDecisionOutcome {
    AllowOnce,
    AllowAlways,
    RejectOnce,
    RejectAlways,
    Cancelled,
}

// ===== Tool Manifest Types =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolManifest {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub kind: ToolKind,
    pub description: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub runtime: Option<RuntimeConfig>,
    #[serde(default)]
    pub validation: Option<ValidationConfig>,
    #[serde(default)]
    pub capabilities: Vec<CapabilityDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    RPackage,
    Cli,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default)]
    pub system_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    #[serde(default)]
    pub check_installed: bool,
    #[serde(default)]
    pub min_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityDescriptor {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub kind: CapabilityKind,
    pub description: String,
    pub entrypoint: String,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default, rename = "inputSpec")]
    pub input_spec: Vec<ParameterSpec>,
    #[serde(default, rename = "outputSpec")]
    pub output_spec: Vec<OutputSpec>,
    #[serde(default, rename = "postValidation")]
    pub post_validation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityKind {
    RFunction,
    RSnippet,
    CliCommand,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterSpec {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "type")]
    pub param_type: ParameterType,
    pub required: bool,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, rename = "defaultValue")]
    pub default_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParameterType {
    String,
    Number,
    Boolean,
    FilePath,
    Expression,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputSpec {
    pub name: String,
    #[serde(rename = "type")]
    pub output_type: OutputType,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, rename = "recordAs")]
    pub record_as: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputType {
    Text,
    Plot,
    File,
    Table,
    Artifact,
}

// ===== WebSocket Message Types =====

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AIMode {
    Agent,
    Chat,
}

impl Default for AIMode {
    fn default() -> Self {
        Self::Agent
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalOption {
    ApproveOnce,
    ApproveSession,
    Edit,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalDecisionPayload {
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub decision: ApprovalOption,
    #[serde(skip_serializing_if = "Option::is_none", rename = "editedInput")]
    pub edited_input: Option<serde_json::Value>,
}

/// Client-to-server WebSocket request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WSRequest {
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
        parameters: HashMap<String, serde_json::Value>,
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

/// Server-to-client WebSocket response.
/// Uses serde_json::Value for complex nested payload types to keep the protocol
/// crate lightweight and WASM-compatible.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WSResponse {
    #[serde(rename = "ai_response")]
    AIResponseSimple { response: String },
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
        code_blocks: Option<Vec<serde_json::Value>>,
    },
    #[serde(rename = "agent_event")]
    AgentEvent {
        id: String,
        event: serde_json::Value,
    },
    #[serde(rename = "approval_request")]
    ApprovalRequest {
        id: String,
        request: serde_json::Value,
    },
    #[serde(rename = "pending_edit_created")]
    PendingEditCreated { edit: serde_json::Value },
    #[serde(rename = "ai_tool_started")]
    AIToolStarted { id: String, tool: serde_json::Value },
    #[serde(rename = "ai_tool_finished")]
    AIToolFinished { id: String, tool: serde_json::Value },
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
    FileSystemEventMsg { event: FileSystemEvent },
    #[serde(rename = "fs_result")]
    FileSystemResult {
        action: String,
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        to: Option<String>,
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "project_opened")]
    ProjectOpened {
        project: ProjectRecord,
        #[serde(skip_serializing_if = "Option::is_none")]
        state: Option<serde_json::Value>,
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
    #[serde(rename = "environment_data")]
    EnvironmentData { variables: Vec<EnvironmentVariable> },
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
    fn ws_request_serialization() {
        let request = WSRequest::Execute {
            request: ExecutionRequest {
                code: "1+1".to_string(),
                context: ExecutionContext::default(),
                blocks: vec![],
                plot_width: None,
                plot_height: None,
            },
        };
        let json = serde_json::to_string(&request).expect("serialize");
        assert!(json.contains("\"type\":\"execute\""));
    }

    #[test]
    fn ws_response_deserialization() {
        let json = r#"{"type":"ai_response_chunk","id":"abc","chunk":"hello"}"#;
        let response: WSResponse = serde_json::from_str(json).expect("deserialize");
        match response {
            WSResponse::AIResponseChunk { id, chunk } => {
                assert_eq!(id, "abc");
                assert_eq!(chunk, "hello");
            }
            _ => panic!("Expected AIResponseChunk"),
        }
    }

    #[test]
    fn ws_response_run_output_deserialization() {
        let json = r#"{"type":"run_output","run_id":"r1","stream":"stdout","chunk":"output","at_ms":100}"#;
        let response: WSResponse = serde_json::from_str(json).expect("deserialize");
        match response {
            WSResponse::RunOutput(chunk) => {
                assert_eq!(chunk.run_id, "r1");
                assert_eq!(chunk.chunk, "output");
            }
            _ => panic!("Expected RunOutput"),
        }
    }

    #[test]
    fn ai_mode_default() {
        let mode: AIMode = Default::default();
        let json = serde_json::to_string(&mode).expect("serialize");
        assert_eq!(json, "\"agent\"");
    }

    #[test]
    fn project_record_roundtrip() {
        let record = ProjectRecord {
            id: "p1".to_string(),
            name: "Test".to_string(),
            path: "/tmp/test".to_string(),
            created_at: 1000,
            last_opened_at: Some(2000),
            git_remote: None,
        };
        let json = serde_json::to_string(&record).expect("serialize");
        let parsed: ProjectRecord = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed, record);
    }
}
