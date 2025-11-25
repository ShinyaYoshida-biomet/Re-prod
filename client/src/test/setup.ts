import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import { socketService } from "@/services/socket";

// Extend Vitest matchers with jest-dom matchers
expect.extend(matchers);

// Mock WebSocket globally to prevent actual connections in tests
globalThis.WebSocket = vi.fn().mockImplementation(() => ({
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	close: vi.fn(),
	send: vi.fn(),
	readyState: 3, // CLOSED
})) as unknown as typeof WebSocket;

// Polyfill timer.unref() for jsdom environment
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
	const id = originalSetTimeout(handler, timeout, ...args);
	// Add unref() method if it doesn't exist
	if (typeof id === "object" || typeof id === "number") {
		const timer = id as ReturnType<typeof setTimeout> & { unref?: () => void };
		if (!timer.unref) {
			timer.unref = () => timer;
		}
	}
	return id;
}) as typeof setTimeout;

// Disable auto reconnect during tests to avoid background timers
socketService.disableAutoReconnect();

// Cleanup after each test case
afterEach(() => {
	cleanup();
	// Disconnect socket to clear any timers/handlers
	socketService.disconnect();
});
