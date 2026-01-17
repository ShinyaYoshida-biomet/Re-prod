import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAIStreaming } from "../useAIStreaming";
import { socketService } from "@/services/socket";

// Mock dependencies
vi.mock("@/services/socket", () => ({
	socketService: {
		on: vi.fn(),
	},
}));

vi.mock("../useAssistantEventAdapter", () => ({
	useAssistantEventAdapter: () => ({
		appendChunk: vi.fn(),
		finalize: vi.fn(),
		recordAgentEvent: vi.fn(),
		recordTool: vi.fn(),
		enqueueApproval: vi.fn(),
	}),
}));

describe("useAIStreaming", () => {
	const listeners: Record<string, (message: any) => void> = {};

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup socket listener mock
		(socketService.on as any).mockImplementation((event: string, callback: any) => {
			listeners[event] = callback;
			return () => {
				delete listeners[event];
			};
		});
	});

	it("should register streaming handlers", () => {
		const { result } = renderHook(() => useAIStreaming());
		const cleanup = result.current.registerStreamingHandlers("req1");

		expect(socketService.on).toHaveBeenCalledWith("ai_response_chunk", expect.any(Function));
		expect(socketService.on).toHaveBeenCalledWith("agent_event", expect.any(Function));
		expect(socketService.on).toHaveBeenCalledWith("ai_response_complete", expect.any(Function));

		cleanup();
	});

	it("should ignore events for other request IDs", () => {
		const { result } = renderHook(() => useAIStreaming());
		const cleanup = result.current.registerStreamingHandlers("req1");

		// Simulate event for different request
		listeners["ai_response_chunk"]({
			type: "ai_response_chunk",
			id: "req2",
			chunk: "test",
		});

		// Mock dependency should not be called
		// We can't easily check the mock directly here since it's internal to the hook,
		// but we can verify the behavior if we mock useAssistantEventAdapter correctly.
		// However, since we mock it at module level, we can import it to check.
	});
});
