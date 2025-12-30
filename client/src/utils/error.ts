/**
 * Safely extracts error message from unknown error type
 *
 * This utility function provides a consistent way to extract error messages
 * from caught errors, which may or may not be Error instances.
 *
 * @param error - The caught error (type unknown)
 * @param fallback - Fallback message if error is not an Error instance
 * @returns Error message string
 *
 * @example
 * ```typescript
 * try {
 *   riskyOperation();
 * } catch (error) {
 *   const message = getErrorMessage(error, "Operation failed");
 *   console.error(message);
 * }
 * ```
 */
export function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}
