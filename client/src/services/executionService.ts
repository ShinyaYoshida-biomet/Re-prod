import type { ExecutionRequestPayload, ExecutionResultPayload } from "@shared/types";
import type { ServerMessage } from "shared";
import { socketService } from "./socket";

type ExecutionSuccessMessage = Extract<ServerMessage, { type: "execution_result" }>;

const executionMatcher = (message: ServerMessage): boolean =>
	message.type === "execution_result" || message.type === "error";

export class ExecutionServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutionServiceError";
	}
}

export interface ExecuteResponse {
	raw: ExecutionSuccessMessage;
	result: ExecutionResultPayload;
}

/**
 * Dispatch an execution request to the backend and resolve with the resulting
 * payload. All socket coordination lives here so UI layers do not have to
 * wire callbacks manually.
 */
export async function executeRequest(request: ExecutionRequestPayload): Promise<ExecuteResponse> {
	return new Promise<ExecuteResponse>((resolve, reject) => {
		const didSend = socketService.send(
			{ type: "execute", request },
			(message) => {
				if (message.type === "execution_result") {
					resolve({ raw: message, result: message.result });
					return;
				}

				if (message.type === "error") {
					reject(new ExecutionServiceError(message.message));
					return;
				}

				reject(new ExecutionServiceError(`Unexpected execution response: ${message.type}`));
			},
			executionMatcher,
		);

		if (!didSend) {
			reject(new ExecutionServiceError("WebSocket is not connected"));
		}
	});
}
