import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/core';
import type { PanelTabItem } from '@/components/shared';
import type {
  BottomPanePlotTab,
  BottomPaneTab,
  PlotFocusCustomEvent,
  PlotNavigationState,
} from '@/types/panels';
import type { ExecutionLogPlot } from '@shared/types';

interface UseBottomPaneStateResult {
  tabs: PanelTabItem<BottomPaneTab>[];
  activeTab: BottomPaneTab;
  setActiveTab: (tab: BottomPaneTab) => void;
  navigation: PlotNavigationState;
  allPlots: ExecutionLogPlot[];
  currentPlot: ExecutionLogPlot | null;
  selectPreviousPlot: () => void;
  selectNextPlot: () => void;
  clearExecutionResults: () => void;
}

const DEFAULT_TAB: BottomPaneTab = 'console';

export function useBottomPaneState(): UseBottomPaneStateResult {
  const execution = useStore((state) => state.execution);
  const clearExecutionResults = useStore((state) => state.clearExecutionResults);

  const [activeTab, setActiveTab] = useState<BottomPaneTab>(DEFAULT_TAB);
  const [selectedPlotIndex, setSelectedPlotIndex] = useState(0);
  const previousPlotCount = useRef(0);

  const allPlots = useMemo<ExecutionLogPlot[]>(
    () => execution.results.flatMap((result) => result.plots),
    [execution.results]
  );

  const currentPlot = allPlots[selectedPlotIndex] ?? null;

  const tabs = useMemo<PanelTabItem<BottomPaneTab>[]>(() => {
    const list: PanelTabItem<BottomPaneTab>[] = [
      { id: 'console', label: 'Console' },
      { id: 'history', label: 'History' },
      { id: 'plots', label: 'Plots' },
    ];
    list.push({ id: 'help', label: 'Help' });
    return list;
  }, []);

  useEffect(() => {
    const handleFocusPlot = (event: Event) => {
      const detail = (event as PlotFocusCustomEvent).detail;
      if (typeof detail?.plotIndex !== 'number') {
        return;
      }

      setActiveTab('plots');
      setSelectedPlotIndex(Math.max(0, Math.min(detail.plotIndex, allPlots.length - 1)));
    };

    window.addEventListener('focusPlot', handleFocusPlot);
    return () => {
      window.removeEventListener('focusPlot', handleFocusPlot);
    };
  }, [allPlots.length]);

  useEffect(() => {
    const previousCount = previousPlotCount.current;
    if (allPlots.length > previousCount) {
      setActiveTab('plots');
      setSelectedPlotIndex(allPlots.length - 1);
    }
    previousPlotCount.current = allPlots.length;
  }, [allPlots.length]);

  useEffect(() => {
    if (selectedPlotIndex >= allPlots.length && allPlots.length > 0) {
      setSelectedPlotIndex(allPlots.length - 1);
    }
  }, [allPlots.length, selectedPlotIndex]);

  useEffect(() => {
    if (activeTab === 'timeline') {
      // Timeline is no longer a tab, default to help
      setActiveTab('help');
    }
  }, [activeTab]);

  const selectPreviousPlot = useCallback(() => {
    setSelectedPlotIndex((current) => Math.max(0, current - 1));
  }, []);

  const selectNextPlot = useCallback(() => {
    setSelectedPlotIndex((current) => Math.min(allPlots.length - 1, current + 1));
  }, [allPlots.length]);

  const navigation: PlotNavigationState = {
    activeTab:
      activeTab === 'plots' || activeTab === 'timeline' || activeTab === 'help'
        ? (activeTab as BottomPanePlotTab)
        : 'help',
    selectedPlotIndex,
    totalPlots: allPlots.length,
  };

  return {
    tabs,
    activeTab,
    setActiveTab,
    navigation,
    allPlots,
    currentPlot,
    selectPreviousPlot,
    selectNextPlot,
    clearExecutionResults,
  };
}
