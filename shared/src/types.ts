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
	ToolExecutionRequest as ProtocolToolExecutionRequest,
	ToolExecutionResult as ProtocolToolExecutionResult,
} from "./protocol-types";

// Protocol aliases to keep existing payload naming conventions in the client.
export type ExecutionSource = ProtocolExecutionSource;
export type ExecutionActor = ProtocolExecutionActor;
export type CodeBlockKind = ProtocolCodeBlockKind;
export type ExecutionContextPayload = ProtocolExecutionContext;
export type CodeBlockMetadataPayload = ProtocolCodeBlockMetadata;
export type ExecutionRequestPayload = ProtocolExecutionRequest;
export type ExecutionEventPayload = ProtocolExecutionEvent;
export type ExecutionResultPayload = ProtocolExecutionResult;
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

export type AIMode = "agent" | "chat";

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
	| "root";

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
	stdout: string;
	stderr: string;
	plots: ExecutionLogPlot[];
	timestamp: number;
	duration: number;
	success: boolean;
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

export interface PlanStep {
	id: string;
	title: string;
	status: PlanStepStatus;
}

export type ToolCallStatus = "pending" | "running" | "done" | "error";

export interface ToolCallLog {
	id: string;
	name: string;
	status: ToolCallStatus;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	error?: string;
	startedAt?: number;
	finishedAt?: number;
}

export interface AIResponse {
	message: string;
	suggestedCode?: string; // Deprecated: use codeBlocks instead
	codeBlocks?: CodeBlock[];
	explanation?: string;
	timestamp: number;
}

// UI State Types
export interface LayoutState {
	editorWidth: number;
	rightPanelWidth: number;
	aiPanelHeight: number;
	consoleHeight: number;
}

export interface EditorState {
	content: string;
	filepath: string;
	isDirty: boolean;
	cursorPosition: { line: number; column: number };
}

export interface ExecutionState {
	isRunning: boolean;
	currentCell?: number;
	results: ExecutionLogEntry[];
	history: ExecutionLogEntry[];
}

export interface AIState {
	messages: AIMessage[];
	isLoading: boolean;
	suggestions: string[];
}

export interface AIMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	mode?: AIMode;
	code?: string; // Deprecated: use codeBlocks instead
	codeBlocks?: CodeBlock[];
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
