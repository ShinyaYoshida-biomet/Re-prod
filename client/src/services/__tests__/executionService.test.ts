import type { ExecutionRequestPayload, RunSummary } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { socketService } from "../socket";
import { executeRequestAwaitRunCompletion } from "../executionService";

vi.mock("../socket", () => ({
	socketService: {
		request: vi.fn(),
		on: vi.fn(),
		send: vi.fn(),
	},
}));

describe("executionService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("awaits run_accepted then resolves on matching run_finished", async () => {
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

		vi.mocked(socketService.request).mockResolvedValue({ type: "run_accepted", run_id: runId });

		const handlers = new Map<string, (msg: any) => void>();
		vi.mocked(socketService.on).mockImplementation((event, handler) => {
			handlers.set(event as string, handler);
			return () => handlers.delete(event as string);
		});

		const promise = executeRequestAwaitRunCompletion(request);

		await new Promise((resolve) => setTimeout(resolve, 0));

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
});
