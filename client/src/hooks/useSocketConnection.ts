import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Defines the structure for a generic WebSocket message.
 * Components or services using this hook should adhere to this type
 * for sending and receiving data.
 */
export interface SocketMessage<T = unknown> {
  type: string; // A string identifier for the message's purpose (e.g., 'R_EXECUTION_RESULT', 'AI_CHAT_MESSAGE')
  payload: T;   // The actual data content of the message
  id?: string;  // Optional: A unique identifier for correlating requests/responses
}

/**
 * Configuration options for the `useSocketConnection` hook.
 */
interface UseSocketConnectionOptions {
  url: string; // The WebSocket server URL to connect to.
  autoConnect?: boolean; // If true, connect automatically on mount. Defaults to true.
  reconnectAttempts?: number; // Maximum number of reconnection attempts. Defaults to 5.
  reconnectIntervalMs?: number; // Delay between reconnection attempts in milliseconds. Defaults to 3000ms.
  // Add any other socket.io-client options here as needed, e.g., `query`, `auth`, `forceNew`.
}

/**
 * The return interface for the `useSocketConnection` hook, exposing its public API.
 */
interface UseSocketConnectionReturn {
  isConnected: boolean; // True if the WebSocket is currently connected.
  isConnecting: boolean; // True if the WebSocket is attempting to connect or reconnect.
  error: Error | null; // Any error that occurred during connection or reconnection.
  send: (message: SocketMessage) => void; // Function to send a message over the WebSocket.
  /**
   * Registers a callback function to handle incoming messages of a specific type.
   * @param type The 'type' string of the `SocketMessage` to listen for.
   * @param handler The callback function that receives the message's `payload`.
   * @returns A cleanup function to unregister the handler. Call this in a `useEffect` cleanup
   *          or when the handler is no longer needed to prevent memory leaks.
   */
  on: <T>(type: string, handler: (payload: T) => void) => () => void;
  disconnect: () => void; // Function to manually disconnect the WebSocket.
}

/**
 * A generic React hook for managing a Socket.IO WebSocket connection.
 * It provides robust connection lifecycle management, including auto-connection,
 * reconnection logic, and state tracking (connected, connecting, error).
 * It offers a standardized interface for sending messages and registering
 * type-specific handlers for incoming messages.
 *
 * This hook centralizes and standardizes WebSocket logic, enabling multiple components
 * and services to reuse it, reducing duplication and improving maintainability.
 *
 * @param options Configuration for the WebSocket connection (URL, auto-connect, reconnect settings).
 * @returns An object containing connection status, error, send function, handler registration function, and a disconnect function.
 */
export function useSocketConnection(options: UseSocketConnectionOptions): UseSocketConnectionReturn {
  const {
    url,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectIntervalMs = 3000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messageHandlers = useRef(new Map<string, Set<Function>>());

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
      console.log('[useSocketConnection] WebSocket disconnected.');
    }
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.connected || socketRef.current.connecting)) {
      return;
    }

    // Disconnect any existing socket before creating a new one
    if (socketRef.current) {
      disconnect();
    }

    setIsConnecting(true);
    setError(null);

    const newSocket = io(url, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: reconnectAttempts,
      reconnectionDelay: reconnectIntervalMs,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      console.log(`[useSocketConnection] Socket connected to ${url}`);
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      setIsConnecting(false);
      console.log(`[useSocketConnection] Socket disconnected: ${reason}`);
    });

    newSocket.on('connect_error', (err) => {
      console.error(`[useSocketConnection] Connection error: ${err.message}`);
      setError(err);
      setIsConnected(false);
      setIsConnecting(false);
    });

    newSocket.on('message', (message: SocketMessage) => {
      if (message && typeof message === 'object' && message.type) {
        const handlers = messageHandlers.current.get(message.type);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(message.payload);
            } catch (e) {
              console.error(`[useSocketConnection] Error in handler for type '${message.type}':`, e);
            }
          });
        }
      } else {
        console.warn('[useSocketConnection] Received malformed message:', message);
      }
    });

    newSocket.connect();
  }, [url, reconnectAttempts, reconnectIntervalMs, disconnect]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  const send = useCallback((message: SocketMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', message);
    } else {
      console.warn('[useSocketConnection] Cannot send message, socket not connected.', message);
    }
  }, []);

  const on = useCallback(<T>(type: string, handler: (payload: T) => void) => {
    const handlers = messageHandlers.current.get(type) || new Set<Function>();
    handlers.add(handler);
    messageHandlers.current.set(type, handlers);

    return () => {
      const currentHandlers = messageHandlers.current.get(type);
      if (currentHandlers) {
        currentHandlers.delete(handler);
        if (currentHandlers.size === 0) {
          messageHandlers.current.delete(type);
        }
      }
    };
  }, []);

  return { isConnected, isConnecting, error, send, on, disconnect };
}