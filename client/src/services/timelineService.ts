import type {
	ExecutionEventPayload,
	ServerMessage,
	TimelineQuery,
	TimelineResponse,
	TimelineStats,
} from "shared";
import { timelineMessages } from "@/services/messageBuilders";
import { socketService } from "./socket";

const timelineMatcher = (message: ServerMessage): boolean =>
	message.type === "timeline_response" || message.type === "error";

export async function queryTimeline(query: TimelineQuery): Promise<TimelineResponse> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			timelineMessages.query(query),
			(message) => {
				if (message.type === "timeline_response") {
					resolve(message.data);
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected timeline response: ${message.type}`));
			},
			timelineMatcher,
		);

		if (!didSend) {
			reject(new Error("Timeline request failed: WebSocket is not connected."));
		}
	});
}

export async function getTimelineStats(): Promise<TimelineStats> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			timelineMessages.statsQuery(),
			(message) => {
				if (message.type === "timeline_stats_response") {
					resolve(message.stats);
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected timeline stats response: ${message.type}`));
			},
			(message) => message.type === "timeline_stats_response" || message.type === "error",
		);

		if (!didSend) {
			reject(new Error("Timeline stats request failed: WebSocket is not connected."));
		}
	});
}

export function subscribeToTimelineEvents(
	handler: (event: ExecutionEventPayload) => void,
): () => void {
	return socketService.on("timeline_event_added", (message) => {
		if (message.type === "timeline_event_added") {
			handler(message.event);
		}
	});
}
