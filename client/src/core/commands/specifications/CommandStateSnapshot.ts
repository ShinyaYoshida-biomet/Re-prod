import type { ViewPane } from "@/core/state/slices/viewSlice";

/**
 * Snapshot of application state relevant for command condition evaluation.
 * This interface captures all state needed to determine command availability and checked state.
 */
export interface CommandStateSnapshot {
	/** Whether the active editor buffer has unsaved changes */
	isEditorDirty: boolean;

	/** Whether R code execution is currently running */
	isExecutionRunning: boolean;

	/** Visibility state of each view pane */
	viewPanes: Record<ViewPane, boolean>;

	/** Whether an editor instance is available */
	hasActiveEditor: boolean;

	/** Whether the editor has focus */
	isEditorFocused: boolean;
}
