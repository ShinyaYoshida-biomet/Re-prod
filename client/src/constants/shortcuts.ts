/**
 * Keyboard shortcuts configuration
 * Centralized definitions for all application shortcuts
 */

export interface ShortcutItem {
	id: string;
	keys: string[];
	description: string;
	scope?: string;
}

export interface ShortcutGroup {
	title: string;
	items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "General",
		items: [
			{ id: "file-new", keys: ["⌘N", "Ctrl+N"], description: "New R script" },
			{
				id: "file-open",
				keys: ["⌘O", "Ctrl+O"],
				description: "Open existing file",
			},
			{
				id: "file-save",
				keys: ["⌘S", "Ctrl+S"],
				description: "Save current file",
			},
			{
				id: "file-save-as",
				keys: ["⌘⇧S", "Ctrl+Shift+S"],
				description: "Save as new file",
			},
			{ id: "settings", keys: ["⌘,", "Ctrl+,"], description: "Open settings" },
			{ id: "ai", keys: ["⌘K", "Ctrl+K"], description: "Focus AI Assistant" },
		],
	},
	{
		title: "Code Execution",
		items: [
			{
				id: "run-selection",
				keys: ["⌘↵", "Ctrl+Enter"],
				description: "Run current line or selection",
				scope: "Editor",
			},
			{
				id: "run-next",
				keys: ["Shift+Enter"],
				description: "Run cell and move to next",
				scope: "Editor",
			},
			{
				id: "run-all",
				keys: ["⌘⇧↵", "Ctrl+Shift+Enter"],
				description: "Run entire document",
				scope: "Editor",
			},
			{ id: "interrupt", keys: ["Esc"], description: "Interrupt running code" },
			{
				id: "restart",
				keys: ["⌘⇧0", "Ctrl+Shift+0"],
				description: "Restart R session",
			},
		],
	},
	{
		title: "Session & Navigation",
		items: [
			{ id: "timeline", keys: ["⌘T", "Ctrl+T"], description: "Open timeline" },
			{
				id: "new-session",
				keys: ["⌘⇧N", "Ctrl+Shift+N"],
				description: "Start new session",
			},
			{
				id: "toggle-editor",
				keys: ["⌘1", "Ctrl+1"],
				description: "Show or hide editor",
			},
			{
				id: "toggle-console",
				keys: ["⌘2", "Ctrl+2"],
				description: "Show or hide console",
			},
			{
				id: "toggle-plots",
				keys: ["⌘3", "Ctrl+3"],
				description: "Show or hide plots",
			},
			{
				id: "toggle-timeline",
				keys: ["⌘4", "Ctrl+4"],
				description: "Toggle timeline tab",
			},
		],
	},
	{
		title: "View & Editing",
		items: [
			{
				id: "comment",
				keys: ["⌘/", "Ctrl+/"],
				description: "Comment or uncomment selection",
				scope: "Editor",
			},
			{
				id: "find",
				keys: ["⌘F", "Ctrl+F"],
				description: "Find in editor",
				scope: "Editor",
			},
			{
				id: "replace",
				keys: ["⌘H", "Ctrl+H"],
				description: "Find and replace",
				scope: "Editor",
			},
			{ id: "zoom-in", keys: ["⌘+", "Ctrl++"], description: "Zoom in" },
			{ id: "zoom-out", keys: ["⌘-", "Ctrl+-"], description: "Zoom out" },
			{ id: "zoom-reset", keys: ["⌘0", "Ctrl+0"], description: "Reset zoom" },
		],
	},
];
