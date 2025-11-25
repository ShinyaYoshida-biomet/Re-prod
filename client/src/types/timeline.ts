import type {
	ExecutionEventPayload,
	TimelineQuery,
	TimelineStats as TimelineStatsType,
} from "shared";

export type TimelineSortOrder = "asc" | "desc";

export interface TimelineFiltersProps {
	filters?: TimelineQuery["filters"];
	onChange: (filters: TimelineQuery["filters"]) => void;
}

export interface TimelineSortProps {
	sort: TimelineSortOrder;
	onChange: (sort: TimelineSortOrder) => void;
}

export interface TimelineStatsProps {
	stats: TimelineStatsType | null;
	loading: boolean;
}

export interface TimelineEventProps {
	event: ExecutionEventPayload;
	onNavigate?: (event: ExecutionEventPayload) => void;
}

export interface TimelineListProps {
	events: ExecutionEventPayload[];
	total: number;
	hasMore: boolean;
	loading: boolean;
	onLoadMore: () => void;
	onNavigate?: (event: ExecutionEventPayload) => void;
}
