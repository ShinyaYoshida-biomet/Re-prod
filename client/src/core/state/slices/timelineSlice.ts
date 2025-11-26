import type { ExecutionEventPayload, TimelineQuery } from "shared";
import type { StateCreator } from "zustand";

export interface TimelineState {
	// Events data
	events: ExecutionEventPayload[];
	total: number;
	hasMore: boolean;
	loading: boolean;
	error: string | null;

	// Query parameters
	filters: TimelineQuery["filters"];
	sort: "asc" | "desc";
	limit: number;
	offset: number;

	// Actions
	setEvents: (events: ExecutionEventPayload[], total: number, hasMore: boolean) => void;
	addEvent: (event: ExecutionEventPayload) => void;
	setFilters: (filters: TimelineQuery["filters"]) => void;
	setSort: (sort: "asc" | "desc") => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	loadMore: () => void;
	reset: () => void;
}

const initialState = {
	events: [],
	total: 0,
	hasMore: false,
	loading: false,
	error: null,
	filters: {},
	sort: "desc" as const,
	limit: 50,
	offset: 0,
};

export const createTimelineSlice: StateCreator<TimelineState> = (set) => ({
	...initialState,

	setEvents: (events, total, hasMore) =>
		set(() => ({
			events,
			total,
			hasMore,
			offset: events.length,
			loading: false,
			error: null,
		})),

	addEvent: (event) =>
		set((state) => {
			const exists = state.events.some((existing) => existing.event_id === event.event_id);
			if (exists) {
				return {};
			}

			let nextEvents: ExecutionEventPayload[];
			if (state.sort === "asc") {
				nextEvents = [...state.events, event];
				if (nextEvents.length > state.limit) {
					nextEvents = nextEvents.slice(nextEvents.length - state.limit);
				}
			} else {
				nextEvents = [event, ...state.events];
				if (nextEvents.length > state.limit) {
					nextEvents = nextEvents.slice(0, state.limit);
				}
			}

			return {
				events: nextEvents,
				total: state.total + 1,
			};
		}),

	setFilters: (filters) =>
		set(() => ({
			filters,
			offset: 0, // Reset pagination when filters change
		})),

	setSort: (sort) =>
		set(() => ({
			sort,
			offset: 0, // Reset pagination when sort changes
		})),

	setLoading: (loading) => set({ loading }),

	setError: (error) => set({ error, loading: false }),

	loadMore: () =>
		set((state) => ({
			offset: state.offset + state.limit,
		})),

	reset: () => set(initialState),
});
