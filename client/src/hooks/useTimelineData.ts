import { useEffect, useState } from "react";
import { useStore } from "@/core";
import { appendEventToStats, matchesTimelineFilters } from "@/core/timeline/utils";
import {
	getTimelineStats,
	queryTimeline,
	subscribeToTimelineEvents,
} from "@/services/timelineService";
import type { ExecutionEventPayload, TimelineStats } from "@/types";
import { getErrorMessage } from "@/utils/error";

interface UseTimelineDataState {
	events: ExecutionEventPayload[];
	total: number;
	hasMore: boolean;
	loading: boolean;
	error: string | null;
	filters: any;
	sort: any;
	stats: TimelineStats | null;
	statsLoading: boolean;
}

interface UseTimelineDataActions {
	loadMore: () => void;
	setFilters: (filters: any) => void;
	setSort: (sort: any) => void;
}

interface UseTimelineDataReturn {
	state: UseTimelineDataState;
	actions: UseTimelineDataActions;
}

export function useTimelineData(): UseTimelineDataReturn {
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
		appendEvents,
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
		appendEvents: state.appendEvents,
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
				setError(getErrorMessage(err, "Failed to load timeline"));
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

				appendEvents(response.events, response.total, response.hasMore);
			} catch (err) {
				setError(getErrorMessage(err, "Failed to load more events"));
			}
		};

		void fetchMoreEvents();
	}, [offset, isConnected, filters, sort, limit, appendEvents, setLoading, setError]);

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
		state: {
			events,
			total,
			hasMore,
			loading,
			error,
			filters,
			sort,
			stats,
			statsLoading,
		},
		actions: {
			loadMore,
			setFilters,
			setSort,
		},
	};
}
