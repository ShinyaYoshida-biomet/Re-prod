import type { ExecutionEventPayload, TimelineQuery, TimelineResponse, TimelineStats } from "shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { socketService } from "../socket";
import { getTimelineStats, queryTimeline, subscribeToTimelineEvents } from "../timelineService";

// Mock the socket service
vi.mock("../socket", () => ({
	socketService: {
		send: vi.fn(),
		on: vi.fn(),
	},
}));

describe("timelineService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("queryTimeline", () => {
		it("should successfully query timeline with filters", async () => {
			const mockQuery: TimelineQuery = {
				filters: {
					actor: "user",
					hasPlots: true,
				},
				sort: "desc",
				limit: 10,
				offset: 0,
			};

			const mockResponse: TimelineResponse = {
				events: [],
				total: 0,
				hasMore: false,
				query: mockQuery,
			};

			// Mock successful send
			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				// Simulate server response
				setTimeout(() => {
					callback({
						type: "timeline_response",
						data: mockResponse,
					});
				}, 0);
				return true;
			});

			const result = await queryTimeline(mockQuery);

			expect(result).toEqual(mockResponse);
			expect(socketService.send).toHaveBeenCalledWith(
				{ type: "timeline_query", query: mockQuery },
				expect.any(Function),
				expect.any(Function),
			);
		});

		it("should handle empty query", async () => {
			const mockQuery: TimelineQuery = {};

			const mockResponse: TimelineResponse = {
				events: [],
				total: 0,
				hasMore: false,
				query: mockQuery,
			};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_response",
						data: mockResponse,
					});
				}, 0);
				return true;
			});

			const result = await queryTimeline(mockQuery);

			expect(result).toEqual(mockResponse);
		});

		it("should handle error response from server", async () => {
			const mockQuery: TimelineQuery = {};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "error",
						message: "Timeline query failed",
					});
				}, 0);
				return true;
			});

			await expect(queryTimeline(mockQuery)).rejects.toThrow("Timeline query failed");
		});

		it("should reject when WebSocket is not connected", async () => {
			const mockQuery: TimelineQuery = {};

			vi.mocked(socketService.send).mockReturnValue(false);

			await expect(queryTimeline(mockQuery)).rejects.toThrow(
				"Timeline request failed: WebSocket is not connected.",
			);
		});

		it("should handle unexpected response type", async () => {
			const mockQuery: TimelineQuery = {};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "unexpected_type",
					} as any);
				}, 0);
				return true;
			});

			await expect(queryTimeline(mockQuery)).rejects.toThrow("Unexpected timeline response");
		});

		it("should query with pagination", async () => {
			const mockQuery: TimelineQuery = {
				limit: 20,
				offset: 40,
			};

			const mockResponse: TimelineResponse = {
				events: [],
				total: 100,
				hasMore: true,
				query: mockQuery,
			};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_response",
						data: mockResponse,
					});
				}, 0);
				return true;
			});

			const result = await queryTimeline(mockQuery);

			expect(result.total).toBe(100);
			expect(result.hasMore).toBe(true);
		});

		it("should query with time range filter", async () => {
			const mockQuery: TimelineQuery = {
				filters: {
					startTime: 1700000000000,
					endTime: 1700003600000,
				},
			};

			const mockResponse: TimelineResponse = {
				events: [],
				total: 5,
				hasMore: false,
				query: mockQuery,
			};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_response",
						data: mockResponse,
					});
				}, 0);
				return true;
			});

			const result = await queryTimeline(mockQuery);

			expect(result.total).toBe(5);
		});

		it("should query with code search filter", async () => {
			const mockQuery: TimelineQuery = {
				filters: {
					codeContains: "ggplot",
				},
			};

			const mockResponse: TimelineResponse = {
				events: [],
				total: 3,
				hasMore: false,
				query: mockQuery,
			};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_response",
						data: mockResponse,
					});
				}, 0);
				return true;
			});

			const result = await queryTimeline(mockQuery);

			expect(result.total).toBe(3);
		});
	});

	describe("getTimelineStats", () => {
		it("should successfully fetch timeline statistics", async () => {
			const mockStats: TimelineStats = {
				totalEvents: 150,
				totalPlots: 25,
				totalErrors: 5,
				userActions: 100,
				aiActions: 50,
				sessionStartTime: 1700000000000,
				sessionEndTime: 1700003600000,
				sessionDuration: 3600000,
			};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_stats_response",
						stats: mockStats,
					});
				}, 0);
				return true;
			});

			const result = await getTimelineStats();

			expect(result).toEqual(mockStats);
			expect(socketService.send).toHaveBeenCalledWith(
				{ type: "timeline_stats_query" },
				expect.any(Function),
				expect.any(Function),
			);
		});

		it("should handle error response when fetching stats", async () => {
			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "error",
						message: "Failed to calculate stats",
					});
				}, 0);
				return true;
			});

			await expect(getTimelineStats()).rejects.toThrow("Failed to calculate stats");
		});

		it("should reject when WebSocket is not connected", async () => {
			vi.mocked(socketService.send).mockReturnValue(false);

			await expect(getTimelineStats()).rejects.toThrow(
				"Timeline stats request failed: WebSocket is not connected.",
			);
		});

		it("should handle unexpected response type", async () => {
			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "unexpected_type",
					} as any);
				}, 0);
				return true;
			});

			await expect(getTimelineStats()).rejects.toThrow("Unexpected timeline stats response");
		});

		it("should handle stats with zero values", async () => {
			const mockStats: TimelineStats = {
				totalEvents: 0,
				totalPlots: 0,
				totalErrors: 0,
				userActions: 0,
				aiActions: 0,
				sessionStartTime: 1700000000000,
				sessionEndTime: 1700000000000,
				sessionDuration: 0,
			};

			vi.mocked(socketService.send).mockImplementation((message, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_stats_response",
						stats: mockStats,
					});
				}, 0);
				return true;
			});

			const result = await getTimelineStats();

			expect(result.totalEvents).toBe(0);
			expect(result.sessionDuration).toBe(0);
		});
	});

	describe("subscribeToTimelineEvents", () => {
		it("should subscribe to timeline events and call handler", () => {
			const mockHandler = vi.fn();
			const mockUnsubscribe = vi.fn();

			const mockEvent: ExecutionEventPayload = {
				event_id: "evt-123",
				context: {
					source: "cell",
					document_path: "analysis.R",
					cell_index: 1,
					triggered_at_ms: 1700000000000,
					actor: "user",
				},
				blocks: [
					{
						id: "block-1",
						index: 0,
						kind: "section",
						label: "Setup",
						start_line: 1,
						end_line: 3,
						code: "x <- 1:10",
					},
				],
				result: {
					success: true,
					output: "[1] 1 2 3",
					error: null,
					plots: [],
					execution_time_ms: 42,
				},
				environment: {
					r_path: "Rscript",
					working_dir: "/tmp",
					temp_dir: "/tmp/reprod",
				},
				created_at_ms: 1700000000500,
			};

			vi.mocked(socketService.on).mockImplementation((event, callback) => {
				// Simulate incoming event
				setTimeout(() => {
					callback({
						type: "timeline_event_added",
						event: mockEvent,
					});
				}, 0);
				return mockUnsubscribe;
			});

			const unsubscribe = subscribeToTimelineEvents(mockHandler);

			// Wait for event to be processed
			setTimeout(() => {
				expect(mockHandler).toHaveBeenCalledWith(mockEvent);
				expect(socketService.on).toHaveBeenCalledWith("timeline_event_added", expect.any(Function));
			}, 10);

			expect(typeof unsubscribe).toBe("function");
		});

		it("should not call handler for non-timeline events", () => {
			const mockHandler = vi.fn();

			vi.mocked(socketService.on).mockImplementation((event, callback) => {
				// Simulate non-timeline event
				setTimeout(() => {
					callback({
						type: "other_event",
					} as any);
				}, 0);
				return vi.fn();
			});

			subscribeToTimelineEvents(mockHandler);

			setTimeout(() => {
				expect(mockHandler).not.toHaveBeenCalled();
			}, 10);
		});

		it("should handle multiple events", () => {
			const mockHandler = vi.fn();

			const event1: ExecutionEventPayload = {
				event_id: "evt-1",
				context: {
					source: "cell",
					document_path: null,
					cell_index: null,
					triggered_at_ms: 1700000000000,
					actor: "user",
				},
				blocks: [],
				result: {
					success: true,
					output: "output1",
					error: null,
					plots: [],
					execution_time_ms: 10,
				},
				environment: {
					r_path: "Rscript",
					working_dir: "/tmp",
					temp_dir: "/tmp/reprod",
				},
				created_at_ms: 1700000000000,
			};

			const event2: ExecutionEventPayload = {
				...event1,
				event_id: "evt-2",
				created_at_ms: 1700000001000,
			};

			vi.mocked(socketService.on).mockImplementation((event, callback) => {
				setTimeout(() => {
					callback({
						type: "timeline_event_added",
						event: event1,
					});
					callback({
						type: "timeline_event_added",
						event: event2,
					});
				}, 0);
				return vi.fn();
			});

			subscribeToTimelineEvents(mockHandler);

			setTimeout(() => {
				expect(mockHandler).toHaveBeenCalledTimes(2);
				expect(mockHandler).toHaveBeenNthCalledWith(1, event1);
				expect(mockHandler).toHaveBeenNthCalledWith(2, event2);
			}, 10);
		});

		it("should return unsubscribe function", () => {
			const mockHandler = vi.fn();
			const mockUnsubscribe = vi.fn();

			vi.mocked(socketService.on).mockReturnValue(mockUnsubscribe);

			const unsubscribe = subscribeToTimelineEvents(mockHandler);

			expect(unsubscribe).toBe(mockUnsubscribe);
		});
	});
});
