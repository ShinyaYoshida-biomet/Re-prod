import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

// Mock dependencies
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

describe("useTerminal", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		// Mock invoke implementations
		(invoke as any).mockImplementation((cmd: string) => {
			if (cmd === "plugin:pty|spawn") return Promise.resolve(123);
			if (cmd === "plugin:pty|read") return new Promise(() => {});
			if (cmd === "plugin:pty|exitstatus") return new Promise(() => {});
			return Promise.resolve();
		});
	});

	const loadHook = async (tauriAvailable: boolean) => {
		if (tauriAvailable) {
			(window as any).__TAURI__ = {};
		} else {
			delete (window as any).__TAURI__;
			delete (window as any).__TAURI_IPC__;
			delete (window as any).__TAURI_INTERNALS__;
		}

		// Re-import the hook to pick up the new window state
		const { useTerminal } = await import("../useTerminal");
		return useTerminal;
	};

	it("should initialize with default state", async () => {
		const useTerminal = await loadHook(true);
		const { result } = renderHook(() => useTerminal());

		expect(result.current.state.terminalState.sessions).toEqual([]);
		expect(result.current.state.terminalState.activeSessionId).toBeNull();
		expect(result.current.state.isAvailable).toBe(true);
	});

	it("should create session", async () => {
		const useTerminal = await loadHook(true);
		const { result } = renderHook(() => useTerminal());

		await act(async () => {
			await result.current.actions.createSession();
		});

		expect(result.current.state.terminalState.sessions).toHaveLength(1);
		expect(result.current.state.terminalState.activeSessionId).toBeTruthy();
		expect(invoke).toHaveBeenCalledWith("plugin:pty|spawn", expect.any(Object));
	});

	it("should set active session", async () => {
		const useTerminal = await loadHook(true);
		const { result } = renderHook(() => useTerminal());

		await act(async () => {
			await result.current.actions.createSession();
		});

		const sessionId = result.current.state.terminalState.activeSessionId;

		await act(async () => {
			await result.current.actions.createSession();
		});

		act(() => {
			result.current.actions.setActiveSession(sessionId!);
		});

		expect(result.current.state.terminalState.activeSessionId).toBe(sessionId);
	});

	it("should close session", async () => {
		const useTerminal = await loadHook(true);
		const { result } = renderHook(() => useTerminal());

		await act(async () => {
			await result.current.actions.createSession();
		});

		const sessionId = result.current.state.terminalState.activeSessionId!;

		await act(async () => {
			await result.current.actions.closeSession(sessionId);
		});

		expect(result.current.state.terminalState.sessions).toHaveLength(0);
		expect(invoke).toHaveBeenCalledWith("plugin:pty|kill", { pid: 123 });
	});

	it("should write to session", async () => {
		const useTerminal = await loadHook(true);
		const { result } = renderHook(() => useTerminal());

		await act(async () => {
			await result.current.actions.createSession();
		});

		const sessionId = result.current.state.terminalState.activeSessionId!;

		await act(async () => {
			await result.current.actions.writeToSession(sessionId, "ls\n");
		});

		expect(invoke).toHaveBeenCalledWith("plugin:pty|write", { pid: 123, data: "ls\n" });
	});

	it("should resize session", async () => {
		const useTerminal = await loadHook(true);
		const { result } = renderHook(() => useTerminal());

		await act(async () => {
			await result.current.actions.createSession();
		});

		const sessionId = result.current.state.terminalState.activeSessionId!;

		await act(async () => {
			await result.current.actions.resizeSession(sessionId, 100, 40);
		});

		expect(invoke).toHaveBeenCalledWith("plugin:pty|resize", { pid: 123, cols: 100, rows: 40 });
	});

	it("should handle missing Tauri availability", async () => {
		const useTerminal = await loadHook(false);
		const { result } = renderHook(() => useTerminal());

		expect(result.current.state.isAvailable).toBe(false);

		await act(async () => {
			await result.current.actions.createSession();
		});

		expect(result.current.state.terminalState.sessions).toHaveLength(0);
	});
});
