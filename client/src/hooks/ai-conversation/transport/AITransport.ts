import type { AIMode } from "@/types";
import type { PendingEdit, PlanStep, ToolCallLog } from "@/types";

export type TransportEvent =
	| { type: "CHUNK"; content: string; streamingId: string }
	| { type: "TOOL_CALL"; tool: ToolCallLog; streamingId: string }
	| { type: "TOOL_UPDATE"; tool: ToolCallLog; streamingId: string }
	| { type: "PENDING_EDIT"; edit: PendingEdit; streamingId: string }
	| { type: "PLAN_UPDATE"; steps: PlanStep[]; streamingId: string }
	| { type: "APPROVAL_REQUEST"; request: any; streamingId: string }
	| { type: "DONE"; streamingId: string }
	| { type: "ERROR"; error: string; streamingId: string };

export type TransportListener = (event: TransportEvent) => void;

export interface AITransportRequest {
	id: string; // The client-side tracking ID (streamingId)
	agentSessionId: string;
	mode: AIMode;
	messages: { role: string; content: string }[];
	context: {
		editorFilepath: string;
		editorContent: string;
		workspaceRoot: string;
	};
}

export interface AITransport {
	/**
	 * Starts a conversation stream.
	 * @param request The request details
	 * @returns A cleanup/dispose function that cancels the specific request
	 */
	send(request: AITransportRequest): () => void;

	/**
	 * Subscribes to events from this transport.
	 * @param listener The callback for events
	 * @returns Unsubscribe function
	 */
	onEvent(listener: TransportListener): () => void;

	/**
	 * Explicitly cancels the current session if applicable.
	 */
	cancel(): Promise<void>;
}
