import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { type AIState, createAISlice } from "./slices/aiSlice";
import { type ConnectionState, createConnectionSlice } from "./slices/connectionSlice";
import { createEditorSlice, type EditorState } from "./slices/editorSlice";
import { createExecutionSlice, type ExecutionState } from "./slices/executionSlice";
import { createPendingEditSlice, type PendingEditState } from "./slices/pendingEditSlice";
import { createPlotHistorySlice, type PlotHistorySlice } from "./slices/plotHistorySlice";
import { createProjectSlice, type ProjectState } from "./slices/projectSlice";
import { createSettingsSlice, type SettingsState } from "./slices/settingsSlice";
import { createTimelineSlice, type TimelineState } from "./slices/timelineSlice";
import { createViewSlice, type ViewState } from "./slices/viewSlice";

export type StoreState = EditorState &
	ExecutionState &
	AIState &
	PendingEditState &
	SettingsState &
	ConnectionState &
	TimelineState &
	PlotHistorySlice &
	ViewState &
	ProjectState;

export const useStore = create<StoreState>()(
	devtools(
		(...args) => ({
			...createEditorSlice(...args),
			...createExecutionSlice(...args),
			...createAISlice(...args),
			...createPendingEditSlice(...args),
			...createSettingsSlice(...args),
			...createConnectionSlice(...args),
			...createTimelineSlice(...args),
			...createViewSlice(...args),
			...createProjectSlice(...args),
			...createPlotHistorySlice(...args),
		}),
		{ name: "Re-prod Store" },
	),
);
