import { executionMessages } from "@/services/messageBuilders";
import type { ExecutionRequestPayload, RunOutputChunk, RunSummary } from "@/types";
import type { DataTransport } from "./core/DataTransport";

export class ExecutionRepository {
	constructor(private readonly transport: DataTransport) {}

	execute(request: ExecutionRequestPayload): void {
		this.transport.send(executionMessages.execute(request));
	}

	async interrupt(): Promise<boolean> {
		const response = await this.transport.request(
			executionMessages.interrupt(),
			"execution_interrupted",
		);
		return response.success;
	}

	async restartSession(): Promise<void> {
		await this.transport.request(executionMessages.restart(), "session_restarted");
	}

	async executeAndAwait(
		request: ExecutionRequestPayload,
		timeoutMs = 30_000,
	): Promise<{
		runId: string;
		stdout: string;
		stderr: string;
		run: RunSummary;
	}> {
		const accepted = await this.transport.request(
			executionMessages.execute(request),
			"run_accepted",
		);
		const runId = accepted.run_id;

		return new Promise((resolve, reject) => {
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

			const offOutput = this.transport.on("run_output", (message) => {
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

			const offFinished = this.transport.on("run_finished", (message) => {
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
				reject(new Error(`Timed out waiting for run ${runId}`));
			}, timeoutMs);
		});
	}
}
