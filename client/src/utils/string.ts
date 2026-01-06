/**
 * Checks if a string is empty or contains only whitespace
 * @param value - The string to check (can be null or undefined)
 * @returns true if the string is null, undefined, empty, or contains only whitespace
 */
export function isEmptyString(value: string | null | undefined): value is null | undefined | "" {
	return !value || value.trim().length === 0;
}

/**
 * Type guard to check if a value is a string
 * @param value - The value to check
 * @returns true if the value is a string
 */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * Safely extracts a string value with a fallback default
 * @param value - The value to extract from
 * @param defaultValue - Fallback if value is not a string
 */
export function asString(value: unknown, defaultValue = ""): string {
	return typeof value === "string" ? value : defaultValue;
}

/**
 * Safely extracts an optional string value
 * @param value - The value to extract from
 */
export function asOptionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
