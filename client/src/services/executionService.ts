import type { ExecutionRequestPayload, RunSummary } from "@/types";
import type { DataTransport } from "@/repositories/core/DataTransport";
import { ExecutionRepository } from "@/repositories/ExecutionRepository";
import { WebSocketTransport } from "@/repositories/core/WebSocketTransport";
import { socketService } from "./socket";

export class ExecutionServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutionServiceError";
	}
}

function toExecutionServiceError(e: unknown, fallbackMessage: string): ExecutionServiceError {
	const message = e instanceof Error ? e.message : fallbackMessage;
	return new ExecutionServiceError(message);
}

export function createExecutionService(transport: DataTransport): {
	executeRequest: (request: ExecutionRequestPayload) => Promise<void>;
	executeRequestAwaitRunCompletion: (request: ExecutionRequestPayload) => Promise<RunCompletion>;
	interruptExecution: () => Promise<boolean>;
	restartSession: () => Promise<void>;
} {
	const repository = new ExecutionRepository(transport);

	return {
		async executeRequest(request: ExecutionRequestPayload): Promise<void> {
			try {
				repository.execute(request);
			} catch (e) {
				throw toExecutionServiceError(e, "Execution request failed");
			}
		},

		async executeRequestAwaitRunCompletion(
			request: ExecutionRequestPayload,
		): Promise<RunCompletion> {
			try {
				return await repository.executeAndAwait(request);
			} catch (e) {
				throw toExecutionServiceError(e, "Execution failed");
			}
		},

		async interruptExecution(): Promise<boolean> {
			try {
				return await repository.interrupt();
			} catch (e) {
				throw toExecutionServiceError(e, "Failed to interrupt execution");
			}
		},

		async restartSession(): Promise<void> {
			try {
				await repository.restartSession();
			} catch (e) {
				throw toExecutionServiceError(e, "Failed to restart session");
			}
		},
	};
}

/**
 * Dispatch an execution request to the backend.
 * The store will be updated via run_* websocket events; no response is awaited here.
 */
export async function executeRequest(request: ExecutionRequestPayload): Promise<void> {
	return defaultService.executeRequest(request);
}

export interface RunCompletion {
	runId: string;
	stdout: string;
	stderr: string;
	run: RunSummary;
}

export async function executeRequestAwaitRunCompletion(
	request: ExecutionRequestPayload,
): Promise<RunCompletion> {
	return defaultService.executeRequestAwaitRunCompletion(request);
}

export async function interruptExecution(): Promise<boolean> {
	return defaultService.interruptExecution();
}

export async function restartSession(): Promise<void> {
	return defaultService.restartSession();
}

const defaultService = createExecutionService(new WebSocketTransport(socketService));
