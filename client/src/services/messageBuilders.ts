/**
 * Type-safe message builders for WebSocket communication.
 *
 * These functions ensure that all message payloads conform to the server's
 * expected schema, preventing runtime errors from field name mismatches.
 */

import type {
	AcpContextRequest,
	AIMode,
	ClientMessage,
	ApprovalResponse,
	ExecutionRequestPayload,
	ExportRMarkdownRequestPayload,
	FileSystemAction,
	PlotHistoryExportFormat,
	TimelineQuery,
	ToolExecutionRequestPayload,
} from "@/types";

// Plot history messages
export const plotHistoryMessages = {
	get: (): Extract<ClientMessage, { type: "plot_history_get" }> => ({
		type: "plot_history_get",
	}),

	setActive: (plotId: string): Extract<ClientMessage, { type: "plot_history_set_active" }> => ({
		type: "plot_history_set_active",
		plot_id: plotId,
	}),

	export: (
		plotId: string,
		path: string,
		format?: PlotHistoryExportFormat,
	): Extract<ClientMessage, { type: "plot_history_export" }> => ({
		type: "plot_history_export",
		plot_id: plotId,
		path,
		format: format ?? null,
	}),

	delete: (plotId: string): Extract<ClientMessage, { type: "plot_history_delete" }> => ({
		type: "plot_history_delete",
		plot_id: plotId,
	}),

	save: (): Extract<ClientMessage, { type: "plot_history_save" }> => ({
		type: "plot_history_save",
	}),

	restore: (): Extract<ClientMessage, { type: "plot_history_restore" }> => ({
		type: "plot_history_restore",
	}),

	clear: (): Extract<ClientMessage, { type: "plot_history_clear" }> => ({
		type: "plot_history_clear",
	}),
} as const;

// AI messages
export const aiMessages = {
	send: (options: {
		enableTools?: boolean;
		requestId?: string;
		stream?: boolean;
		mode?: AIMode;
		content: string;
		session_id: string;
		context?: AcpContextRequest;
	}): Extract<ClientMessage, { type: "ai_message" }> => ({
		type: "ai_message",
		enable_tools: options.enableTools ?? false,
		request_id: options.requestId ?? null,
		stream: options.stream ?? false,
		mode: options.mode ?? "agent",
		content: options.content,
		session_id: options.session_id,
		context: options.context ?? null,
	}),
	approvalDecision: (
		decision: ApprovalResponse,
	): Extract<ClientMessage, { type: "agent_approval_decision" }> => ({
		type: "agent_approval_decision",
		decision,
	}),
	cancel: (
		requestId: string,
		agentSessionId: string,
	): Extract<ClientMessage, { type: "ai_cancel" }> => ({
		type: "ai_cancel",
		request_id: requestId,
		agent_session_id: agentSessionId,
	}),
} as const;

// Tool messages
export const toolMessages = {
	list: (): Extract<ClientMessage, { type: "list_tools" }> => ({
		type: "list_tools",
	}),

	execute: (
		request: ToolExecutionRequestPayload,
	): Extract<ClientMessage, { type: "execute_tool" }> => ({
		type: "execute_tool",
		...request,
	}),
} as const;

// Timeline messages
export const timelineMessages = {
	query: (query: TimelineQuery): Extract<ClientMessage, { type: "timeline_query" }> => ({
		type: "timeline_query",
		query: {
			filters: query.filters
				? {
						actor: query.filters.actor ?? null,
						source: query.filters.source ?? null,
						startTime: query.filters.startTime ?? null,
						endTime: query.filters.endTime ?? null,
						hasPlots: query.filters.hasPlots ?? null,
						hasErrors: query.filters.hasErrors ?? null,
						codeContains: query.filters.codeContains ?? null,
					}
				: null,
			sort: query.sort ?? null,
			limit: query.limit ?? null,
			offset: query.offset ?? null,
		},
	}),

	statsQuery: (): Extract<ClientMessage, { type: "timeline_stats_query" }> => ({
		type: "timeline_stats_query",
	}),
} as const;

// Execution messages
export const executionMessages = {
	execute: (request: ExecutionRequestPayload): Extract<ClientMessage, { type: "execute" }> => ({
		type: "execute",
		request,
	}),

	interrupt: (): Extract<ClientMessage, { type: "interrupt_execution" }> => ({
		type: "interrupt_execution",
	}),

	restart: (): Extract<ClientMessage, { type: "restart_session" }> => ({
		type: "restart_session",
	}),
} as const;

// File System messages
export const fsMessages = {
	action: (
		action: FileSystemAction,
		path: string,
		options?: { content?: string; to?: string },
	): Extract<ClientMessage, { type: "fs_action" }> => ({
		type: "fs_action",
		action,
		path,
		content: options?.content ?? null,
		to: options?.to ?? null,
	}),
} as const;

// Export messages
export const exportMessages = {
	exportRMarkdown: (
		request: ExportRMarkdownRequestPayload,
	): Extract<ClientMessage, { type: "export_rmarkdown" }> => ({
		type: "export_rmarkdown",
		request,
	}),
} as const;
