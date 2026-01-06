import { describe, expect, it, vi } from "vitest";
import type { DataTransport } from "@/repositories/core/DataTransport";
import { TransportError } from "@/repositories/core/DataTransport";
import type { ExecutionRequestPayload, RunSummary } from "@/types";
import { createExecutionService, ExecutionServiceError } from "../executionService";

function createMockTransport(): DataTransport {
	return {
		send: vi.fn(),
		request: vi.fn(),
		on: vi.fn(),
	};
}

describe("executionService", () => {
	it("awaits run_accepted then resolves on matching run_finished", async () => {
		const transport = createMockTransport();
		const service = createExecutionService(transport);

		const request = {
			code: "print('Hello')",
			context: {
				source: "selection",
				document_path: null,
				cell_index: null,
				triggered_at_ms: 1,
				actor: "user",
			},
			blocks: [],
		} satisfies ExecutionRequestPayload;

		const runId = "run-1";
		const run: RunSummary = {
			run_id: runId,
			status: "succeeded",
			started_at_ms: 1,
			finished_at_ms: 2,
			duration_ms: 1,
			code: request.code,
			has_stdout: true,
			has_stderr: false,
			artifacts: null,
			plots: null,
			error: null,
		};

		vi.mocked(transport.request).mockResolvedValueOnce({ type: "run_accepted", run_id: runId });

		const handlers = new Map<string, (msg: any) => void>();
		vi.mocked(transport.on).mockImplementation((event, handler) => {
			handlers.set(event as string, handler as (msg: any) => void);
			return () => handlers.delete(event as string);
		});

		const promise = service.executeRequestAwaitRunCompletion(request);

		await Promise.resolve();

		handlers.get("run_output")?.({
			type: "run_output",
			run_id: runId,
			stream: "stdout",
			chunk: '[1] "Hello"',
			at_ms: 1,
		});
		handlers.get("run_finished")?.({ type: "run_finished", run });

		const completion = await promise;
		expect(completion.runId).toBe(runId);
		expect(completion.stdout).toContain("Hello");
		expect(completion.stderr).toBe("");
		expect(completion.run.status).toBe("succeeded");
	});

	it("wraps transport send errors as ExecutionServiceError", async () => {
		const transport = createMockTransport();
		const service = createExecutionService(transport);

		vi.mocked(transport.send).mockImplementation(() => {
			throw new TransportError("WebSocket is not connected");
		});

		await expect(service.executeRequest({} as ExecutionRequestPayload)).rejects.toBeInstanceOf(
			ExecutionServiceError,
		);
	});
});
