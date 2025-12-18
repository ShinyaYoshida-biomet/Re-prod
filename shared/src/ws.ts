import type { TimelineMessage, TimelineQuery, TimelineResponse, TimelineStats } from "./timeline";
import type { ToolManifest } from "./tools";
import type {
	AIMode,
	ChatMessagePayload,
	CodeBlock,
	ExecutionRequestPayload,
	FileEntryPayload,
	FileSystemAction,
	FileSystemEventPayload,
	PlanStep,
	ProjectRecord,
	RunOutputChunk,
	RunSummary,
	ToolCallLog,
	ToolExecutionRequestPayload,
} from "./types";

type ToolExecutionResponse = {
	tool_id: string;
	/* eslint-disable @typescript-eslint/naming-convention */
	capability_id: string;
	success: boolean;
	stdout?: string | null;
	stderr?: string | null;
	execution_time_ms: number;
	error?: string | null;
};

export type ExportMode = "timeline" | "document";
export type ExportFormat = "rmarkdown" | "pdf";
export type CodeFolding = "show" | "hide";

export interface OutputTruncationOptions {
	headLines: number;
	tailLines: number;
	maxLines: number;
}

export interface PdfExportOptions {
	toc: boolean;
	includeSource: boolean;
	highlightTheme?: string;
	figWidth?: number;
	figHeight?: number;
	latexPreamble?: string | null;
}

export interface PlotHistoryEntryPayload {
	id: string;
	timestamp: number;
	width: number;
	height: number;
	filename: string;
	storagePath: string;
	data: string;
	code?: string | null;
	snapshotPath?: string | null;
}

export interface PlotHistoryStatePayload {
	activePlotId?: string | null;
	plots: PlotHistoryEntryPayload[];
}

export type PlotHistoryExportFormat = "png" | "pdf";

export interface ExportRMarkdownRequestPayload {
	mode: ExportMode;
	format?: ExportFormat;
	outputPath: string;
	documentPath?: string;
	codeFolding?: CodeFolding;
	includeTimestamps: boolean;
	showActor: boolean;
	embedPlots: boolean;
	includeOutputs: boolean;
	includeErrors: boolean;
	includeSummary: boolean;
	outputTruncation?: OutputTruncationOptions;
	pdfOptions?: PdfExportOptions;
}

export interface ExportRMarkdownResponsePayload {
	success: boolean;
	outputPath: string;
	error?: string | null;
}

export type ClientMessage =
	| { type: "execute"; request: ExecutionRequestPayload }
	| {
			type: "ai_message";
			messages: ChatMessagePayload[];
			enable_tools?: boolean;
			request_id?: string;
			stream?: boolean;
			mode?: AIMode;
	  }
	| { type: "list_tools" }
	| ({ type: "execute_tool" } & ToolExecutionRequestPayload)
	| { type: "timeline_query"; query: TimelineQuery }
	| { type: "timeline_stats_query" }
	| {
			type: "export_rmarkdown";
			request: ExportRMarkdownRequestPayload;
	  }
	| { type: "interrupt_execution" }
	| { type: "restart_session" }
	| {
			type: "fs_action";
			action: FileSystemAction;
			path: string;
			content?: string;
			to?: string;
	  }
	| { type: "project_list" }
	| { type: "project_open"; project_id: string }
	| { type: "project_create"; name: string; path: string }
	| { type: "project_add_existing"; path: string }
	| { type: "project_clone"; remote: string; path: string; name?: string }
	| { type: "project_state_load"; project_id: string }
	| {
			type: "project_state_save";
			project_id: string;
			state: Record<string, unknown>;
	  }
	| { type: "plot_history_get" }
	| { type: "plot_history_set_active"; plot_id: string }
	| { type: "plot_history_export"; plot_id: string; path: string; format?: PlotHistoryExportFormat }
	| { type: "plot_history_delete"; plot_id: string }
	| { type: "plot_history_save" }
	| { type: "plot_history_restore" }
	| { type: "plot_history_clear" }
	| { type: "run_query"; limit?: number };

type TimelineEventPush = Extract<TimelineMessage, { type: "timeline_event_added" }>;

export type ServerMessage =
	| { type: "ai_response"; response: string }
	| {
			type: "ai_response_with_tools";
			response: {
				content: string;
				tool_calls?: Array<{ name: string; input: Record<string, any> }>;
			};
	  }
	| { type: "ai_response_chunk"; id: string; chunk: string }
	| { type: "ai_response_complete"; id: string; final: string; codeBlocks?: CodeBlock[] }
	| { type: "ai_plan_updated"; id: string; plan: PlanStep[] }
	| { type: "ai_tool_started"; id: string; tool: ToolCallLog }
	| { type: "ai_tool_finished"; id: string; tool: ToolCallLog }
	| { type: "error"; message: string }
	| { type: "tools"; tools: ToolManifest[] }
	| ({ type: "tool_execution_result" } & ToolExecutionResponse)
	| { type: "timeline_response"; data: TimelineResponse }
	| { type: "timeline_stats_response"; stats: TimelineStats }
	| { type: "export_rmarkdown_response"; response: ExportRMarkdownResponsePayload }
	| { type: "execution_interrupted"; success: boolean }
	| { type: "session_restarted"; cleared_events: number }
	| { type: "fs_event"; event: FileSystemEventPayload }
	| {
			type: "fs_result";
			action: FileSystemAction;
			path: string;
			to?: string;
			success: boolean;
			data?: FileEntryPayload[] | string | null;
			error?: string | null;
	  }
	| { type: "project_list"; projects: ProjectRecord[] }
	| { type: "project_opened"; project: ProjectRecord; state?: Record<string, unknown> | null }
	| { type: "project_state"; project_id: string; state?: Record<string, unknown> | null }
	| { type: "project_state_saved"; project_id: string }
	| {
			type: "plot_history_state";
			activePlotId?: string | null;
			plots: PlotHistoryEntryPayload[];
	  }
	| {
			type: "plot_history_updated";
			activePlotId?: string | null;
			plots: PlotHistoryEntryPayload[];
	  }
	| { type: "plot_history_exported"; success: boolean; path: string; error?: string | null }
	| {
			type: "plot_history_deleted";
			state?: PlotHistoryEntryPayload[];
			activePlotId?: string | null;
			error?: string | null;
	  }
	| {
			type: "plot_history_saved";
	  }
	| {
			type: "plot_history_restored";
			state?: PlotHistoryEntryPayload[];
			activePlotId?: string | null;
			error?: string | null;
	  }
	| {
			type: "plot_history_cleared";
			state?: PlotHistoryEntryPayload[];
			activePlotId?: string | null;
			error?: string | null;
	  }
	| { type: "run_state"; runs: RunSummary[] }
	| { type: "run_accepted"; run_id: string }
	| { type: "run_started"; run: RunSummary }
	| ({ type: "run_output" } & RunOutputChunk)
	| { type: "run_finished"; run: RunSummary }
	| TimelineEventPush;

export type ServerMessageType = ServerMessage["type"];

export type ExtractServerMessage<TType extends ServerMessageType> = Extract<
	ServerMessage,
	{ type: TType }
>;
