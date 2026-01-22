import { describe, expect, it } from "vitest";
import { conversationReducer, initialState } from "../conversationReducer";

describe("conversationReducer", () => {
	it("should handle STREAM_START", () => {
		const state = conversationReducer(initialState, {
			type: "STREAM_START",
			requestId: "req-1",
		});
		expect(state.activeRequestId).toBe("req-1");
		expect(state.isLoading).toBe(true);
	});

	it("should handle STREAM_DONE", () => {
		const startedState = {
			...initialState,
			activeRequestId: "req-1",
			isLoading: true,
		};
		const state = conversationReducer(startedState, {
			type: "STREAM_DONE",
			requestId: "req-1",
		});
		expect(state.activeRequestId).toBe(null);
		expect(state.isLoading).toBe(false);
	});

	it("should handle SET_ACP_SESSION", () => {
		const state = conversationReducer(initialState, {
			type: "SET_ACP_SESSION",
			sessionId: "sess-1",
			requestId: "req-1",
		});
		expect(state.acpSessionId).toBe("sess-1");
		expect(state.streamingIdMap["sess-1"]).toBe("req-1");
	});

	it("should handle RECORD_CHUNK_KIND", () => {
		const state = conversationReducer(initialState, {
			type: "RECORD_CHUNK_KIND",
			streamingId: "req-1",
			kind: "thought",
		});
		expect(state.lastChunkKinds["req-1"]).toBe("thought");
	});
});
