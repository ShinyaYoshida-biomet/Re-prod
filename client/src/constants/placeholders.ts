/**
 * Placeholder patterns used to detect invalid or placeholder file paths
 * in AI code actions.
 *
 * These patterns indicate that a file path is a placeholder and should not
 * be treated as a valid file path.
 */
export const EDITOR_BUFFER_PLACEHOLDER_PATTERNS = [
	"<current editor buffer>",
	"current editor buffer",
	"current_editor_buffer",
] as const;
