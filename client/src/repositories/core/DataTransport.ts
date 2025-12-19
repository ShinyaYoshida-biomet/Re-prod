import type {
	ClientMessage,
	ExtractServerMessage,
	ServerMessage,
	ServerMessageType,
} from "@/types";

export class TransportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TransportError";
	}
}

export class RemoteError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RemoteError";
	}
}

export interface DataTransport {
	send(payload: ClientMessage): void;

	request<TType extends Exclude<ServerMessageType, "error">>(
		payload: ClientMessage,
		responseType: TType,
		options?: {
			matcher?: (message: ExtractServerMessage<TType>) => boolean;
			timeoutMs?: number;
		},
	): Promise<ExtractServerMessage<TType>>;

	on(type: "*", handler: (message: ServerMessage) => void): () => void;
	on<TType extends ServerMessageType>(
		type: TType,
		handler: (message: ExtractServerMessage<TType>) => void,
	): () => void;
}
