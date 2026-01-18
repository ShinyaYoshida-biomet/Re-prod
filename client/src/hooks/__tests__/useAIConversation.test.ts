import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAIConversation } from "../useAIConversation";
import { useStore } from "@/core";
import { socketService } from "@/services/socket";
import { getExternalAgentClient } from "@/services/externalAgentClient";

// Mock dependencies
vi.mock("@/core", () => ({
	useStore: vi.fn(),
}));

vi.mock("@/core/fileSystemStore", () => ({
	useFileSystemStore: vi.fn(),
}));

vi.mock("@/services/socket", () => ({
	socketService: {
		send: vi.fn().mockReturnValue(true),
	},
}));

vi.mock("@/services/externalAgentClient", () => ({
	getExternalAgentClient: vi.fn(),
}));

vi.mock("../useAIStreaming", () => ({
	useAIStreaming: () => ({
		registerStreamingHandlers: vi.fn().mockReturnValue(vi.fn()),
	}),
}));

vi.mock("../useAITimeout", () => ({
	useAITimeout: () => ({
		clearTimeoutRef: vi.fn(),
		startTimeout: vi.fn(),
	}),
}));

vi.mock("../useAssistantEventAdapter", () => ({
	useAssistantEventAdapter: () => ({
		appendChunk: vi.fn(),
		finalize: vi.fn(),
		mapPlanSteps: vi.fn(),
		mapToolCall: vi.fn(),
		mapToolCallUpdate: vi.fn(),
		recordTool: vi.fn(),
		updatePlan: vi.fn(),
	}),
}));

vi.mock("../useAICodeApplication", () => ({
	useAICodeApplication: () => ({
		handleApplyCode: vi.fn(),
	}),
}));

vi.mock("../usePromptHistory", () => ({
	usePromptHistory: vi.fn(),
}));

describe("useAIConversation", () => {
	const mockAddAIMessage = vi.fn();
	const mockStartStreamingMessage = vi.fn();
	const mockSetAILoading = vi.fn();
	const mockCompleteStreamingMessage = vi.fn();
	const mockUpdateBuffer = vi.fn();
	const mockRegisterPendingEdit = vi.fn();
	const mockSetAgentSessionId = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Default store mock
		(useStore as any).mockImplementation((selector: any) => {
			const state = {
				ai: {
					messages: [],
					isLoading: false,
					agentSessionId: null,
				},
				activeMode: "agent",
				activeAgent: null,
				addAIMessage: mockAddAIMessage,
				startStreamingMessage: mockStartStreamingMessage,
				setAILoading: mockSetAILoading,
				completeStreamingMessage: mockCompleteStreamingMessage,
				setAgentSessionId: mockSetAgentSessionId,
				getActiveBuffer: () => ({ id: "buf1", content: "x <- 1", filepath: "test.R" }),
				updateBuffer: mockUpdateBuffer,
				execution: { results: [] },
				registerPendingEdit: mockRegisterPendingEdit,
			};
			return selector(state);
		});

		// Default getExternalAgentClient mock
		(getExternalAgentClient as any).mockReturnValue({
			createSession: vi.fn().mockResolvedValue("session1"),
			prompt: vi.fn().mockResolvedValue(undefined),
			onSessionUpdate: vi.fn().mockReturnValue(vi.fn()),
			cancel: vi.fn().mockResolvedValue(undefined),
		});
	});

	it("should initialize with default state", () => {
		const { result } = renderHook(() => useAIConversation());

		expect(result.current.aiState.input).toBe("");
		expect(result.current.aiState.messages).toEqual([]);
		expect(result.current.aiState.isLoading).toBe(false);
	});

	it("should update input", () => {
		const { result } = renderHook(() => useAIConversation());

		act(() => {
			result.current.aiActions.setInput("hello");
		});

		expect(result.current.aiState.input).toBe("hello");
	});

	it("should send message when calling ask", async () => {
		const { result } = renderHook(() => useAIConversation());

		act(() => {
			result.current.aiActions.setInput("hello");
		});

		await act(async () => {
			await result.current.aiActions.ask();
		});

		expect(mockAddAIMessage).toHaveBeenCalled();
		expect(mockStartStreamingMessage).toHaveBeenCalled();
		expect(mockSetAILoading).toHaveBeenCalledWith(true);
		expect(socketService.send).toHaveBeenCalled();
		expect(result.current.aiState.input).toBe("");
	});

	it("should handle stop", () => {
		const { result } = renderHook(() => useAIConversation());

		act(() => {
			result.current.aiActions.stop();
		});

		expect(mockSetAILoading).toHaveBeenCalledWith(false);
	});
});
