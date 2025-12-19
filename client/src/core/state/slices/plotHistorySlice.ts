import type { PlotHistoryEntryPayload, PlotHistoryStatePayload } from "@/types";
import type { StateCreator } from "zustand";

export interface PlotHistoryItem {
	id: string;
	filename: string;
	path: string;
	storagePath: string;
	data: string;
	timestamp: number;
	width: number;
	height: number;
	code?: string | null;
	snapshotPath?: string | null;
}

export interface PlotHistorySlice {
	plotHistory: {
		items: PlotHistoryItem[];
		activePlotId: string | null;
		isLoading: boolean;
		error?: string | null;
	};
	resetPlotHistory: () => void;
	applyPlotHistorySnapshot: (snapshot: PlotHistoryStatePayload) => void;
	appendPlotHistory: (plots: PlotHistoryEntryPayload[], activePlotId?: string | null) => void;
	setActivePlotId: (plotId: string | null) => void;
	selectNextPlot: () => void;
	selectPreviousPlot: () => void;
	focusPlotByIndex: (index: number) => void;
	focusPlotById: (plotId: string) => void;
}

const DEFAULT_STATE = {
	items: [],
	activePlotId: null,
	isLoading: false,
	error: null,
};

const toDataUrl = (base64: string): string =>
	base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;

const normalizePlot = (plot: PlotHistoryEntryPayload): PlotHistoryItem => ({
	id: plot.id,
	filename: plot.filename,
	path: plot.storagePath,
	storagePath: plot.storagePath,
	data: toDataUrl(plot.data),
	timestamp: plot.timestamp,
	width: plot.width,
	height: plot.height,
	code: plot.code ?? null,
	snapshotPath: plot.snapshotPath ?? null,
});

const sortPlots = (plots: PlotHistoryItem[]): PlotHistoryItem[] =>
	[...plots].sort((a, b) => a.timestamp - b.timestamp);

export const createPlotHistorySlice: StateCreator<PlotHistorySlice> = (set) => ({
	plotHistory: DEFAULT_STATE,
	resetPlotHistory: () =>
		set(() => ({
			plotHistory: { ...DEFAULT_STATE },
		})),
	applyPlotHistorySnapshot: (snapshot) =>
		set(() => {
			const items = snapshot.plots.map(normalizePlot);
			const lastPlotId = items.length > 0 ? items[items.length - 1].id : null;
			const activePlotId = snapshot.activePlotId ?? lastPlotId;
			return {
				plotHistory: {
					items,
					activePlotId,
					isLoading: false,
					error: null,
				},
			};
		}),
	appendPlotHistory: (plots, activePlotId) =>
		set((state) => {
			if (plots.length === 0) {
				return { plotHistory: state.plotHistory };
			}

			const mergedMap = new Map<string, PlotHistoryItem>();
			state.plotHistory.items.forEach((plot) => mergedMap.set(plot.id, plot));
			plots.forEach((plot) => mergedMap.set(plot.id, normalizePlot(plot)));

			const items = sortPlots(Array.from(mergedMap.values()));
			const lastPlotId = items.length > 0 ? items[items.length - 1].id : null;
			const resolvedActive = activePlotId ?? state.plotHistory.activePlotId ?? lastPlotId;

			return {
				plotHistory: {
					...state.plotHistory,
					items,
					activePlotId: resolvedActive,
					error: null,
				},
			};
		}),
	setActivePlotId: (plotId) =>
		set((state) => ({
			plotHistory: { ...state.plotHistory, activePlotId: plotId },
		})),
	selectNextPlot: () =>
		set((state) => {
			const { items, activePlotId } = state.plotHistory;
			if (items.length === 0) return { plotHistory: state.plotHistory };

			const currentIndex = items.findIndex((plot) => plot.id === activePlotId);
			const nextIndex = Math.min(
				items.length - 1,
				currentIndex === -1 ? items.length - 1 : currentIndex + 1,
			);

			return {
				plotHistory: { ...state.plotHistory, activePlotId: items[nextIndex]?.id ?? null },
			};
		}),
	selectPreviousPlot: () =>
		set((state) => {
			const { items, activePlotId } = state.plotHistory;
			if (items.length === 0) return { plotHistory: state.plotHistory };

			const currentIndex = items.findIndex((plot) => plot.id === activePlotId);
			const prevIndex = Math.max(0, (currentIndex === -1 ? items.length - 1 : currentIndex) - 1);

			return {
				plotHistory: { ...state.plotHistory, activePlotId: items[prevIndex]?.id ?? null },
			};
		}),
	focusPlotByIndex: (index) =>
		set((state) => {
			const { items } = state.plotHistory;
			if (index < 0 || index >= items.length) {
				return { plotHistory: state.plotHistory };
			}
			return {
				plotHistory: { ...state.plotHistory, activePlotId: items[index].id },
			};
		}),
	focusPlotById: (plotId) =>
		set((state) => {
			const exists = state.plotHistory.items.some((plot) => plot.id === plotId);
			if (!exists) return { plotHistory: state.plotHistory };

			return {
				plotHistory: { ...state.plotHistory, activePlotId: plotId },
			};
		}),
});
