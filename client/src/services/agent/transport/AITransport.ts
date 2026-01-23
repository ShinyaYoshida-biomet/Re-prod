import type { AIMode, TransportEvent } from "@/types";

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
