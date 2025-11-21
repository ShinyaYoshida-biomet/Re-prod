import { useCallback, useEffect, useRef, useState } from 'react';
import { spawn, type Pty } from '@tauri-apps/plugin-pty';
import type { TerminalState } from '@/types/terminal';

const isTauriAvailable =
  typeof window !== 'undefined' &&
  Boolean(
    (window as typeof window & {
      __TAURI__?: unknown;
      __TAURI_IPC__?: unknown;
      __TAURI_INTERNALS__?: unknown;
    }).__TAURI__ ||
      (window as typeof window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__ ||
      (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );

interface UseTerminalResult {
  state: TerminalState;
  isAvailable: boolean;
  error: string | null;
  errorDetail: string | null;
  createSession: () => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  writeToSession: (sessionId: string, data: string) => Promise<void>;
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>;
  registerOutputHandler: (sessionId: string, handler: (chunk: string) => void) => void;
  unregisterOutputHandler: (sessionId: string) => void;
}

export function useTerminal(): UseTerminalResult {
  const [state, setState] = useState<TerminalState>({
    sessions: [],
    activeSessionId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const handlersRef = useRef(new Map<string, (chunk: string) => void>());
  const sessionCounterRef = useRef(1);
  const processesRef = useRef(new Map<string, Pty>());

  const addSession = useCallback((sessionId: string, title: string) => {
    setState((prev) => ({
      sessions: [
        ...prev.sessions.map((session) => ({ ...session, isActive: false })),
        { id: sessionId, title, isActive: true },
      ],
      activeSessionId: sessionId,
    }));
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setState((prev) => {
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
    setState((prev) => ({
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
      const pty = await spawn('bash', [], { cols: 80, rows: 24 });
      const sessionId = pty.id ?? `pty-${Date.now()}`;
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

      pty.onExit(({ code }: { code: number }) => {
        console.info(`Terminal session ${sessionId} exited with code ${code}`);
        removeSession(sessionId);
        processesRef.current.delete(sessionId);
      });
    } catch (error) {
      console.error('Unable to create terminal session:', error);
      setError('Unable to start terminal session. Please restart the desktop app.');
      setErrorDetail(error instanceof Error ? error.message : String(error));
    }
  }, [addSession, removeSession]);

  const closeSession = useCallback(
    async (sessionId: string) => {
      const pty = processesRef.current.get(sessionId);
      if (pty) {
        try {
          await pty.kill();
        } catch (error) {
          console.error('Unable to close terminal session:', error);
        }
      }

      removeSession(sessionId);
      processesRef.current.delete(sessionId);
    },
    [removeSession]
  );

  const writeToSession = useCallback(
    async (sessionId: string, data: string) => {
      if (!isTauriAvailable) {
        return;
      }

      const pty = processesRef.current.get(sessionId);
      if (!pty) {
        setError('Terminal session not found.');
        return;
      }

      try {
        await pty.write(data);
      } catch (error) {
        console.error('Unable to write to terminal session:', error);
        setError('Failed to send input to terminal.');
        setErrorDetail(error instanceof Error ? error.message : String(error));
      }
    },
    []
  );

  const resizeSession = useCallback(
    async (sessionId: string, cols: number, rows: number) => {
      if (!isTauriAvailable) {
        return;
      }

      const pty = processesRef.current.get(sessionId);
      if (!pty) {
        return;
      }

      try {
        await pty.resize(cols, rows);
      } catch (error) {
        console.error('Unable to resize terminal session:', error);
      }
    },
    []
  );

  const registerOutputHandler = useCallback((sessionId: string, handler: (chunk: string) => void) => {
    handlersRef.current.set(sessionId, handler);
  }, []);

  const unregisterOutputHandler = useCallback((sessionId: string) => {
    handlersRef.current.delete(sessionId);
  }, []);

  useEffect(() => {
    return () => {
      processesRef.current.forEach((pty) => {
        void pty.kill();
      });
      processesRef.current.clear();
    };
  }, []);

  return {
    state,
    isAvailable: isTauriAvailable,
    error,
    errorDetail,
    createSession,
    closeSession,
    setActiveSession,
    writeToSession,
    resizeSession,
    registerOutputHandler,
    unregisterOutputHandler,
  };
}
