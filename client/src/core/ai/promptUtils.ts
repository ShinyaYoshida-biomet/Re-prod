import type { ExecutionLogEntry } from "@/types";
import { formatDateTime } from "@/utils/time";

/**
 * Set of code change actions that should be applied to remote files
 * rather than the current editor buffer
 */
export const REMOTE_FILE_ACTIONS = new Set(["create-file", "delete-range", "replace-range"]);

export const CONSOLE_CONTEXT_LIMITS = {
	maxItems: 3,
	maxSnippetLength: 800,
	maxLines: 20,
} as const;

const {
	maxItems: MAX_CONSOLE_ITEMS,
	maxSnippetLength: MAX_CONSOLE_SNIPPET_LENGTH,
	maxLines: MAX_CONSOLE_LINES,
} = CONSOLE_CONTEXT_LIMITS;

const truncateLines = (value: string, maxLines: number): string => {
	const lines = value.split(/\r?\n/);
	if (lines.length <= maxLines) {
		return value;
	}
	return lines.slice(-maxLines).join("\n");
};

const truncateText = (value: string, maxLength: number): string =>
	value.length > maxLength ? `${value.slice(0, maxLength)}... (truncated)` : value;

const formatConsoleEntry = (entry: ExecutionLogEntry): string => {
	const lines = [
		`- [${formatDateTime(entry.timestamp)}] ${entry.success ? "success" : "error"} in ${entry.duration}ms`,
	];

	if (entry.stdout?.trim()) {
		const trimmed = truncateLines(entry.stdout.trim(), MAX_CONSOLE_LINES);
		lines.push(`stdout: ${truncateText(trimmed, MAX_CONSOLE_SNIPPET_LENGTH)}`);
	}

	if (entry.stderr?.trim()) {
		const trimmed = truncateLines(entry.stderr.trim(), MAX_CONSOLE_LINES);
		lines.push(`stderr: ${truncateText(trimmed, MAX_CONSOLE_SNIPPET_LENGTH)}`);
	}

	if (entry.plots.length > 0) {
		const plotPaths = entry.plots.map((plot) => plot.path).filter(Boolean);
		const suffix = plotPaths.length ? ` (${plotPaths.slice(0, 3).join(", ")})` : "";
		lines.push(`plots: ${entry.plots.length}${suffix}`);
	}

	return lines.join("\n");
};

const buildConsoleContext = (history: ExecutionLogEntry[] = []): string => {
	if (history.length === 0) {
		return "";
	}

	const recent = history.slice(-MAX_CONSOLE_ITEMS).reverse();
	const formatted = recent.map(formatConsoleEntry).join("\n\n");
	return `Recent console output (newest first, truncated):\n${formatted}\n\n`;
};

/**
 * Builds a prompt string that includes the current file context
 * and the user's input
 */
export const buildPromptWithContext = (
	filepath: string,
	editorContent: string,
	userInput: string,
	consoleHistory: ExecutionLogEntry[] = [],
): string => {
	const fileLabel = filepath || "current editor buffer";
	const consoleContext = buildConsoleContext(consoleHistory);
	return `${consoleContext}Current file (${fileLabel}):\n\n\`\`\`r\n${editorContent}\n\`\`\`\n\n${userInput}`;
};

/**
 * Creates a unique request ID for tracking AI requests
 * Uses crypto.randomUUID if available, otherwise falls back to timestamp-based ID
 */
export const createRequestId = (): string => {
	if (
		typeof globalThis.crypto !== "undefined" &&
		typeof globalThis.crypto.randomUUID === "function"
	) {
		return globalThis.crypto.randomUUID();
	}
	return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
