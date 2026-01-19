import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useEnvironmentPanelState } from "../useEnvironmentPanelState";
import { socketService } from "@/services/socket";
import type { EnvironmentVariable } from "@/types/generated";

vi.mock("@/services/socket", () => ({
	socketService: {
		isConnected: vi.fn(),
		send: vi.fn(),
		on: vi.fn(),
	},
}));

describe("useEnvironmentPanelState", () => {
	let mockHandlers: Map<string, (message: any) => void>;

	beforeEach(() => {
		mockHandlers = new Map();
		vi.mocked(socketService.isConnected).mockReturnValue(true);
		vi.mocked(socketService.send).mockReturnValue(true);
		vi.mocked(socketService.on).mockImplementation((event, handler) => {
			mockHandlers.set(event, handler);
			return () => mockHandlers.delete(event);
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		mockHandlers.clear();
	});

	it("should initialize with empty variables and loading state", () => {
		const { result } = renderHook(() => useEnvironmentPanelState());

		expect(result.current.variables).toEqual([]);
		expect(result.current.isLoading).toBe(true);
	});

	it("should send environment_query on mount", () => {
		renderHook(() => useEnvironmentPanelState());

		expect(socketService.send).toHaveBeenCalledWith({ type: "environment_query" });
	});

	it("should update variables when environment_data is received", async () => {
		const { result } = renderHook(() => useEnvironmentPanelState());

		const mockVariables: EnvironmentVariable[] = [
			{ name: "x", type: "numeric", size: "length 10", value: "1, 2, 3, 4, 5, ..." },
			{ name: "df", type: "data.frame", size: "3 obs. of 2 variables", value: "<data.frame>" },
		];

		const environmentDataHandler = mockHandlers.get("environment_data");
		expect(environmentDataHandler).toBeDefined();

		environmentDataHandler!({ type: "environment_data", variables: mockVariables });

		await waitFor(() => {
			expect(result.current.variables).toEqual(mockVariables);
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("should refresh environment when timeline event is added", async () => {
		const { result } = renderHook(() => useEnvironmentPanelState());

		vi.clearAllMocks();

		const timelineHandler = mockHandlers.get("timeline_event_added");
		expect(timelineHandler).toBeDefined();

		timelineHandler!({ type: "timeline_event_added" });

		await waitFor(() => {
			expect(socketService.send).toHaveBeenCalledWith({ type: "environment_query" });
		});
	});

	it("should handle empty variables array", async () => {
		const { result } = renderHook(() => useEnvironmentPanelState());

		const environmentDataHandler = mockHandlers.get("environment_data");
		environmentDataHandler!({ type: "environment_data", variables: [] });

		await waitFor(() => {
			expect(result.current.variables).toEqual([]);
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("should not send query when socket is not connected", () => {
		vi.mocked(socketService.isConnected).mockReturnValue(false);
		vi.clearAllMocks();

		renderHook(() => useEnvironmentPanelState());

		expect(socketService.send).not.toHaveBeenCalled();
	});

	it("should call refresh manually", async () => {
		const { result } = renderHook(() => useEnvironmentPanelState());

		vi.clearAllMocks();

		result.current.refresh();

		expect(socketService.send).toHaveBeenCalledWith({ type: "environment_query" });
	});
});
