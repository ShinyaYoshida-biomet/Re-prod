// Protocol types (source-of-truth: core/src/protocol.rs)
// NOTE: Keep this file structurally aligned with Rust definitions.
// When updating, verify with `cargo check --workspace` and `pnpm -r lint`.

// Execution metadata shared between frontend and backend (protocol layer)
export type ExecutionSource = "selection" | "cell" | "whole_document" | "unknown";
export type ExecutionActor = "user" | "ai";
export type CodeBlockKind = "section" | "chunk" | "document" | "selection";

export interface CodeBlockMetadata {
	id: string;
	index: number;
	kind: CodeBlockKind;
	label?: string | null;
	start_line: number;
	end_line: number;
	code: string;
}

export interface ExecutionContext {
	source: ExecutionSource;
	document_path?: string | null;
	cell_index?: number | null;
	triggered_at_ms: number; // epoch ms (0 if unknown)
	actor: ExecutionActor;
}

export interface ExecutionRequest {
	code: string;
	context: ExecutionContext;
	blocks: CodeBlockMetadata[];
}

export interface EnvironmentSnapshot {
	r_path: string;
	working_dir: string;
	temp_dir: string;
}

export interface PlotInfo {
	id: string;
	filename: string;
	base64_data: string;
	index: number;
	width?: number | null;
	height?: number | null;
	timestamp?: number | null;
	code?: string | null;
	storage_path?: string | null;
	snapshot_path?: string | null;
}

export interface ExecutionResult {
	success: boolean;
	output: string;
	error?: string | null;
	plots: PlotInfo[];
	execution_time_ms: number;
}

export interface ExecutionEvent {
	event_id: string;
	context: ExecutionContext;
	blocks: CodeBlockMetadata[];
	result: ExecutionResult;
	environment: EnvironmentSnapshot;
	created_at_ms: number;
	status?: RunStatus;
	started_at_ms?: number;
	finished_at_ms?: number | null;
	duration_ms?: number | null;
}

export interface ChatMessage {
	role: string;
	content: string;
}

export interface FileChangeEvent {
	event_type: string;
	path: string;
}

export interface ToolExecutionRequest {
	tool_id: string;
	capability_id: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parameters: Record<string, any>;
}

export interface ArtifactInfo {
	path: string;
	artifact_type: string;
	label?: string | null;
	record_as: string;
}

export interface ToolExecutionResult {
	tool_id: string;
	capability_id: string;
	success: boolean;
	stdout?: string | null;
	stderr?: string | null;
	artifacts: ArtifactInfo[];
	execution_time_ms: number;
	error?: string | null;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted";

export interface RunSummary {
	run_id: string;
	status: RunStatus;
	started_at_ms: number;
	finished_at_ms?: number | null;
	duration_ms?: number | null;
	code?: string | null;
	has_stdout?: boolean;
	has_stderr?: boolean;
	artifacts?: ArtifactInfo[] | null;
	plots?: PlotInfo[] | null;
	error?: string | null;
}

export interface RunOutputChunk {
	run_id: string;
	stream: "stdout" | "stderr";
	chunk: string;
	at_ms: number;
}
