import type { ExecutionRequestPayload, RunOutputChunk, RunSummary } from "@/types";
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

export interface RunCompletion {
	runId: string;
	stdout: string;
	stderr: string;
	run: RunSummary;
}

export async function executeRequestAwaitRunCompletion(
	request: ExecutionRequestPayload,
): Promise<RunCompletion> {
	const accepted = await socketService.request(executionMessages.execute(request), "run_accepted");
	const runId = accepted.run_id;

	return new Promise<RunCompletion>((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const cleanup = (unsubscribers: Array<() => void>): void => {
			unsubscribers.forEach((off) => off());
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		const offOutput = socketService.on("run_output", (message) => {
			if (message.type !== "run_output") {
				return;
			}
			if (message.run_id !== runId) {
				return;
			}
			const chunk = message as RunOutputChunk;
			if (chunk.stream === "stdout") {
				stdout = [stdout, chunk.chunk].filter(Boolean).join("\n");
			} else {
				stderr = [stderr, chunk.chunk].filter(Boolean).join("\n");
			}
		});

		const offFinished = socketService.on("run_finished", (message) => {
			if (message.type !== "run_finished") {
				return;
			}
			if (message.run.run_id !== runId) {
				return;
			}
			cleanup([offOutput, offFinished]);
			resolve({ runId, stdout, stderr, run: message.run });
		});

		timeoutId = setTimeout(() => {
			cleanup([offOutput, offFinished]);
			reject(new ExecutionServiceError(`Timed out waiting for run ${runId}`));
		}, 30_000);
	});
}
