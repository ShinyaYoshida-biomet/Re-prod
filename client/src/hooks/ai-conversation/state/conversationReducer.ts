export interface ConversationState {
	activeRequestId: string | null;
	lastRequestId: string | null;
	isLoading: boolean;
	acpSessionId: string | null;
	streamingIdMap: Record<string, string>; // sessionId -> streamingId
	lastChunkKinds: Record<string, "message" | "thought" | "tool">;
}

export type ConversationAction =
	| { type: "STREAM_START"; requestId: string }
	| { type: "STREAM_DONE"; requestId: string }
	| { type: "STREAM_ERROR"; requestId: string; error: string }
	| { type: "SET_ACP_SESSION"; sessionId: string; requestId: string }
	| { type: "RECORD_CHUNK_KIND"; streamingId: string; kind: "message" | "thought" | "tool" }
	| { type: "RESET" };

export const initialState: ConversationState = {
	activeRequestId: null,
	lastRequestId: null,
	isLoading: false,
	acpSessionId: null,
	streamingIdMap: {},
	lastChunkKinds: {},
};

export function conversationReducer(
	state: ConversationState,
	action: ConversationAction,
): ConversationState {
	switch (action.type) {
		case "STREAM_START":
			return {
				...state,
				activeRequestId: action.requestId,
				lastRequestId: action.requestId,
				isLoading: true,
			};
		case "STREAM_DONE":
			if (state.activeRequestId !== action.requestId && !state.streamingIdMap[action.requestId]) {
				// If it's an ACP session, we might need to find by sessionId but here we use requestId
			}
			return {
				...state,
				activeRequestId: state.activeRequestId === action.requestId ? null : state.activeRequestId,
				isLoading: state.activeRequestId === action.requestId ? false : state.isLoading,
			};
		case "STREAM_ERROR":
			return {
				...state,
				activeRequestId: state.activeRequestId === action.requestId ? null : state.activeRequestId,
				isLoading: state.activeRequestId === action.requestId ? false : state.isLoading,
			};
		case "SET_ACP_SESSION":
			return {
				...state,
				acpSessionId: action.sessionId,
				streamingIdMap: {
					...state.streamingIdMap,
					[action.sessionId]: action.requestId,
				},
			};
		case "RECORD_CHUNK_KIND":
			return {
				...state,
				lastChunkKinds: {
					...state.lastChunkKinds,
					[action.streamingId]: action.kind,
				},
			};
		case "RESET":
			return initialState;
		default:
			return state;
	}
}
