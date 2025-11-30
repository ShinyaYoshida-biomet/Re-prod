import type { ExecutionLogPlot } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelTabItem } from "@/components/shared";
import { useStore } from "@/core";
import { setActivePlot } from "@/services/plotHistoryService";
import type {
	BottomPanePlotTab,
	BottomPaneTab,
	PlotFocusCustomEvent,
	PlotNavigationState,
} from "@/types/panels";

interface UseBottomPaneStateResult {
	tabs: PanelTabItem<BottomPaneTab>[];
	activeTab: BottomPaneTab;
	setActiveTab: (tab: BottomPaneTab) => void;
	navigation: PlotNavigationState;
	allPlots: ExecutionLogPlot[];
	currentPlot: ExecutionLogPlot | null;
	selectPreviousPlot: () => void;
	selectNextPlot: () => void;
	goToPreviousPlot: () => void;
	goToNextPlot: () => void;
	clearExecutionResults: () => void;
}

const DEFAULT_TAB: BottomPaneTab = "console";
const TERMINAL_FOCUS_EVENT = "terminal:focus";

export function useBottomPaneState(): UseBottomPaneStateResult {
	const clearExecutionResults = useStore((state) => state.clearExecutionResults);
	const plotHistory = useStore((state) => state.plotHistory);
	const focusPlotByIndex = useStore((state) => state.focusPlotByIndex);
	const focusPlotById = useStore((state) => state.focusPlotById);
	const selectPreviousPlot = useStore((state) => state.selectPreviousPlot);
	const selectNextPlot = useStore((state) => state.selectNextPlot);
	const executionResults = useStore((state) => state.execution.results);

	const [activeTab, setActiveTab] = useState<BottomPaneTab>(DEFAULT_TAB);
	const previousPlotCount = useRef(0);
	const previousResultCount = useRef(0);

	const allPlots = useMemo<ExecutionLogPlot[]>(() => plotHistory.items, [plotHistory.items]);

	const selectedPlotIndex = useMemo(() => {
		const index = allPlots.findIndex((plot) => plot.id === plotHistory.activePlotId);
		if (index !== -1) return index;
		if (allPlots.length === 0) return -1;
		return allPlots.length - 1;
	}, [allPlots, plotHistory.activePlotId]);

	const currentPlot = selectedPlotIndex >= 0 ? allPlots[selectedPlotIndex] : null;

	const tabs = useMemo<PanelTabItem<BottomPaneTab>[]>(() => {
		const list: PanelTabItem<BottomPaneTab>[] = [
			{ id: "console", label: "Console" },
			{ id: "history", label: "History" },
			{ id: "terminal", label: "Terminal" },
			{ id: "plots", label: "Plots" },
		];
		list.push({ id: "help", label: "Help" });
		return list;
	}, []);

	useEffect(() => {
		const handleFocusPlot = (event: Event) => {
			const detail = (event as PlotFocusCustomEvent).detail;
			setActiveTab("plots");
			if (detail?.plotId) {
				focusPlotById(detail.plotId);
				return;
			}
			if (typeof detail?.plotIndex === "number") {
				focusPlotByIndex(Math.max(0, Math.min(detail.plotIndex, allPlots.length - 1)));
			}
		};

		window.addEventListener("focusPlot", handleFocusPlot);
		return () => {
			window.removeEventListener("focusPlot", handleFocusPlot);
		};
	}, [allPlots.length, focusPlotById, focusPlotByIndex]);

	useEffect(() => {
		const previousCount = previousPlotCount.current;
		if (allPlots.length > previousCount) {
			setActiveTab("plots");
			focusPlotByIndex(allPlots.length - 1);
		}
		previousPlotCount.current = allPlots.length;
	}, [allPlots.length, focusPlotByIndex]);

	// Whenever a new execution result arrives, switch to console to show output.
	useEffect(() => {
		const prevCount = previousResultCount.current;
		if (executionResults.length > prevCount) {
			setActiveTab("console");
		}
		previousResultCount.current = executionResults.length;
	}, [executionResults.length]);

	useEffect(() => {
		if (allPlots.length > 0 && !plotHistory.activePlotId) {
			focusPlotByIndex(allPlots.length - 1);
		}
	}, [allPlots.length, focusPlotByIndex, plotHistory.activePlotId]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const handleFocus = () => {
			setActiveTab("terminal");
		};

		window.addEventListener(TERMINAL_FOCUS_EVENT, handleFocus);
		return () => {
			window.removeEventListener(TERMINAL_FOCUS_EVENT, handleFocus);
		};
	}, []);

	const navigation: PlotNavigationState = {
		activeTab:
			activeTab === "plots" || activeTab === "help" ? (activeTab as BottomPanePlotTab) : "help",
		selectedPlotIndex: selectedPlotIndex >= 0 ? selectedPlotIndex : 0,
		totalPlots: allPlots.length,
	};

	const persistActivePlot = useCallback((plotId?: string) => {
		if (!plotId) {
			return;
		}
		void setActivePlot(plotId).catch((error) => {
			console.warn("Failed to persist active plot", error);
		});
	}, []);

	const goToPreviousPlot = useCallback(() => {
		if (allPlots.length === 0) return;

		const nextIndex = Math.max(0, selectedPlotIndex - 1);
		const targetId = allPlots[nextIndex]?.id;
		selectPreviousPlot();
		persistActivePlot(targetId);
	}, [allPlots, persistActivePlot, selectPreviousPlot, selectedPlotIndex]);

	const goToNextPlot = useCallback(() => {
		if (allPlots.length === 0) return;

		const nextIndex = Math.min(allPlots.length - 1, selectedPlotIndex + 1);
		const targetId = allPlots[nextIndex]?.id;
		selectNextPlot();
		persistActivePlot(targetId);
	}, [allPlots, persistActivePlot, selectNextPlot, selectedPlotIndex]);

	return {
		tabs,
		activeTab,
		setActiveTab,
		navigation,
		allPlots,
		currentPlot,
		selectPreviousPlot,
		selectNextPlot,
		goToPreviousPlot,
		goToNextPlot,
		clearExecutionResults,
	};
}
