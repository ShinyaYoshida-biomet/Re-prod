/**
 * Types and reducer for FileBrowser local UI state management.
 *
 * This consolidates related states that often update together:
 * - Clipboard (copy/cut operations)
 * - Selection anchor/focus
 * - Context menu
 * - Drag-drop state
 */

/**
 * Clipboard state for copy/cut operations.
 */
export type ClipboardState = {
	mode: "copy" | "cut";
	paths: string[];
} | null;

/**
 * Context menu state for right-click operations.
 */
export type ContextMenuState = {
	x: number;
	y: number;
	path: string;
	isDir: boolean;
} | null;

/**
 * Selection state for tracking anchor and focus in the file tree.
 */
export interface SelectionState {
	/** The path that serves as the anchor for shift-selection */
	anchorPath: string | null;
	/** The path that is currently focused (keyboard navigation) */
	focusedPath: string | null;
}

/**
 * Combined UI state for the FileBrowser component.
 */
export interface FileBrowserUIState {
	clipboard: ClipboardState;
	selection: SelectionState;
	contextMenu: ContextMenuState;
	dragOverPath: string | null;
}

/**
 * Actions for modifying FileBrowser UI state.
 */
export type FileBrowserUIAction =
	| { type: "SET_CLIPBOARD"; payload: ClipboardState }
	| { type: "SET_ANCHOR"; payload: string | null }
	| { type: "SET_FOCUSED"; payload: string | null }
	| { type: "SET_SELECTION"; anchor: string | null; focused: string | null }
	| { type: "SHOW_CONTEXT_MENU"; payload: ContextMenuState }
	| { type: "HIDE_CONTEXT_MENU" }
	| { type: "SET_DRAG_OVER"; payload: string | null }
	| { type: "COPY_CUT"; clipboard: ClipboardState; clearSelection?: boolean }
	| { type: "CLEAR_CLIPBOARD" }
	| { type: "RESET" };

/**
 * Initial state for FileBrowser UI.
 */
export const fileBrowserUIInitialState: FileBrowserUIState = {
	clipboard: null,
	selection: {
		anchorPath: null,
		focusedPath: null,
	},
	contextMenu: null,
	dragOverPath: null,
};

/**
 * Reducer function for FileBrowser UI state.
 */
export function fileBrowserUIReducer(
	state: FileBrowserUIState,
	action: FileBrowserUIAction,
): FileBrowserUIState {
	switch (action.type) {
		case "SET_CLIPBOARD":
			return { ...state, clipboard: action.payload };

		case "SET_ANCHOR":
			return {
				...state,
				selection: { ...state.selection, anchorPath: action.payload },
			};

		case "SET_FOCUSED":
			return {
				...state,
				selection: { ...state.selection, focusedPath: action.payload },
			};

		case "SET_SELECTION":
			return {
				...state,
				selection: { anchorPath: action.anchor, focusedPath: action.focused },
			};

		case "SHOW_CONTEXT_MENU":
			return { ...state, contextMenu: action.payload };

		case "HIDE_CONTEXT_MENU":
			return { ...state, contextMenu: null };

		case "SET_DRAG_OVER":
			return { ...state, dragOverPath: action.payload };

		case "COPY_CUT":
			return {
				...state,
				clipboard: action.clipboard,
			};

		case "CLEAR_CLIPBOARD":
			return { ...state, clipboard: null };

		case "RESET":
			return fileBrowserUIInitialState;

		default:
			return state;
	}
}
