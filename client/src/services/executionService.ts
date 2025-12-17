import type {
	ExecutionEventPayload,
	ExecutionRequestPayload,
	ExecutionResultPayload,
} from "@shared/types";
import type { ServerMessage } from "shared";
import { executionMessages } from "@/services/messageBuilders";
import { socketService } from "./socket";

export class ExecutionServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutionServiceError";
	}
}

/**
 * Dispatch an execution request to the backend.
 * The store will be updated via run_* websocket events; no response is awaited here.
 */
export async function executeRequest(request: ExecutionRequestPayload): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const didSend = socketService.send(executionMessages.execute(request));

		if (!didSend) {
			reject(new ExecutionServiceError("WebSocket is not connected"));
			return;
		}
		resolve();
	});
}

export interface ExecuteResponse {
	raw: Extract<ServerMessage, { type: "execution_result" }>;
	result: ExecutionResultPayload;
	event: ExecutionEventPayload;
}

/**
 * Legacy execution helper that awaits the execution_result response.
 * Prefer `executeRequest` for normal console runs so UI can rely on run_* events.
 */
export async function executeRequestAwaitResult(
	request: ExecutionRequestPayload,
): Promise<ExecuteResponse> {
	return new Promise<ExecuteResponse>((resolve, reject) => {
		const matcher = (message: ServerMessage): boolean =>
			message.type === "execution_result" || message.type === "error";

		const didSend = socketService.send(
			executionMessages.execute(request),
			(message) => {
				if (message.type === "execution_result") {
					resolve({
						raw: message,
						result: message.result,
						event: message.event,
					});
					return;
				}

				if (message.type === "error") {
					reject(new ExecutionServiceError(message.message));
					return;
				}

				reject(new ExecutionServiceError(`Unexpected execution response: ${message.type}`));
			},
			matcher,
		);

		if (!didSend) {
			reject(new ExecutionServiceError("WebSocket is not connected"));
		}
	});
}
