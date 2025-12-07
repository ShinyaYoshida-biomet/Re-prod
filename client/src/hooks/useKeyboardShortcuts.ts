import { useEffect } from "react";
import { commandRegistry } from "@/core/commands/registry";

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
		// Initial shortcuts from registry
		const shortcuts: Record<string, () => void> = {};

		// View menu - Extra mappings not in registry yet (or ensure they are)
		// "Mod+=": () => commandRegistry.execute("view.zoomIn"), // Moved to registry in view.ts if I update it?
		// view.ts has "Mod++". "Mod+=" is often same key. Let's add it here explicitly or update view.ts.
		shortcuts["Mod+="] = () => commandRegistry.execute("view.zoomIn");

		// Register commands from registry
		const registeredCommands = commandRegistry.getAll();
		registeredCommands.forEach((cmd) => {
			if (cmd.keybinding) {
				shortcuts[cmd.keybinding] = () => commandRegistry.execute(cmd.id);
			}
		});

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
