import { WEBSOCKET_RECONNECT_DELAY, WEBSOCKET_REQUEST_TIMEOUT } from "@/constants/timeouts";
import type { ExtractServerMessage, ServerMessageType, WSRequest, WSResponse } from "@/types";

type MessageHandler<T extends WSResponse = WSResponse> = (response: T) => void;
type OneShotHandler = {
	id: string;
	handler: MessageHandler;
	matcher?: (message: WSResponse) => boolean;
};

type ConnectionStatus = "connected" | "disconnected" | "error";

class SocketService {
	private ws: WebSocket | null = null;
	// Event handlers keyed by response.type (e.g., 'ai_response').
	private messageHandlers: Map<string, Set<MessageHandler<any>>> = new Map();
	// One-shot handlers for request/response style calls with optional matchers.
	private oneShotHandlers: OneShotHandler[] = [];
	private nextOneShotId = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private autoReconnectEnabled = true;
	private intentionalDisconnect = false;
	private url: string = "";
	private port = 3001;
	private connectionListeners: Set<(status: ConnectionStatus) => void> = new Set();

	setPort(port: number): void {
		this.port = port;
	}

	connect(url?: string): void {
		// Prevent duplicate connections
		if (this.ws) {
			if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
				return;
			}
		}

		this.intentionalDisconnect = false;
		const target = url ?? `ws://127.0.0.1:${this.port}/ws`;
		this.url = target;
		this.ws = new WebSocket(target);

		this.ws.onopen = () => {
			this.clearReconnectTimer();
			this.notifyConnection("connected");
		};

		this.ws.onmessage = (event) => {
			try {
				const response: WSResponse = JSON.parse(event.data);
				// Deliver to type-specific handler
				this.dispatch(response.type, response);
				// Wildcard handler (optional)
				this.dispatch("*", response);
				// Deliver to one-shot handler matching this message
				this.consumeOneShot(response);
			} catch (e) {
				// Intentionally ignored: Malformed WebSocket messages are ignored to prevent
				// service disruption. The connection remains open and will process valid messages.
			}
		};

		this.ws.onerror = () => {
			this.notifyConnection("error");
		};

		this.ws.onclose = () => {
			if (this.intentionalDisconnect) {
				this.intentionalDisconnect = false;
				return;
			}

			this.notifyConnection("disconnected");
			this.scheduleReconnect();
		};
	}

	send(
		request: WSRequest,
		handler?: MessageHandler,
		matcher?: (message: WSResponse) => boolean,
	): boolean {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return false;
		}

		if (handler) {
			this.oneShotHandlers.push({ id: `oneshot-${this.nextOneShotId++}`, handler, matcher });
		}

		return this.sendPayload(request);
	}

	on<TType extends ServerMessageType>(
		event: TType | "*",
		handler: (message: ExtractServerMessage<TType>) => void,
	): () => void {
		const existing = this.messageHandlers.get(event) ?? new Set<MessageHandler<any>>();
		existing.add(handler as MessageHandler<any>);
		this.messageHandlers.set(event, existing);
		return () => this.off(event, handler as MessageHandler<any>);
	}

	off(event: ServerMessageType | "*", handler?: MessageHandler): void {
		if (!handler) {
			this.messageHandlers.delete(event);
			return;
		}

		const existing = this.messageHandlers.get(event);
		if (!existing) return;

		existing.delete(handler);
		if (existing.size === 0) {
			this.messageHandlers.delete(event);
		}
	}

	disconnect(): void {
		this.intentionalDisconnect = true;
		this.clearReconnectTimer();
		if (this.ws) {
			if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
				this.ws.close(1000, "Client disconnecting");
			}
			this.ws = null;
		}
		this.messageHandlers.clear();
		this.oneShotHandlers = [];
		this.notifyConnection("disconnected");
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	disableAutoReconnect(): void {
		this.autoReconnectEnabled = false;
		this.clearReconnectTimer();
	}

	enableAutoReconnect(): void {
		this.autoReconnectEnabled = true;
	}

	onConnectionChange(listener: (status: ConnectionStatus) => void): () => void {
		this.connectionListeners.add(listener);
		return () => {
			this.connectionListeners.delete(listener);
		};
	}

	request<TType extends ServerMessageType>(
		payload: WSRequest,
		responseType: TType,
		matcher?: (message: ExtractServerMessage<TType>) => boolean,
		timeoutMs = WEBSOCKET_REQUEST_TIMEOUT,
	): Promise<ExtractServerMessage<TType>> {
		return new Promise((resolve, reject) => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				reject(new Error("WebSocket is not connected"));
				return;
			}

			let timeoutId: ReturnType<typeof setTimeout> | null = null;
			let unsubscribe: (() => void) | null = null;

			const cleanup = (): void => {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}
				if (unsubscribe) {
					unsubscribe();
					unsubscribe = null;
				}
			};

			const handler = (message: WSResponse): void => {
				if (message.type !== responseType) {
					return;
				}
				const typed = message as ExtractServerMessage<TType>;
				if (matcher && !matcher(typed)) {
					return;
				}
				cleanup();
				resolve(typed);
			};

			unsubscribe = this.on(responseType, handler);
			const didSend = this.send(payload);
			if (!didSend) {
				cleanup();
				reject(new Error("Failed to send WebSocket request"));
				return;
			}

			timeoutId = setTimeout(() => {
				cleanup();
				reject(new Error(`Timed out waiting for ${responseType}`));
			}, timeoutMs);
		});
	}

	sendAndWait<TMessage extends WSResponse>(
		payload: WSRequest,
		matcher: (message: WSResponse) => message is TMessage,
		timeoutMs = WEBSOCKET_REQUEST_TIMEOUT,
	): Promise<TMessage> {
		return new Promise((resolve, reject) => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				reject(new Error("WebSocket is not connected"));
				return;
			}

			let timeoutId: ReturnType<typeof setTimeout> | null = null;
			const oneShotId = `oneshot-${this.nextOneShotId++}`;

			const cleanup = (): void => {
				if (timeoutId) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}
				this.oneShotHandlers = this.oneShotHandlers.filter((h) => h.id !== oneShotId);
			};

			this.oneShotHandlers.push({
				id: oneShotId,
				handler: (message) => {
					if (!matcher(message)) {
						reject(new Error("Unexpected response"));
						return;
					}
					cleanup();
					resolve(message);
				},
				matcher,
			});

			const didSend = this.sendPayload(payload);

			if (!didSend) {
				cleanup();
				reject(new Error("Failed to send WebSocket request"));
				return;
			}

			timeoutId = setTimeout(() => {
				cleanup();
				reject(new Error("WebSocket request timed out"));
			}, timeoutMs);
		});
	}

	private sendPayload(request: WSRequest): boolean {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return false;
		}
		this.ws.send(JSON.stringify(request));
		return true;
	}

	private dispatch(type: string, message: WSResponse): void {
		const handlers = this.messageHandlers.get(type);
		handlers?.forEach((handler) => {
			try {
				handler(message);
			} catch {
				// Intentionally ignored: Individual handler errors should not prevent other
				// handlers from processing the message. Faulty handlers are isolated.
			}
		});
	}

	private consumeOneShot(message: WSResponse): void {
		if (this.oneShotHandlers.length === 0) return;

		const index = this.oneShotHandlers.findIndex(({ matcher }) =>
			matcher ? matcher(message) : true,
		);

		if (index === -1) {
			return;
		}

		const [{ handler }] = this.oneShotHandlers.splice(index, 1);
		try {
			handler(message);
		} catch {
			// Intentionally ignored: One-shot handler errors are isolated to prevent
			// disruption of the WebSocket service. The handler is consumed and removed.
		}
	}

	private notifyConnection(status: ConnectionStatus): void {
		this.connectionListeners.forEach((listener) => {
			try {
				listener(status);
			} catch {
				// Intentionally ignored: Individual listener errors should not prevent other
				// listeners from being notified. Faulty listeners are isolated.
			}
		});
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private scheduleReconnect(): void {
		if (!this.autoReconnectEnabled) {
			return;
		}

		this.clearReconnectTimer();
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect(this.url);
		}, WEBSOCKET_RECONNECT_DELAY);

		if (
			this.reconnectTimer &&
			typeof (this.reconnectTimer as unknown as { unref?: () => void }).unref === "function"
		) {
			(this.reconnectTimer as unknown as { unref: () => void }).unref();
		}
	}
}

export const socketService = new SocketService();
