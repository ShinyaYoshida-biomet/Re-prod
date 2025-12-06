import type { ClientMessage, ExtractServerMessage, ServerMessage, ServerMessageType } from "shared";

export type WSRequest = ClientMessage;
export type WSResponse = ServerMessage;

type MessageHandler = (response: ServerMessage) => void;
type OneShotHandler = {
	handler: MessageHandler;
	matcher?: (message: ServerMessage) => boolean;
};

type ConnectionStatus = "connected" | "disconnected" | "error";

class SocketService {
	private ws: WebSocket | null = null;
	// Event handlers keyed by response.type (e.g., 'ai_response').
	private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
	// One-shot handlers for request/response style calls with optional matchers.
	private oneShotHandlers: OneShotHandler[] = [];
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
				console.error("Failed to parse WebSocket message:", e);
			}
		};

		this.ws.onerror = (error) => {
			console.error("WebSocket error:", error);
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
		matcher?: (message: ServerMessage) => boolean,
	): boolean {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.error("WebSocket is not connected");
			return false;
		}

		if (handler) {
			this.oneShotHandlers.push({ handler, matcher });
		}

		this.ws.send(JSON.stringify(request));
		return true;
	}

	on(event: ServerMessageType | "*", handler: MessageHandler): () => void {
		const existing = this.messageHandlers.get(event) ?? new Set<MessageHandler>();
		existing.add(handler);
		this.messageHandlers.set(event, existing);
		return () => this.off(event, handler);
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
		timeoutMs = 10000,
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

			const handler = (message: ServerMessage): void => {
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

	private dispatch(type: string, message: ServerMessage): void {
		const handlers = this.messageHandlers.get(type);
		handlers?.forEach((handler) => {
			try {
				handler(message);
			} catch (error) {
				console.error("WebSocket handler threw an error", error);
			}
		});
	}

	private consumeOneShot(message: ServerMessage): void {
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
		} catch (error) {
			console.error("WebSocket one-shot handler threw an error", error);
		}
	}

	private notifyConnection(status: ConnectionStatus): void {
		this.connectionListeners.forEach((listener) => {
			try {
				listener(status);
			} catch (error) {
				console.error("WebSocket connection listener threw an error", error);
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
		}, 2000);

		if (
			this.reconnectTimer &&
			typeof (this.reconnectTimer as unknown as { unref?: () => void }).unref === "function"
		) {
			(this.reconnectTimer as unknown as { unref: () => void }).unref();
		}
	}
}

export const socketService = new SocketService();
