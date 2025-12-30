/**
 * Timeline API types for querying and displaying execution history.
 * These types enable parallel development of backend (Issue 007) and frontend (Issue 008).
 */

// Import protocol types for use in timeline interfaces
import type { ExecutionEvent as ExecutionEventPayload } from "./protocol";

/**
 * Query parameters for fetching timeline events.
 * Used by UI to request filtered/sorted/paginated events from backend.
 */
export interface TimelineQuery {
	filters?: {
		/** Filter by actor (user or AI) */
		actor?: "user" | "ai";

		/** Filter by execution source */
		source?: "selection" | "cell" | "whole_document";

		/** Filter by time range (epoch milliseconds) */
		startTime?: number;
		endTime?: number;

		/** Only events with plots */
		hasPlots?: boolean;

		/** Only events with errors */
		hasErrors?: boolean;

		/** Text search in code blocks */
		codeContains?: string;
	};

	/** Sort order (default: desc, newest first) */
	sort?: "asc" | "desc";

	/** Pagination limit (default: 50, max: 200) */
	limit?: number;

	/** Pagination offset (default: 0) */
	offset?: number;
}

/**
 * Response containing timeline events with pagination metadata.
 */
export interface TimelineResponse {
	/** Array of execution events matching the query */
	events: ExecutionEventPayload[];

	/** Total number of events matching filters (ignoring pagination) */
	total: number;

	/** Whether more events exist beyond current page */
	hasMore: boolean;

	/** Query that produced this response (for debugging) */
	query: TimelineQuery;
}

/**
 * Statistics about the timeline for UI summary display.
 */
export interface TimelineStats {
	totalEvents: number;
	totalPlots: number;
	totalErrors: number;
	userActions: number;
	aiActions: number;
	sessionStartTime: number; // epoch ms
	sessionEndTime: number; // epoch ms
	sessionDuration: number; // milliseconds
}

/**
 * Client → Server: Request timeline events
 */
export interface TimelineQueryMessage {
	type: "timeline_query";
	query: TimelineQuery;
}

/**
 * Server → Client: Timeline query response
 */
export interface TimelineResponseMessage {
	type: "timeline_response";
	data: TimelineResponse;
}

/**
 * Server → Client: New event added to timeline (real-time push)
 */
export interface TimelineEventAddedMessage {
	type: "timeline_event_added";
	event: ExecutionEventPayload;
}

/**
 * Client → Server: Request timeline statistics
 */
export interface TimelineStatsQueryMessage {
	type: "timeline_stats_query";
}

/**
 * Server → Client: Timeline statistics response
 */
export interface TimelineStatsResponseMessage {
	type: "timeline_stats_response";
	stats: TimelineStats;
}

/**
 * Union type of all timeline-related WebSocket messages
 */
export type TimelineMessage =
	| TimelineQueryMessage
	| TimelineResponseMessage
	| TimelineEventAddedMessage
	| TimelineStatsQueryMessage
	| TimelineStatsResponseMessage;

/**
 * UI Component Props for Timeline components
 */
export interface TimelineListProps {
	events: ExecutionEventPayload[];
	total: number;
	hasMore: boolean;
	loading: boolean;
	onLoadMore: () => void;
	onNavigate: (event: ExecutionEventPayload) => void;
}

export interface TimelineEventProps {
	event: ExecutionEventPayload;
	onNavigate: (event: ExecutionEventPayload) => void;
}

export interface TimelineFiltersProps {
	filters: TimelineQuery["filters"];
	onChange: (filters: TimelineQuery["filters"]) => void;
}

export interface TimelineSortProps {
	sort: TimelineQuery["sort"];
	onChange: (sort: "asc" | "desc") => void;
}

export interface TimelineStatsProps {
	stats: TimelineStats | null;
	loading: boolean;
}
