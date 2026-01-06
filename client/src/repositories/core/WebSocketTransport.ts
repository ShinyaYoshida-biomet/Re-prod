import type { socketService } from "@/services/socket";
import type { ExtractServerMessage, ServerMessage, ServerMessageType } from "@/types";
import { type DataTransport, RemoteError, TransportError } from "./DataTransport";

type SocketService = typeof socketService;

export class WebSocketTransport implements DataTransport {
	constructor(private readonly socket: SocketService) {}

	send(payload: Parameters<SocketService["send"]>[0]): void {
		const didSend = this.socket.send(payload);
		if (!didSend) {
			throw new TransportError("WebSocket is not connected");
		}
	}

	on(type: "*", handler: (message: ServerMessage) => void): () => void;
	on<TType extends ServerMessageType>(
		type: TType,
		handler: (message: ExtractServerMessage<TType>) => void,
	): () => void;
	on(type: ServerMessageType | "*", handler: (message: ServerMessage) => void): () => void {
		return this.socket.on(type, handler as never);
	}

	async request<TType extends Exclude<ServerMessageType, "error">>(
		payload: Parameters<SocketService["send"]>[0],
		responseType: TType,
		options?: {
			matcher?: (message: ExtractServerMessage<TType>) => boolean;
			timeoutMs?: number;
		},
	): Promise<ExtractServerMessage<TType>> {
		const response = await this.socket.sendAndWait<ServerMessage>(
			payload,
			(message): message is ServerMessage => {
				if (message.type === "error") return true;
				if (message.type !== responseType) return false;
				const typed = message as ExtractServerMessage<TType>;
				return options?.matcher ? options.matcher(typed) : true;
			},
			options?.timeoutMs,
		);

		if (response.type === "error") {
			throw new RemoteError(response.message);
		}

		if (response.type !== responseType) {
			throw new TransportError(
				`Unexpected response: expected ${responseType}, got ${response.type}`,
			);
		}

		return response as ExtractServerMessage<TType>;
	}
}
