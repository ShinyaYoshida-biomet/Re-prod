import { useEffect, useState } from "react";
import type { ExecutionEventPayload, TimelineStats } from "shared";
import { useStore } from "@/core";
import { appendEventToStats, matchesTimelineFilters } from "@/core/timeline/utils";
import {
	getTimelineStats,
	queryTimeline,
	subscribeToTimelineEvents,
} from "@/services/timelineService";

export function useTimelineData() {
	const {
		events,
		total,
		hasMore,
		loading,
		error,
		filters,
		sort,
		limit,
		offset,
		setEvents,
		addEvent,
		setFilters,
		setSort,
		setLoading,
		setError,
		loadMore,
	} = useStore((state) => ({
		events: state.events,
		total: state.total,
		hasMore: state.hasMore,
		loading: state.loading,
		error: state.error,
		filters: state.filters,
		sort: state.sort,
		limit: state.limit,
		offset: state.offset,
		setEvents: state.setEvents,
		addEvent: state.addEvent,
		setFilters: state.setFilters,
		setSort: state.setSort,
		setLoading: state.setLoading,
		setError: state.setError,
		loadMore: state.loadMore,
	}));

	const isConnected = useStore((state) => state.isConnected);
	const [stats, setStats] = useState<TimelineStats | null>(null);
	const [statsLoading, setStatsLoading] = useState(false);

	useEffect(() => {
		if (!isConnected) {
			setLoading(false);
			return;
		}

		const fetchEvents = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await queryTimeline({
					filters,
					sort,
					limit,
					offset: 0,
				});

				setEvents(response.events, response.total, response.hasMore);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load timeline");
			}
		};

		void fetchEvents();
	}, [filters, sort, limit, isConnected, setLoading, setError, setEvents]);

	useEffect(() => {
		if (!isConnected || offset === 0) {
			return;
		}

		const fetchMoreEvents = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await queryTimeline({
					filters,
					sort,
					limit,
					offset,
				});

				setEvents([...events, ...response.events], response.total, response.hasMore);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load more events");
			}
		};

		void fetchMoreEvents();
		// We intentionally omit `events` from deps to avoid infinite fetch loops when new data is set.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [offset, isConnected, filters, sort, limit, setEvents, setLoading, setError]);

	useEffect(() => {
		if (!isConnected) {
			setStats(null);
			return;
		}

		const fetchStats = async () => {
			setStatsLoading(true);
			try {
				const statsData = await getTimelineStats();
				setStats(statsData);
			} catch (err) {
			} finally {
				setStatsLoading(false);
			}
		};

		void fetchStats();
	}, [isConnected]);

	useEffect(() => {
		if (!isConnected) {
			return undefined;
		}

		const unsubscribe = subscribeToTimelineEvents((event: ExecutionEventPayload) => {
			if (!matchesTimelineFilters(event, filters)) {
				return;
			}

			addEvent(event);
			setStats((prev) => appendEventToStats(event, prev));
		});

		return unsubscribe;
	}, [isConnected, filters, addEvent]);

	return {
		events,
		total,
		hasMore,
		loading,
		error,
		filters,
		sort,
		loadMore,
		setFilters,
		setSort,
		stats,
		statsLoading,
	};
}
