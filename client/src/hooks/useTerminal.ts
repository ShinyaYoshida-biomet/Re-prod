import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalState } from "@/types/terminal";
import { getErrorMessage } from "@/utils/error";

const isTauriAvailable =
	typeof window !== "undefined" &&
	Boolean(
		(
			window as typeof window & {
				__TAURI__?: unknown;
				__TAURI_IPC__?: unknown;
				__TAURI_INTERNALS__?: unknown;
			}
		).__TAURI__ ||
			(window as typeof window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__ ||
			(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
	);

interface UseTerminalState {
	terminalState: TerminalState;
	isAvailable: boolean;
	error: string | null;
	errorDetail: string | null;
}

interface UseTerminalActions {
	createSession: () => Promise<void>;
	closeSession: (sessionId: string) => Promise<void>;
	setActiveSession: (sessionId: string) => void;
	writeToSession: (sessionId: string, data: string) => Promise<void>;
	resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>;
	registerOutputHandler: (sessionId: string, handler: (chunk: string) => void) => void;
	unregisterOutputHandler: (sessionId: string) => void;
}

interface UseTerminalResult {
	state: UseTerminalState;
	actions: UseTerminalActions;
}

export function useTerminal(): UseTerminalResult {
	const [terminalState, setTerminalState] = useState<TerminalState>({
		sessions: [],
		activeSessionId: null,
	});
	const [error, setError] = useState<string | null>(null);
	const [errorDetail, setErrorDetail] = useState<string | null>(null);
	const handlersRef = useRef(new Map<string, (chunk: string) => void>());
	const sessionCounterRef = useRef(1);
	const processesRef = useRef(new Map<string, SimplePty>());

	const addSession = useCallback((sessionId: string, title: string) => {
		setTerminalState((prev) => ({
			sessions: [
				...prev.sessions.map((session) => ({ ...session, isActive: false })),
				{ id: sessionId, title, isActive: true },
			],
			activeSessionId: sessionId,
		}));
	}, []);

	const removeSession = useCallback((sessionId: string) => {
		setTerminalState((prev) => {
			const sessions = prev.sessions.filter((session) => session.id !== sessionId);
			const nextActive =
				prev.activeSessionId === sessionId
					? sessions.length > 0
						? sessions[sessions.length - 1].id
						: null
					: prev.activeSessionId;
			const normalizedSessions = sessions.map((session) => ({
				...session,
				isActive: session.id === nextActive,
			}));
			return {
				sessions: normalizedSessions,
				activeSessionId: nextActive,
			};
		});

		handlersRef.current.delete(sessionId);
	}, []);

	const setActiveSession = useCallback((sessionId: string) => {
		setTerminalState((prev) => ({
			sessions: prev.sessions.map((session) => ({
				...session,
				isActive: session.id === sessionId,
			})),
			activeSessionId: sessionId,
		}));
	}, []);

	const createSession = useCallback(async () => {
		if (!isTauriAvailable) {
			return;
		}

		try {
			const pty = new SimplePty("bash", [], { cols: 80, rows: 24 });
			const sessionId = `pty-${Date.now()}`;
			const label = `Shell ${sessionCounterRef.current}`;
			sessionCounterRef.current += 1;
			setError(null);
			setErrorDetail(null);
			addSession(sessionId, label);
			processesRef.current.set(sessionId, pty);

			pty.onData((data: string) => {
				const handler = handlersRef.current.get(sessionId);
				if (handler) {
					handler(data);
				}
			});

			pty.onExit(() => {
				removeSession(sessionId);
				processesRef.current.delete(sessionId);
			});
		} catch (error) {
			setError("Unable to start terminal session. Please restart the desktop app.");
			setErrorDetail(getErrorMessage(error, String(error)));
		}
	}, [addSession, removeSession]);

	const closeSession = useCallback(
		async (sessionId: string) => {
			const pty = processesRef.current.get(sessionId);
			if (pty) {
				try {
					await pty.kill();
				} catch (error) {}
			}

			removeSession(sessionId);
			processesRef.current.delete(sessionId);
		},
		[removeSession],
	);

	const writeToSession = useCallback(async (sessionId: string, data: string) => {
		if (!isTauriAvailable) {
			return;
		}

		const pty = processesRef.current.get(sessionId);
		if (!pty) {
			setError("Terminal session not found.");
			return;
		}

		try {
			await pty.write(data);
		} catch (error) {
			setError("Failed to send input to terminal.");
			setErrorDetail(getErrorMessage(error, String(error)));
		}
	}, []);

	const resizeSession = useCallback(async (sessionId: string, cols: number, rows: number) => {
		if (!isTauriAvailable) {
			return;
		}

		const pty = processesRef.current.get(sessionId);
		if (!pty) {
			return;
		}

		try {
			await pty.resize(cols, rows);
		} catch (error) {}
	}, []);

	const registerOutputHandler = useCallback(
		(sessionId: string, handler: (chunk: string) => void) => {
			handlersRef.current.set(sessionId, handler);
		},
		[],
	);

	const unregisterOutputHandler = useCallback((sessionId: string) => {
		handlersRef.current.delete(sessionId);
	}, []);

	// Do not eagerly kill PTYs on unmount to avoid StrictMode double-invocation killing live sessions.
	useEffect(() => {}, []);

	return {
		state: {
			terminalState,
			isAvailable: isTauriAvailable,
			error,
			errorDetail,
		},
		actions: {
			createSession,
			closeSession,
			setActiveSession,
			writeToSession,
			resizeSession,
			registerOutputHandler,
			unregisterOutputHandler,
		},
	};
}

type DataHandler = (chunk: string) => void;
type ExitHandler = (code: number) => void;

class SimplePty {
	pid: number | null = null;
	private exited = false;
	private init: Promise<void>;
	private onDataHandlers: DataHandler[] = [];
	private onExitHandlers: ExitHandler[] = [];

	constructor(file: string, args: string[], opts: { cols?: number; rows?: number; cwd?: string }) {
		const invokeArgs = {
			file,
			args,
			termName: "Terminal",
			cols: opts.cols ?? null,
			rows: opts.rows ?? null,
			cwd: opts.cwd ?? null,
			env: {},
			encoding: null,
			handleFlowControl: null,
			flowControlPause: null,
			flowControlResume: null,
		};

		this.init = invoke<number>("plugin:pty|spawn", invokeArgs).then((pid) => {
			this.pid = pid;
			this.readLoop();
			this.waitLoop();
		});
	}

	onData(handler: DataHandler): () => void {
		this.onDataHandlers.push(handler);
		return () => {
			this.onDataHandlers = this.onDataHandlers.filter((h) => h !== handler);
		};
	}

	onExit(handler: ExitHandler): () => void {
		this.onExitHandlers.push(handler);
		return () => {
			this.onExitHandlers = this.onExitHandlers.filter((h) => h !== handler);
		};
	}

	async write(data: string): Promise<void> {
		await this.init;
		if (this.pid == null) return;
		await invoke("plugin:pty|write", { pid: this.pid, data });
	}

	async resize(cols: number, rows: number): Promise<void> {
		await this.init;
		if (this.pid == null) return;
		await invoke("plugin:pty|resize", { pid: this.pid, cols, rows });
	}

	async kill(): Promise<void> {
		await this.init;
		if (this.pid == null) return;
		this.exited = true;
		await invoke("plugin:pty|kill", { pid: this.pid });
	}

	private async readLoop(): Promise<void> {
		await this.init;
		if (this.pid == null) return;
		try {
			for (;;) {
				const data = await invoke<string>("plugin:pty|read", { pid: this.pid });
				this.onDataHandlers.forEach((h) => h(data));
			}
		} catch (e: any) {
			if (typeof e === "string" && e.includes("EOF")) {
				return;
			}
		}
	}

	private async waitLoop(): Promise<void> {
		await this.init;
		if (this.pid == null || this.exited) return;
		try {
			const code = await invoke<number>("plugin:pty|exitstatus", {
				pid: this.pid,
			});
			this.exited = true;
			this.onExitHandlers.forEach((h) => h(code));
		} catch (e) {}
	}
}
