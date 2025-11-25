/**
 * Keyboard Shortcuts Hook
 *
 * Global keyboard shortcuts for all menu actions.
 * Handles platform differences (Mac vs Windows/Linux) and conflicts.
 */

import { useEffect } from "react";
import { menuActions } from "@/services/menuActions";

/**
 * Normalize keyboard event to shortcut string
 * Uses "Mod" for cross-platform Cmd/Ctrl
 */
function eventToShortcut(e: KeyboardEvent): string {
	const parts: string[] = [];

	// Use "Mod" for cross-platform Cmd/Ctrl
	if (e.ctrlKey || e.metaKey) parts.push("Mod");
	if (e.shiftKey) parts.push("Shift");
	if (e.altKey) parts.push("Alt");

	// Normalize key names
	let key = e.key;
	if (key === "Enter") key = "Enter";
	else if (key === "Escape") key = "Esc";
	else if (key === "`" || key === "~") key = "Backquote";
	else if (key === " ") key = "Space";
	else key = key.toUpperCase();

	parts.push(key);

	return parts.join("+");
}

/**
 * Check if Monaco should handle this shortcut
 */
function isMonacoHandled(e: KeyboardEvent): boolean {
	const mod = e.ctrlKey || e.metaKey;

	// Monaco handles these by default
	const monacoKeys = ["F", "H", "A", "D", "L"];

	if (!mod) return false;

	// Let Monaco handle these when in editor
	return monacoKeys.includes(e.key.toUpperCase());
}

/**
 * Hook to enable global keyboard shortcuts
 */
export function useKeyboardShortcuts() {
	useEffect(() => {
		const shortcuts: Record<string, () => void> = {
			// File menu
			"Mod+N": () => menuActions.file.new(),
			"Mod+O": () => menuActions.file.open(),
			"Mod+S": () => menuActions.file.save(),
			"Mod+Shift+S": () => menuActions.file.saveAs(),

			// Edit menu - AI ASSISTANT (most important)
			"Mod+K": () => menuActions.edit.aiAssist(),

			// Code menu
			// NOTE: Cmd+Enter, Cmd+Shift+Enter handled by EditorPanel's Monaco shortcuts
			// to avoid conflicts and ensure proper cell execution with metadata
			Esc: () => menuActions.code.interrupt(),
			"Mod+Shift+0": () => menuActions.code.restartSession(),
			"Mod+/": () => menuActions.code.comment(),

			// Session menu
			"Mod+T": () => menuActions.session.showTimeline(),
			"Mod+Shift+N": () => menuActions.session.new(),
			"Mod+,": () => menuActions.session.settings(),

			// Terminal shortcuts
			"Mod+Backquote": () => menuActions.view.focusTerminal(),
			"Mod+Shift+T": () => menuActions.view.newTerminalSession(),

			// View menu
			"Mod+Shift+E": () => menuActions.view.togglePane("files"),
			"Mod+1": () => menuActions.view.togglePane("editor"),
			"Mod+2": () => menuActions.view.togglePane("assistant"),
			"Mod++": () => menuActions.view.zoomIn(),
			"Mod+=": () => menuActions.view.zoomIn(), // Also handle = key (no shift)
			"Mod+-": () => menuActions.view.zoomOut(),
			"Mod+0": () => menuActions.view.zoomReset(),
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			// Skip if user is typing in input/textarea (except AI panel)
			const target = e.target as HTMLElement;
			const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
			const isContentEditable = target.isContentEditable;

			// Allow Cmd+K even in inputs (to open AI assistant)
			const isAIShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";

			if ((isInput || isContentEditable) && !isAIShortcut) {
				return; // Don't intercept typing
			}

			// Skip if Monaco editor should handle it
			const inEditor = target.closest(".monaco-editor");
			if (inEditor && isMonacoHandled(e) && !isAIShortcut) {
				return; // Let Monaco handle it
			}

			// Skip browser shortcuts
			const shortcut = eventToShortcut(e);
			const browserShortcuts = ["Mod+R", "Mod+W", "Mod+Q"];
			if (browserShortcuts.includes(shortcut)) {
				return; // Let browser handle
			}

			const action = shortcuts[shortcut];

			if (action) {
				e.preventDefault();
				e.stopPropagation();
				action();
			}
		};

		document.addEventListener("keydown", handleKeyDown, { capture: true });

		return () => {
			document.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, []);
}
