/**
 * Checks if a string is empty or contains only whitespace
 * @param value - The string to check (can be null or undefined)
 * @returns true if the string is null, undefined, empty, or contains only whitespace
 */
export function isEmptyString(value: string | null | undefined): value is null | undefined | "" {
	return !value || value.trim().length === 0;
}
