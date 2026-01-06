/**
 * Diff format markers used in unified diff parsing
 */

/** Marker for removed lines in diff format */
export const DIFF_MARKER_REMOVE = "-";

/** Marker for added lines in diff format */
export const DIFF_MARKER_ADD = "+";

/** Marker for context (unchanged) lines in diff format */
export const DIFF_MARKER_CONTEXT = " ";

/** Marker for file header in diff format */
export const DIFF_MARKER_FILE_OLD = "---";

/** Marker for file header in diff format */
export const DIFF_MARKER_FILE_NEW = "+++";

/** Marker for hunk header in diff format */
export const DIFF_MARKER_HUNK = "@@";

/**
 * Helper to check if a line is a removal
 */
export function isDiffRemoval(line: string): boolean {
	return line.startsWith(DIFF_MARKER_REMOVE) && !line.startsWith(DIFF_MARKER_FILE_OLD);
}

/**
 * Helper to check if a line is an addition
 */
export function isDiffAddition(line: string): boolean {
	return line.startsWith(DIFF_MARKER_ADD) && !line.startsWith(DIFF_MARKER_FILE_NEW);
}

/**
 * Helper to check if a line is context
 */
export function isDiffContext(line: string): boolean {
	return line.startsWith(DIFF_MARKER_CONTEXT);
}
