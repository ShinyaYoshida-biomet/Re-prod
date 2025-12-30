/**
 * Timeout Constants
 *
 * Centralized timeout values used throughout the application.
 * All values are in milliseconds unless otherwise noted.
 */

/**
 * UI Feedback Timeouts
 */

/** Duration to show test status (success/failed) before resetting to idle (3 seconds) */
export const TEST_STATUS_RESET_DELAY = 3000;

/** Duration to show "Copied" feedback after copying code to clipboard (1.2 seconds) */
export const COPY_FEEDBACK_DURATION = 1200;

/**
 * Network & WebSocket Timeouts
 */

/** Default timeout for WebSocket request/response operations (10 seconds) */
export const WEBSOCKET_REQUEST_TIMEOUT = 10000;

/** Delay before attempting to reconnect WebSocket after connection loss (2 seconds) */
export const WEBSOCKET_RECONNECT_DELAY = 2000;
