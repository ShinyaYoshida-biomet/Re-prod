import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAssistantEventAdapter } from "../useAssistantEventAdapter";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";

// Mock dependencies
vi.mock("@/core", () => ({
	useStore: vi.fn(),
}));

vi.mock("@/core/fileSystemStore", () => ({
	useFileSystemStore: vi.fn(),
}));

describe("useAssistantEventAdapter", () => {
	const mockAppendStreamingChunk = vi.fn();
	const mockUpdateStreamingPlan = vi.fn();
	const mockAppendAgentEvent = vi.fn();
	const mockAddApprovalRequest = vi.fn();
	const mockRecordToolEvent = vi.fn();
	const mockCompleteStreamingMessage = vi.fn();
	const mockSetAILoading = vi.fn();
	const mockRegisterPendingEdit = vi.fn();
	const mockUpdateBuffer = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		(useStore as any).mockImplementation((selector: any) => {
			const state = {
				appendStreamingChunk: mockAppendStreamingChunk,
				updateStreamingPlan: mockUpdateStreamingPlan,
				appendAgentEvent: mockAppendAgentEvent,
				addApprovalRequest: mockAddApprovalRequest,
				recordToolEvent: mockRecordToolEvent,
				completeStreamingMessage: mockCompleteStreamingMessage,
				setAILoading: mockSetAILoading,
				registerPendingEdit: mockRegisterPendingEdit,
				getActiveBuffer: () => null,
				updateBuffer: mockUpdateBuffer,
			};
			return selector(state);
		});

		(useFileSystemStore as any).mockImplementation((selector: any) => {
			const state = { workspaceRoot: "" };
			return selector(state);
		});
	});

	it("should append chunk", () => {
		const { result } = renderHook(() => useAssistantEventAdapter());
		result.current.appendChunk("id1", "chunk");
		expect(mockAppendStreamingChunk).toHaveBeenCalledWith("id1", "chunk");
	});

	it("should update plan", () => {
		const { result } = renderHook(() => useAssistantEventAdapter());
		const steps = [{ id: "1", title: "step", status: "pending" }];
		result.current.updatePlan("id1", steps);
		expect(mockUpdateStreamingPlan).toHaveBeenCalledWith("id1", steps);
	});

	it("should record tool", () => {
		const { result } = renderHook(() => useAssistantEventAdapter());
		const tool = { id: "1", name: "tool", status: "running" };
		result.current.recordTool("id1", tool as any);
		expect(mockRecordToolEvent).toHaveBeenCalledWith("id1", tool);
	});

	it("should finalize", () => {
		const { result } = renderHook(() => useAssistantEventAdapter());
		result.current.finalize("id1", "content");
		expect(mockCompleteStreamingMessage).toHaveBeenCalled();
		expect(mockSetAILoading).toHaveBeenCalledWith(false);
	});

	it("should map plan steps", () => {
		const { result } = renderHook(() => useAssistantEventAdapter());
		const acpSteps = [
			{
				id: "1",
				title: "step",
				status: "pending",
				kind: "plan",
				error: null,
				started_at: null,
				finished_at: null,
				waiting_reason: null,
			},
		];

		const steps = result.current.mapPlanSteps(acpSteps as any);
		expect(steps).toHaveLength(1);
		expect(steps[0].id).toBe("1");
		expect(steps[0].title).toBe("step");
	});

	it("should map tool call", () => {
		const { result } = renderHook(() => useAssistantEventAdapter());
		const acpTool = {
			id: "1",
			title: "tool",
			status: "pending",
			kind: "code",
			locations: [],
			input: { a: 1 },
			output: null,
			error: null,
		};

		const tool = result.current.mapToolCall(acpTool as any);
		expect(tool.id).toBe("1");
		expect(tool.name).toBe("tool");
		expect(tool.status).toBe("running"); // mapAcpStatus pending -> running
	});
});
