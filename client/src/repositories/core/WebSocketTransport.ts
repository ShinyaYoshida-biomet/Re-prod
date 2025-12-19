import type { ExtractServerMessage, ServerMessage, ServerMessageType } from "shared";
import type { socketService } from "@/services/socket";
import { RemoteError, TransportError, type DataTransport } from "./DataTransport";

type SocketService = typeof socketService;

export class WebSocketTransport implements DataTransport {
	constructor(private readonly socket: SocketService) {}

	send(payload: Parameters<SocketService["send"]>[0]): void {
		const didSend = this.socket.send(payload);
		if (!didSend) {
			throw new TransportError("WebSocket is not connected");
		}
	}

	on<TType extends ServerMessageType | "*">(
		type: TType,
		handler: (message: TType extends "*" ? ServerMessage : ExtractServerMessage<TType>) => void,
	): () => void {
		return this.socket.on(type, handler as never);
	}

	async request<TType extends ServerMessageType>(
		payload: Parameters<SocketService["send"]>[0],
		responseType: TType,
		options?: {
			matcher?: (message: ExtractServerMessage<TType>) => boolean;
			timeoutMs?: number;
		},
	): Promise<ExtractServerMessage<TType>> {
		const response = await this.socket.sendAndWait(
			payload,
			(message): message is ExtractServerMessage<TType> | ExtractServerMessage<"error"> => {
				if (message.type === "error") {
					return true;
				}
				if (message.type !== responseType) {
					return false;
				}
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

		return response;
	}
}
