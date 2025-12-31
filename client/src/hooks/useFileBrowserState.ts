import { useCallback, useReducer } from "react";
import type {
	ClipboardState,
	ContextMenuState,
	FileBrowserUIAction,
	FileBrowserUIState,
} from "@/types/fileBrowser";
import { fileBrowserUIInitialState, fileBrowserUIReducer } from "@/types/fileBrowser";

/**
 * State returned by the useFileBrowserState hook.
 */
export interface UseFileBrowserState {
	/** Current UI state */
	fileBrowserState: FileBrowserUIState;
}

/**
 * Actions returned by the useFileBrowserState hook.
 */
export interface UseFileBrowserActions {
	/** Raw dispatch function for custom actions */
	dispatch: React.Dispatch<FileBrowserUIAction>;

	// Clipboard operations
	/** Set the clipboard state */
	setClipboard: (clipboard: ClipboardState) => void;
	/** Clear the clipboard */
	clearClipboard: () => void;

	// Selection operations
	/** Set the selection anchor path */
	setAnchorPath: (path: string | null) => void;
	/** Set the focused path */
	setFocusedPath: (path: string | null) => void;
	/** Set both anchor and focused paths at once */
	setSelection: (anchor: string | null, focused: string | null) => void;

	// Context menu operations
	/** Show the context menu at the specified position */
	showContextMenu: (menu: ContextMenuState) => void;
	/** Hide the context menu */
	hideContextMenu: () => void;

	// Drag-drop operations
	/** Set the current drag-over path */
	setDragOverPath: (path: string | null) => void;

	// Utility operations
	/** Reset all state to initial values */
	reset: () => void;
}

/**
 * Return type for the useFileBrowserState hook.
 */
export interface UseFileBrowserStateReturn {
	state: UseFileBrowserState;
	actions: UseFileBrowserActions;
}

/**
 * A hook for managing FileBrowser local UI state.
 *
 * Consolidates related states that often update together:
 * - Clipboard (copy/cut operations)
 * - Selection anchor/focus
 * - Context menu
 * - Drag-drop state
 *
 * @example
 * ```tsx
 * function FileBrowserPane() {
 *   const { state, actions } = useFileBrowserState();
 *   const { fileBrowserState } = state;
 *   const {
 *     setClipboard,
 *     setSelection,
 *     showContextMenu,
 *     hideContextMenu,
 *     setDragOverPath,
 *   } = actions;
 *
 *   const { clipboard, selection, contextMenu, dragOverPath } = fileBrowserState;
 *   const { anchorPath, focusedPath } = selection;
 *
 *   // Use in handlers...
 * }
 * ```
 */
export function useFileBrowserState(): UseFileBrowserStateReturn {
	const [fileBrowserState, dispatch] = useReducer(fileBrowserUIReducer, fileBrowserUIInitialState);

	// Clipboard operations
	const setClipboard = useCallback((clipboard: ClipboardState) => {
		dispatch({ type: "SET_CLIPBOARD", payload: clipboard });
	}, []);

	const clearClipboard = useCallback(() => {
		dispatch({ type: "CLEAR_CLIPBOARD" });
	}, []);

	// Selection operations
	const setAnchorPath = useCallback((path: string | null) => {
		dispatch({ type: "SET_ANCHOR", payload: path });
	}, []);

	const setFocusedPath = useCallback((path: string | null) => {
		dispatch({ type: "SET_FOCUSED", payload: path });
	}, []);

	const setSelection = useCallback((anchor: string | null, focused: string | null) => {
		dispatch({ type: "SET_SELECTION", anchor, focused });
	}, []);

	// Context menu operations
	const showContextMenu = useCallback((menu: ContextMenuState) => {
		dispatch({ type: "SHOW_CONTEXT_MENU", payload: menu });
	}, []);

	const hideContextMenu = useCallback(() => {
		dispatch({ type: "HIDE_CONTEXT_MENU" });
	}, []);

	// Drag-drop operations
	const setDragOverPath = useCallback((path: string | null) => {
		dispatch({ type: "SET_DRAG_OVER", payload: path });
	}, []);

	// Utility operations
	const reset = useCallback(() => {
		dispatch({ type: "RESET" });
	}, []);

	return {
		state: {
			fileBrowserState,
		},
		actions: {
			dispatch,
			setClipboard,
			clearClipboard,
			setAnchorPath,
			setFocusedPath,
			setSelection,
			showContextMenu,
			hideContextMenu,
			setDragOverPath,
			reset,
		},
	};
}
