import { createStore } from "zustand";
import { describe, expect, it, beforeEach } from "vitest";
import { createPlotHistorySlice, type PlotHistorySlice } from "../plotHistorySlice";

describe("plotHistorySlice", () => {
	let store: ReturnType<typeof createStore<PlotHistorySlice>>;

	beforeEach(() => {
		store = createStore<PlotHistorySlice>((...a) => ({
			...createPlotHistorySlice(...a),
		}));
	});

	const mockPlot = {
		id: "1",
		filename: "plot.png",
		storagePath: "/plots/plot.png",
		data: "base64data",
		timestamp: 1000,
		width: 100,
		height: 100,
	};

	it("should initialize with default state", () => {
		const state = store.getState().plotHistory;
		expect(state.items).toEqual([]);
		expect(state.activePlotId).toBeNull();
	});

	describe("appendPlotHistory", () => {
		it("should append plots and set active plot", () => {
			store.getState().appendPlotHistory([mockPlot]);

			const state = store.getState().plotHistory;
			expect(state.items).toHaveLength(1);
			expect(state.items[0].id).toBe("1");
			expect(state.activePlotId).toBe("1");
		});

		it("should maintain sort order by timestamp", () => {
			const plot1 = { ...mockPlot, id: "1", timestamp: 1000 };
			const plot2 = { ...mockPlot, id: "2", timestamp: 2000 };
			const plot3 = { ...mockPlot, id: "3", timestamp: 500 };

			store.getState().appendPlotHistory([plot1, plot2, plot3]);

			const items = store.getState().plotHistory.items;
			expect(items.map((p) => p.id)).toEqual(["3", "1", "2"]);
		});

		it("should update active plot if specified", () => {
			store.getState().appendPlotHistory([mockPlot], "custom-id");
			expect(store.getState().plotHistory.activePlotId).toBe("custom-id");
		});

		it("should merge duplicate plots", () => {
			store.getState().appendPlotHistory([mockPlot]);
			store.getState().appendPlotHistory([mockPlot]);

			expect(store.getState().plotHistory.items).toHaveLength(1);
		});
	});

	describe("navigation", () => {
		const plot1 = { ...mockPlot, id: "1", timestamp: 1000 };
		const plot2 = { ...mockPlot, id: "2", timestamp: 2000 };
		const plot3 = { ...mockPlot, id: "3", timestamp: 3000 };

		beforeEach(() => {
			store.getState().appendPlotHistory([plot1, plot2, plot3]);
		});

		it("should select next plot", () => {
			store.getState().setActivePlotId("1");
			store.getState().selectNextPlot();
			expect(store.getState().plotHistory.activePlotId).toBe("2");
		});

		it("should stop at last plot when selecting next", () => {
			store.getState().setActivePlotId("3");
			store.getState().selectNextPlot();
			expect(store.getState().plotHistory.activePlotId).toBe("3");
		});

		it("should select previous plot", () => {
			store.getState().setActivePlotId("2");
			store.getState().selectPreviousPlot();
			expect(store.getState().plotHistory.activePlotId).toBe("1");
		});

		it("should stop at first plot when selecting previous", () => {
			store.getState().setActivePlotId("1");
			store.getState().selectPreviousPlot();
			expect(store.getState().plotHistory.activePlotId).toBe("1");
		});
	});

	describe("snapshot", () => {
		it("should apply snapshot", () => {
			const snapshot = {
				plots: [mockPlot],
				activePlotId: "1",
				thumbnails: {},
			};

			store.getState().applyPlotHistorySnapshot(snapshot);

			const state = store.getState().plotHistory;
			expect(state.items).toHaveLength(1);
			expect(state.items[0].id).toBe("1");
			expect(state.activePlotId).toBe("1");
		});
	});
});
