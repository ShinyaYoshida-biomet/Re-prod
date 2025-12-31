/**
 * Clamps a number between minimum and maximum values
 * @param value - The number to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value
 *
 * @example
 * clamp(5, 1, 10)   // returns 5
 * clamp(-5, 1, 10)  // returns 1
 * clamp(15, 1, 10)  // returns 10
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
