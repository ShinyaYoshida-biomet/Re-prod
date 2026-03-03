// Import protocol types
import type {
	ArtifactInfo as ProtocolArtifactInfo,
	ChatMessage as ProtocolChatMessage,
	CodeBlockKind as ProtocolCodeBlockKind,
	CodeBlockMetadata as ProtocolCodeBlockMetadata,
	EnvironmentSnapshot as ProtocolEnvironmentSnapshot,
	ExecutionActor as ProtocolExecutionActor,
	ExecutionContext as ProtocolExecutionContext,
	ExecutionEvent as ProtocolExecutionEvent,
	ExecutionRequest as ProtocolExecutionRequest,
	ExecutionResult as ProtocolExecutionResult,
	ExecutionSource as ProtocolExecutionSource,
	FileChangeEvent as ProtocolFileChangeEvent,
	PlotInfo as ProtocolPlotInfo,
	RunOutputChunk as ProtocolRunOutputChunk,
	RunStatus as ProtocolRunStatus,
	RunSummary as ProtocolRunSummary,
	ToolExecutionRequest as ProtocolToolExecutionRequest,
	ToolExecutionResult as ProtocolToolExecutionResult,
} from "./protocol";

// Protocol aliases to keep existing payload naming conventions in the client.
export type ExecutionSource = ProtocolExecutionSource;
export type ExecutionActor = ProtocolExecutionActor;
export type CodeBlockKind = ProtocolCodeBlockKind;
export type ExecutionContextPayload = ProtocolExecutionContext;
export type CodeBlockMetadataPayload = ProtocolCodeBlockMetadata;
export type ExecutionRequestPayload = ProtocolExecutionRequest;
export type ExecutionEventPayload = ProtocolExecutionEvent;
export type ExecutionResultPayload = ProtocolExecutionResult;
export type RunStatus = ProtocolRunStatus;
export type RunSummary = ProtocolRunSummary;
export type RunOutputChunk = ProtocolRunOutputChunk;
export type PlotInfoPayload = ProtocolPlotInfo;
export type EnvironmentSnapshotPayload = ProtocolEnvironmentSnapshot;
export type ChatMessagePayload = ProtocolChatMessage;
export type FileChangeEventPayload = ProtocolFileChangeEvent;
export type ArtifactInfoPayload = ProtocolArtifactInfo;
export type ToolExecutionRequestPayload = ProtocolToolExecutionRequest;
export type ToolExecutionResultPayload = ProtocolToolExecutionResult;
// Project metadata shared between frontend and backend
export interface ProjectRecord {
	id: string;
	name: string;
	path: string;
	created_at: number;
	last_opened_at?: number | null;
	git_remote?: string | null;
}

export type AIMode = import("./generated/AIMode").AIMode;

export interface FileEntryPayload {
	path: string;
	name: string;
	is_dir: boolean;
	size?: number;
	children?: FileEntryPayload[] | null;
}

export type FileSystemEventPayload =
	| { type: "created"; path: string }
	| { type: "deleted"; path: string }
	| { type: "modified"; path: string }
	| { type: "renamed"; from: string; to: string }
	| { type: "error"; message: string };

export type FileSystemAction =
	| "list"
	| "read"
	| "write"
	| "delete"
	| "rename"
	| "create_dir"
	| "copy"
	| "root"
	| "open_external";

// UI-facing execution log structures
export interface ExecutionLogPlot {
	id: string;
	path: string;
	data: string; // base64 encoded image
	timestamp: number;
	width?: number | null;
	height?: number | null;
	code?: string | null;
	storagePath?: string | null;
}

export interface ExecutionLogEntry {
	runId?: string;
	code: string;
	stdout: string;
	stderr: string;
	plots: ExecutionLogPlot[];
	timestamp: number;
	duration: number;
	success: boolean;
	/** Optional flag for UI to show a pending/running entry before results arrive. */
	pending?: boolean;
}

export type CodeChangeAction =
	| "replace-all"
	| "replace-range"
	| "insert"
	| "create-file"
	| "delete-range";

export interface PatchChunk {
	context?: string;
	oldLines: string[];
	newLines: string[];
}

export interface SimpleCodeChange {
	beforeContext: string[];
	afterContext: string[];
	oldLines: string[];
	newLines: string[];
}

export interface CodeRange {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

export interface CodeBlock {
	id: string;
	code: string;
	language: "r";
	action: CodeChangeAction;
	targetRange?: CodeRange;
	filepath?: string;
	patchChunks?: PatchChunk[];
	simpleChanges?: SimpleCodeChange[];
	patchText?: string;
	checksum?: string;
	explanation?: string;
	originalCode?: string;
}

export type PlanStepStatus = "pending" | "running" | "done" | "error";
export type PlanStepKind = "plan";

export interface PlanStep {
	id: string;
	title: string;
	status: PlanStepStatus;
	kind?: PlanStepKind;
	error?: string;
	startedAt?: number;
	finishedAt?: number;
	waitingReason?: string;
}

export type ToolCallStatus = "pending" | "running" | "done" | "error" | string;

export interface ToolCallLog {
	id: string;
	name: string;
	status: ToolCallStatus;
	input?: Record<string, unknown> | null;
	output?: Record<string, unknown> | null;
	error?: string | null;
	startedAt?: number | null;
	finishedAt?: number | null;
	// ACP-specific fields
	kind?: string | null;
	locations?: string[];
}

export type AgentEventType =
	| "thought"
	| "tool_request"
	| "tool_result"
	| "task"
	| "plan_update"
	| "artifact"
	| "error";

export type AgentEventStatus =
	| "pending"
	| "running"
	| "done"
	| "error"
	| "blocked"
	| "approved"
	| "denied"
	| string;

export type ArtifactKind = "file_read" | "file_write" | "command" | "test_result";

export interface ToolPreview {
	kind: string;
	filepath?: string | null;
	diff?: string | null;
	command?: string | null;
	affectedLines?: number | null;
}

export interface AgentEvent {
	id: string;
	type: AgentEventType;
	status: AgentEventStatus;
	timestamp: number;
	parentId?: string | null;
}

export interface ThoughtEvent extends AgentEvent {
	type: "thought";
	text: string;
	reasoning?: string;
}

export interface ToolRequestEvent extends AgentEvent {
	type: "tool_request";
	tool: string;
	input: Record<string, unknown>;
	requiresApproval: boolean;
	preview?: ToolPreview | null;
}

export interface ToolResultEvent extends AgentEvent {
	type: "tool_result";
	tool: string;
	requestId: string;
	output?: Record<string, unknown> | null;
	error?: string | null;
}

export interface TaskEvent extends AgentEvent {
	type: "task";
	label: string;
	deps: string[];
}

export interface PlanUpdateEvent extends AgentEvent {
	type: "plan_update";
	steps: PlanStep[];
}

export interface ArtifactEvent extends AgentEvent {
	type: "artifact";
	kind: ArtifactKind;
	path?: string;
	summary: string;
	details?: {
		diff?: string | null;
		exitCode?: number | null;
		stdout?: string | null;
		stderr?: string | null;
		testsPassed?: number | null;
		testsFailed?: number | null;
		oldText?: string | null;
		newText?: string | null;
	} | null;
}

export interface ErrorEvent extends AgentEvent {
	type: "error";
	message: string;
	recoverable: boolean;
	suggestedAction?: string;
}

export type ApprovalOption = "approve_once" | "approve_session" | "edit" | "deny";

export interface ApprovalRequest {
	eventId: string;
	tool: string;
	preview: ToolPreview;
	previewText?: string | null;
	title?: string | null;
	subtitle?: string | null;
	options: ApprovalOption[];
	input?: Record<string, unknown> | null;
}

export interface ApprovalResponse {
	eventId: string;
	decision: ApprovalOption;
	editedInput: Record<string, unknown> | null;
}

export interface AIMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	mode?: AIMode;
	codeBlocks?: CodeBlock[];
	events?: AgentEvent[];
	approvalQueue?: ApprovalRequest[];
	artifacts?: ArtifactEvent[];
	planSteps?: PlanStep[];
	toolLogs?: ToolCallLog[];
	streamingId?: string;
	isComplete?: boolean;
	timestamp: number;
}

export interface AppSettings {
	autoRun: boolean;
	theme: "phylo";
	rPath: string;
	fontSize: number;
	// Cell execution features (easy to disable)
	showCellDecorations: boolean;
	highlightExecutingCell: boolean;
}
