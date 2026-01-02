import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import type { ExecutionEventPayload } from "@/types";
import { createTimelineSlice, type TimelineState } from "../timelineSlice";

const createMockEvent = (overrides?: Partial<ExecutionEventPayload>): ExecutionEventPayload => ({
	event_id: "evt-123",
	context: {
		source: "cell",
		document_path: "analysis.R",
		cell_index: 1,
		triggered_at_ms: 1700000000000,
		actor: "user",
	},
	blocks: [
		{
			id: "block-1",
			index: 0,
			kind: "section",
			label: "Setup",
			start_line: 1,
			end_line: 3,
			code: "x <- 1:10",
		},
	],
	result: {
		success: true,
		output: "[1] 1 2 3",
		error: null,
		plots: [],
		execution_time_ms: 42,
	},
	environment: {
		r_path: "Rscript",
		working_dir: "/tmp",
		temp_dir: "/tmp/reprod",
	},
	created_at_ms: 1700000000500,
	...overrides,
});

describe("timelineSlice", () => {
	let store: ReturnType<typeof create<TimelineState>>;

	beforeEach(() => {
		store = create<TimelineState>()(createTimelineSlice);
	});

	describe("initial state", () => {
		it("should have correct initial state", () => {
			const state = store.getState();

			expect(state.events).toEqual([]);
			expect(state.total).toBe(0);
			expect(state.hasMore).toBe(false);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.filters).toEqual({});
			expect(state.sort).toBe("desc");
			expect(state.limit).toBe(50);
			expect(state.offset).toBe(0);
		});
	});

	describe("setEvents", () => {
		it("should set events and update state", () => {
			const events = [createMockEvent(), createMockEvent({ event_id: "evt-456" })];

			store.getState().setEvents(events, 100, true);

			const state = store.getState();
			expect(state.events).toEqual(events);
			expect(state.total).toBe(100);
			expect(state.hasMore).toBe(true);
			expect(state.offset).toBe(2);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
		});

		it("should handle empty events array", () => {
			store.getState().setEvents([], 0, false);

			const state = store.getState();
			expect(state.events).toEqual([]);
			expect(state.total).toBe(0);
			expect(state.hasMore).toBe(false);
			expect(state.offset).toBe(0);
		});

		it("should override previous events", () => {
			const firstEvents = [createMockEvent()];
			const secondEvents = [createMockEvent({ event_id: "evt-new" })];

			store.getState().setEvents(firstEvents, 1, false);
			store.getState().setEvents(secondEvents, 1, false);

			const state = store.getState();
			expect(state.events).toEqual(secondEvents);
			expect(state.events[0].event_id).toBe("evt-new");
		});
	});

	describe("addEvent", () => {
		it("should add new event to the beginning when sort is desc", () => {
			const existingEvent = createMockEvent({ event_id: "evt-1" });
			const newEvent = createMockEvent({ event_id: "evt-2" });

			store.getState().setEvents([existingEvent], 1, false);
			store.getState().addEvent(newEvent);

			const state = store.getState();
			expect(state.events).toHaveLength(2);
			expect(state.events[0].event_id).toBe("evt-2");
			expect(state.events[1].event_id).toBe("evt-1");
			expect(state.total).toBe(2);
		});

		it("should add new event to the end when sort is asc", () => {
			const existingEvent = createMockEvent({ event_id: "evt-1" });
			const newEvent = createMockEvent({ event_id: "evt-2" });

			store.getState().setSort("asc");
			store.getState().setEvents([existingEvent], 1, false);
			store.getState().addEvent(newEvent);

			const state = store.getState();
			expect(state.events).toHaveLength(2);
			expect(state.events[0].event_id).toBe("evt-1");
			expect(state.events[1].event_id).toBe("evt-2");
			expect(state.total).toBe(2);
		});

		it("should not add duplicate event", () => {
			const event = createMockEvent({ event_id: "evt-1" });

			store.getState().setEvents([event], 1, false);
			store.getState().addEvent(event);

			const state = store.getState();
			expect(state.events).toHaveLength(1);
			expect(state.total).toBe(1);
		});

		it("should trim events when exceeding limit (desc)", () => {
			// Set limit to 2
			store.setState({ limit: 2, sort: "desc" });

			const event1 = createMockEvent({ event_id: "evt-1" });
			const event2 = createMockEvent({ event_id: "evt-2" });
			const event3 = createMockEvent({ event_id: "evt-3" });

			store.getState().setEvents([event1, event2], 2, false);
			store.getState().addEvent(event3);

			const state = store.getState();
			expect(state.events).toHaveLength(2);
			expect(state.events[0].event_id).toBe("evt-3");
			expect(state.events[1].event_id).toBe("evt-1");
			expect(state.total).toBe(3);
		});

		it("should trim events when exceeding limit (asc)", () => {
			// Set limit to 2
			store.setState({ limit: 2, sort: "asc" });

			const event1 = createMockEvent({ event_id: "evt-1" });
			const event2 = createMockEvent({ event_id: "evt-2" });
			const event3 = createMockEvent({ event_id: "evt-3" });

			store.getState().setEvents([event1, event2], 2, false);
			store.getState().addEvent(event3);

			const state = store.getState();
			expect(state.events).toHaveLength(2);
			expect(state.events[0].event_id).toBe("evt-2");
			expect(state.events[1].event_id).toBe("evt-3");
			expect(state.total).toBe(3);
		});
	});

	describe("setFilters", () => {
		it("should set filters and reset offset", () => {
			store.setState({ offset: 50 });

			const filters = {
				actor: "user" as const,
				hasPlots: true,
			};

			store.getState().setFilters(filters);

			const state = store.getState();
			expect(state.filters).toEqual(filters);
			expect(state.offset).toBe(0);
		});

		it("should handle empty filters", () => {
			store.getState().setFilters({});

			const state = store.getState();
			expect(state.filters).toEqual({});
		});

		it("should handle complex filters", () => {
			const filters = {
				actor: "ai" as const,
				source: "cell" as const,
				startTime: 1700000000000,
				endTime: 1700003600000,
				hasPlots: true,
				hasErrors: false,
				codeContains: "ggplot",
			};

			store.getState().setFilters(filters);

			const state = store.getState();
			expect(state.filters).toEqual(filters);
		});
	});

	describe("setSort", () => {
		it("should set sort to asc and reset offset", () => {
			store.setState({ offset: 50 });

			store.getState().setSort("asc");

			const state = store.getState();
			expect(state.sort).toBe("asc");
			expect(state.offset).toBe(0);
		});

		it("should set sort to desc and reset offset", () => {
			store.setState({ offset: 50, sort: "asc" });

			store.getState().setSort("desc");

			const state = store.getState();
			expect(state.sort).toBe("desc");
			expect(state.offset).toBe(0);
		});
	});

	describe("setLoading", () => {
		it("should set loading to true", () => {
			store.getState().setLoading(true);

			expect(store.getState().loading).toBe(true);
		});

		it("should set loading to false", () => {
			store.setState({ loading: true });

			store.getState().setLoading(false);

			expect(store.getState().loading).toBe(false);
		});
	});

	describe("setError", () => {
		it("should set error message and stop loading", () => {
			store.setState({ loading: true });

			store.getState().setError("Failed to load timeline");

			const state = store.getState();
			expect(state.error).toBe("Failed to load timeline");
			expect(state.loading).toBe(false);
		});

		it("should clear error", () => {
			store.setState({ error: "Previous error", loading: true });

			store.getState().setError(null);

			const state = store.getState();
			expect(state.error).toBe(null);
			expect(state.loading).toBe(false);
		});
	});

	describe("loadMore", () => {
		it("should increment offset by limit", () => {
			store.setState({ limit: 20, offset: 0 });

			store.getState().loadMore();

			expect(store.getState().offset).toBe(20);

			store.getState().loadMore();

			expect(store.getState().offset).toBe(40);
		});

		it("should respect custom limit", () => {
			store.setState({ limit: 100, offset: 0 });

			store.getState().loadMore();

			expect(store.getState().offset).toBe(100);
		});
	});

	describe("reset", () => {
		it("should reset to initial state", () => {
			// Modify state
			store.setState({
				events: [createMockEvent()],
				total: 100,
				hasMore: true,
				loading: true,
				error: "Some error",
				filters: { actor: "user" },
				sort: "asc",
				limit: 100,
				offset: 50,
			});

			store.getState().reset();

			const state = store.getState();
			expect(state.events).toEqual([]);
			expect(state.total).toBe(0);
			expect(state.hasMore).toBe(false);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(null);
			expect(state.filters).toEqual({});
			expect(state.sort).toBe("desc");
			expect(state.limit).toBe(50);
			expect(state.offset).toBe(0);
		});
	});

	describe("integration scenarios", () => {
		it("should handle pagination flow", () => {
			// Initial load
			const firstBatch = [
				createMockEvent({ event_id: "evt-1" }),
				createMockEvent({ event_id: "evt-2" }),
			];
			store.getState().setEvents(firstBatch, 100, true);

			expect(store.getState().offset).toBe(2);
			expect(store.getState().hasMore).toBe(true);

			// Load more
			store.getState().loadMore();
			expect(store.getState().offset).toBe(52); // 2 + 50
		});

		it("should handle filter change flow", () => {
			// Initial load
			const events = [createMockEvent()];
			store.getState().setEvents(events, 100, true);
			store.setState({ offset: 50 });

			// Change filters - should reset offset
			store.getState().setFilters({ actor: "user" });

			expect(store.getState().offset).toBe(0);
		});

		it("should handle real-time event additions", () => {
			// Initial load
			const events = [
				createMockEvent({ event_id: "evt-1", created_at_ms: 1700000000000 }),
				createMockEvent({ event_id: "evt-2", created_at_ms: 1700000001000 }),
			];
			store.getState().setEvents(events, 2, false);

			// New real-time event
			const newEvent = createMockEvent({
				event_id: "evt-3",
				created_at_ms: 1700000002000,
			});
			store.getState().addEvent(newEvent);

			const state = store.getState();
			expect(state.events).toHaveLength(3);
			expect(state.events[0].event_id).toBe("evt-3"); // Most recent first (desc)
			expect(state.total).toBe(3);
		});
	});
});
