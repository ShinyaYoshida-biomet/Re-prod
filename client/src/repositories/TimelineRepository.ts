import type { TimelineQuery, TimelineResponse, TimelineStats } from "@/types";
import type { DataTransport } from "./core/DataTransport";
import { timelineMessages } from "@/services/messageBuilders";

export class TimelineRepository {
	constructor(private readonly transport: DataTransport) {}

	async query(query: TimelineQuery): Promise<TimelineResponse> {
		const response = await this.transport.request(
			timelineMessages.query(query),
			"timeline_response",
		);
		return response.data;
	}

	async stats(): Promise<TimelineStats> {
		const response = await this.transport.request(
			timelineMessages.statsQuery(),
			"timeline_stats_response",
		);
		return response.stats;
	}
}
