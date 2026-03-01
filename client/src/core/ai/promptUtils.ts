/**
 * Set of code change actions that should be applied to remote files
 * rather than the current editor buffer
 */
export const REMOTE_FILE_ACTIONS = new Set(["create-file", "delete-range", "replace-range"]);

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
