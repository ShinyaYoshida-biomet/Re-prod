/**
 * UI-related constants for Re-prod application
 *
 * This file contains magic numbers and default values used across the UI,
 * extracted from hardcoded values for better maintainability and documentation.
 */

/**
 * Timing constants for UI interactions
 */
export const UI_TIMING = {
	/**
	 * Delay before focusing AI input after panel activation
	 * Allows time for DOM updates and transitions to complete
	 */
	AI_INPUT_FOCUS_DELAY_MS: 100,
} as const;

/**
 * Default filenames for new/untitled files
 */
export const DEFAULT_FILENAMES = {
	/**
	 * Default filename when saving a new R script without a previous name
	 */
	UNTITLED_R_SCRIPT: "untitled.R",

	/**
	 * Default filename for a newly created R analysis script
	 */
	NEW_R_SCRIPT: "analysis.R",
} as const;

/**
 * Zoom level adjustment constants
 */
export const ZOOM = {
	/**
	 * Increment/decrement step for zoom operations (10% per step)
	 */
	STEP: 0.1,
} as const;

/**
 * Test connection status states for LLM provider configuration
 */
export const TestStatus = {
	IDLE: "idle",
	TESTING: "testing",
	SUCCESS: "success",
	FAILED: "failed",
} as const;

export type TestStatus = (typeof TestStatus)[keyof typeof TestStatus];
