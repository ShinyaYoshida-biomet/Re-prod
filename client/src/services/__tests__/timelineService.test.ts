import { describe, expect, it, vi } from "vitest";
import type { DataTransport } from "@/repositories/core/DataTransport";
import type {
	ExecutionEventPayload,
	TimelineQuery,
	TimelineResponse,
	TimelineStats,
} from "@/types";
import { createTimelineService } from "../timelineService";

function createMockTransport(): DataTransport {
	return {
		send: vi.fn(),
		request: vi.fn(),
		on: vi.fn(),
	};
}

describe("timelineService", () => {
	it("returns timeline_response.data from transport", async () => {
		const transport = createMockTransport();
		const service = createTimelineService(transport);

		const query: TimelineQuery = { limit: 10, offset: 0 };
		const response: TimelineResponse = { events: [], total: 0, hasMore: false, query };

		vi.mocked(transport.request).mockResolvedValueOnce({
			type: "timeline_response",
			data: response,
		});

		await expect(service.queryTimeline(query)).resolves.toEqual(response);
		expect(transport.request).toHaveBeenCalledWith(
			{ type: "timeline_query", query },
			"timeline_response",
		);
	});

	it("propagates transport errors from queryTimeline", async () => {
		const transport = createMockTransport();
		const service = createTimelineService(transport);

		vi.mocked(transport.request).mockRejectedValueOnce(new Error("Timeline query failed"));

		await expect(service.queryTimeline({})).rejects.toThrow("Timeline query failed");
	});

	it("returns timeline_stats_response.stats from transport", async () => {
		const transport = createMockTransport();
		const service = createTimelineService(transport);

		const stats: TimelineStats = {
			totalEvents: 150,
			totalPlots: 25,
			totalErrors: 5,
			userActions: 100,
			aiActions: 50,
			sessionStartTime: 1700000000000,
			sessionEndTime: 1700003600000,
			sessionDuration: 3600000,
		};

		vi.mocked(transport.request).mockResolvedValueOnce({
			type: "timeline_stats_response",
			stats,
		});

		await expect(service.getTimelineStats()).resolves.toEqual(stats);
		expect(transport.request).toHaveBeenCalledWith(
			{ type: "timeline_stats_query" },
			"timeline_stats_response",
		);
	});

	it("subscribes to timeline_event_added and forwards event payload", () => {
		const transport = createMockTransport();
		const service = createTimelineService(transport);

		const off = vi.fn();
		let subscribedHandler: ((message: any) => void) | undefined;

		vi.mocked(transport.on).mockImplementation((type, handler) => {
			if (type === "timeline_event_added") {
				subscribedHandler = handler as (message: any) => void;
			}
			return off;
		});

		const handler = vi.fn();
		const unsubscribe = service.subscribeToTimelineEvents(handler);

		expect(transport.on).toHaveBeenCalledWith("timeline_event_added", expect.any(Function));
		expect(unsubscribe).toBe(off);

		const event = { id: "evt-1", type: "execution", at: 1 } as unknown as ExecutionEventPayload;
		subscribedHandler?.({ type: "timeline_event_added", event });

		expect(handler).toHaveBeenCalledWith(event);
	});
});
