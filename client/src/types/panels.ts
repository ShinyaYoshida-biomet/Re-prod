/**
 * Cross-component UI panel types.
 *
 * These types intentionally live outside React components so that hooks,
 * services, and tests can share a consistent vocabulary when dealing with
 * panel interactions.
 */

/** Tabs rendered in the Console panel */
export type ConsoleTabId = "console" | "history";

/** Tabs rendered in the consolidated bottom pane (excluding the console) */
export type BottomPanePlotTab = "plots" | "help";

/** Tabs rendered in the consolidated bottom pane */
export type BottomPaneTab = "console" | "history" | "terminal" | "environment" | BottomPanePlotTab;

/** Payload sent when other components want to focus a plot */
export interface PlotFocusEventDetail {
	plotIndex: number;
	plotId?: string;
}

/** State snapshot for navigating generated plots */
export interface PlotNavigationState {
	activeTab: BottomPanePlotTab;
	selectedPlotIndex: number;
	totalPlots: number;
}

/** Strongly typed custom event fired from the console */
export type PlotFocusCustomEvent = CustomEvent<PlotFocusEventDetail>;
