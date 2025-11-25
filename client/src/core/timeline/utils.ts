import type { ExecutionEventPayload, TimelineQuery, TimelineStats } from "shared";

export function matchesTimelineFilters(
	event: ExecutionEventPayload,
	filters: TimelineQuery["filters"] | undefined,
): boolean {
	if (!filters) return true;

	if (filters.actor && event.context.actor !== filters.actor) {
		return false;
	}

	if (filters.source && event.context.source !== filters.source) {
		return false;
	}

	if (filters.startTime && event.created_at_ms < filters.startTime) {
		return false;
	}

	if (filters.endTime && event.created_at_ms > filters.endTime) {
		return false;
	}

	if (filters.hasPlots && event.result.plots.length === 0) {
		return false;
	}

	if (filters.hasErrors && !event.result.error) {
		return false;
	}

	if (filters.codeContains) {
		const search = filters.codeContains.toLowerCase();
		const hasMatch = event.blocks.some((block) => block.code.toLowerCase().includes(search));
		if (!hasMatch) {
			return false;
		}
	}

	return true;
}

export function deriveTimelineStatsFromEvent(event: ExecutionEventPayload): TimelineStats {
	const now = event.created_at_ms;

	return {
		totalEvents: 1,
		totalPlots: event.result.plots.length,
		totalErrors: event.result.error ? 1 : 0,
		userActions: event.context.actor === "user" ? 1 : 0,
		aiActions: event.context.actor === "ai" ? 1 : 0,
		sessionStartTime: now,
		sessionEndTime: now,
		sessionDuration: 0,
	};
}

export function appendEventToStats(
	event: ExecutionEventPayload,
	current: TimelineStats | null,
): TimelineStats {
	if (!current) {
		return deriveTimelineStatsFromEvent(event);
	}

	const nextStart = Math.min(current.sessionStartTime, event.created_at_ms);
	const nextEnd = Math.max(current.sessionEndTime, event.created_at_ms);

	return {
		...current,
		totalEvents: current.totalEvents + 1,
		totalPlots: current.totalPlots + event.result.plots.length,
		totalErrors: current.totalErrors + (event.result.error ? 1 : 0),
		userActions: current.userActions + (event.context.actor === "user" ? 1 : 0),
		aiActions: current.aiActions + (event.context.actor === "ai" ? 1 : 0),
		sessionStartTime: nextStart,
		sessionEndTime: nextEnd,
		sessionDuration: nextEnd - nextStart,
	};
}
