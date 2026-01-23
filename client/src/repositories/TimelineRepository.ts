import { timelineMessages } from "@/services/messageBuilders";
import type { TimelineQuery, TimelineResponse, TimelineStats } from "@/types";
import type { DataTransport } from "./core/DataTransport";

export class TimelineRepository {
	constructor(private readonly transport: DataTransport) {}

	async query(query: TimelineQuery): Promise<TimelineResponse> {
		const response = await this.transport.request(
			timelineMessages.query(query),
			"timeline_response",
		);
		const data = response.data;
		const filters = data.query.filters
			? {
					actor:
						data.query.filters.actor === "user" || data.query.filters.actor === "ai"
							? (data.query.filters.actor as "user" | "ai")
							: undefined,
					source:
						data.query.filters.source === "selection" ||
						data.query.filters.source === "cell" ||
						data.query.filters.source === "whole_document"
							? (data.query.filters.source as "selection" | "cell" | "whole_document")
							: undefined,
					startTime: data.query.filters.startTime ?? undefined,
					endTime: data.query.filters.endTime ?? undefined,
					hasPlots: data.query.filters.hasPlots ?? undefined,
					hasErrors: data.query.filters.hasErrors ?? undefined,
					codeContains: data.query.filters.codeContains ?? undefined,
				}
			: undefined;

		return {
			events: data.events,
			total: data.total,
			hasMore: data.hasMore,
			query: {
				filters,
				sort: (data.query.sort === "asc" || data.query.sort === "desc"
					? data.query.sort
					: undefined) as TimelineQuery["sort"] | undefined,
				limit: data.query.limit ?? undefined,
				offset: data.query.offset ?? undefined,
			},
		};
	}

	async stats(): Promise<TimelineStats> {
		const response = await this.transport.request(
			timelineMessages.statsQuery(),
			"timeline_stats_response",
		);
		return response.stats;
	}
}
