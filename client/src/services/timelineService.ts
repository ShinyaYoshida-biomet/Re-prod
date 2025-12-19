import type {
	ExecutionEventPayload,
	TimelineQuery,
	TimelineResponse,
	TimelineStats,
} from "@/types";
import type { DataTransport } from "@/repositories/core/DataTransport";
import { TimelineRepository } from "@/repositories/TimelineRepository";
import { WebSocketTransport } from "@/repositories/core/WebSocketTransport";
import { socketService } from "./socket";

export function createTimelineService(transport: DataTransport): {
	queryTimeline: (query: TimelineQuery) => Promise<TimelineResponse>;
	getTimelineStats: () => Promise<TimelineStats>;
	subscribeToTimelineEvents: (handler: (event: ExecutionEventPayload) => void) => () => void;
} {
	const repository = new TimelineRepository(transport);

	return {
		queryTimeline: (query) => repository.query(query),
		getTimelineStats: () => repository.stats(),
		subscribeToTimelineEvents: (handler) =>
			transport.on("timeline_event_added", (message) => {
				if (message.type === "timeline_event_added") {
					handler(message.event);
				}
			}),
	};
}

const defaultService = createTimelineService(new WebSocketTransport(socketService));

export const queryTimeline = defaultService.queryTimeline;
export const getTimelineStats = defaultService.getTimelineStats;
export const subscribeToTimelineEvents = defaultService.subscribeToTimelineEvents;
