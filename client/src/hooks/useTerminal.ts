import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type {
  TerminalErrorEvent,
  TerminalExitEvent,
  TerminalKeepAliveEvent,
  TerminalOutputEvent,
  TerminalState,
} from '@/types/terminal';

const TERMINAL_OUTPUT_EVENT = 'terminal-output';
const TERMINAL_EXIT_EVENT = 'terminal-exited';
const TERMINAL_ERROR_EVENT = 'terminal-error';
const TERMINAL_KEEPALIVE_EVENT = 'terminal-keepalive';

const isTauriAvailable = typeof window !== 'undefined' && Boolean((window as typeof window & { __TAURI__?: unknown }).__TAURI__);

interface UseTerminalResult {
  state: TerminalState;
  isAvailable: boolean;
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
  const handlersRef = useRef(new Map<string, (chunk: string) => void>());
  const sessionCounterRef = useRef(1);

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
      const sessionId = await invoke<string>('create_terminal_session');
      const label = `Shell ${sessionCounterRef.current}`;
      sessionCounterRef.current += 1;
      addSession(sessionId, label);
    } catch (error) {
      console.error('Unable to create terminal session:', error);
    }
  }, [addSession]);

  const closeSession = useCallback(
    async (sessionId: string) => {
      if (isTauriAvailable) {
        try {
          await invoke('close_terminal_session', { sessionId });
        } catch (error) {
          console.error('Unable to close terminal session:', error);
        }
      }

      removeSession(sessionId);
    },
    [removeSession]
  );

  const writeToSession = useCallback(
    async (sessionId: string, data: string) => {
      if (!isTauriAvailable) {
        return;
      }

      try {
        await invoke('write_to_terminal', { session_id: sessionId, data });
      } catch (error) {
        console.error('Unable to write to terminal session:', error);
      }
    },
    []
  );

  const resizeSession = useCallback(
    async (sessionId: string, cols: number, rows: number) => {
      if (!isTauriAvailable) {
        return;
      }

      try {
        await invoke('resize_terminal', { session_id: sessionId, cols, rows });
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
    if (!isTauriAvailable) {
      return;
    }

    const unlistenFns: UnlistenFn[] = [];

    const subscribe = async () => {
      try {
        unlistenFns.push(
          await listen<TerminalOutputEvent>(TERMINAL_OUTPUT_EVENT, (evt) => {
            const handler = handlersRef.current.get(evt.payload.session_id);
            if (handler) {
              handler(evt.payload.data);
            }
          })
        );
      } catch (error) {
        console.error('Unable to listen for terminal output:', error);
      }

      try {
        unlistenFns.push(
          await listen<TerminalExitEvent>(TERMINAL_EXIT_EVENT, (evt) => {
            if (evt.payload.session_id) {
              removeSession(evt.payload.session_id);
            }
          })
        );
      } catch (error) {
        console.error('Unable to listen for terminal exit events:', error);
      }

      try {
        unlistenFns.push(
          await listen<TerminalErrorEvent>(TERMINAL_ERROR_EVENT, (evt) => {
            console.error('Terminal session error:', evt.payload.message);
          })
        );
      } catch (error) {
        console.error('Unable to listen for terminal error events:', error);
      }

      try {
        unlistenFns.push(
          await listen<TerminalKeepAliveEvent>(TERMINAL_KEEPALIVE_EVENT, () => {
            // Keep-alive events are informational; no UI update required.
          })
        );
      } catch (error) {
        console.error('Unable to listen for terminal keep-alive events:', error);
      }
    };

    void subscribe();

    return () => {
      unlistenFns.forEach((unlisten) => void unlisten());
    };
  }, [removeSession]);

  return {
    state,
    isAvailable: isTauriAvailable,
    createSession,
    closeSession,
    setActiveSession,
    writeToSession,
    resizeSession,
    registerOutputHandler,
    unregisterOutputHandler,
  };
}
