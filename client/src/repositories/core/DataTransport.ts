import type { ClientMessage, ExtractServerMessage, ServerMessage, ServerMessageType } from "shared";

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

	request<TType extends ServerMessageType>(
		payload: ClientMessage,
		responseType: TType,
		options?: {
			matcher?: (message: ExtractServerMessage<TType>) => boolean;
			timeoutMs?: number;
		},
	): Promise<ExtractServerMessage<TType>>;

	on<TType extends ServerMessageType | "*">(
		type: TType,
		handler: (message: TType extends "*" ? ServerMessage : ExtractServerMessage<TType>) => void,
	): () => void;
}
