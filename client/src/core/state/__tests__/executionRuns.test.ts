import { beforeEach, describe, expect, it } from "vitest";
import type { RunOutputChunk, RunSummary } from "@shared/types";
import { useStore } from "../store";

const baseRun = (overrides: Partial<RunSummary> = {}): RunSummary => ({
	run_id: "run-1",
	status: "running",
	started_at_ms: 10,
	finished_at_ms: null,
	duration_ms: null,
	code: "x <- 1",
	has_stdout: false,
	has_stderr: false,
	artifacts: null,
	plots: null,
	error: null,
	...overrides,
});

const resetStore = () => {
	useStore.setState({
		execution: {
			isRunning: false,
			results: [],
			history: [],
			currentCell: undefined,
		},
	});
};

describe("execution run handling", () => {
	beforeEach(() => {
		resetStore();
	});

	it("loads run_state into execution history", () => {
		const runs: RunSummary[] = [
			baseRun({ run_id: "r1", status: "running", started_at_ms: 1, code: "a <- 1" }),
			baseRun({
				run_id: "r2",
				status: "succeeded",
				started_at_ms: 2,
				finished_at_ms: 3,
				duration_ms: 1,
				code: "b <- 1",
			}),
		];

		useStore.getState().applyRunState(runs);

		const { results, history } = useStore.getState().execution;
		expect(results).toHaveLength(2);
		expect(history).toHaveLength(2);
		const r1 = results.find((r) => r.runId === "r1");
		const r2 = results.find((r) => r.runId === "r2");
		expect(r1?.pending).toBe(true);
		expect(r2?.success).toBe(true);
	});

	it("shows code immediately when run starts", () => {
		const run = baseRun({ run_id: "r-immediate", status: "running", code: "print('hi')" });

		useStore.getState().applyRunStarted(run);

		const entry = useStore.getState().execution.results.find((r) => r.runId === "r-immediate");
		expect(entry?.code).toBe("print('hi')");
		expect(entry?.pending).toBe(true);
	});

	it("appends stdout/stderr chunks to existing run", () => {
		useStore.getState().applyRunState([baseRun({ run_id: "r-stream", code: "cat('hi')" })]);

		const chunks: RunOutputChunk[] = [
			{ run_id: "r-stream", stream: "stdout", chunk: "line1", at_ms: 5 },
			{ run_id: "r-stream", stream: "stdout", chunk: "line2", at_ms: 6 },
			{ run_id: "r-stream", stream: "stderr", chunk: "err1", at_ms: 7 },
		];
		chunks.forEach((c) => useStore.getState().applyRunOutput(c));

		const entry = useStore.getState().execution.results.find((r) => r.runId === "r-stream");
		expect(entry?.stdout).toBe("line1\nline2");
		expect(entry?.stderr).toBe("err1");
		expect(entry?.pending).toBe(true);
	});

	it("updates run on finish with success flag and duration", () => {
		useStore
			.getState()
			.applyRunState([baseRun({ run_id: "r-finish", status: "running", code: "x <- 1" })]);

		useStore.getState().applyRunFinished(
			baseRun({
				run_id: "r-finish",
				status: "failed",
				finished_at_ms: 50,
				duration_ms: 5,
				error: "boom",
			}),
		);

		const entry = useStore.getState().execution.results.find((r) => r.runId === "r-finish");
		expect(entry?.success).toBe(false);
		expect(entry?.duration).toBe(5);
		expect(entry?.pending).toBe(false);
		expect(entry?.stderr).toContain("boom");
	});

	it("keeps streamed output when a run finishes", () => {
		useStore
			.getState()
			.applyRunStarted(baseRun({ run_id: "r-out", status: "running", code: "cat('hi')" }));

		useStore
			.getState()
			.applyRunOutput({ run_id: "r-out", stream: "stdout", chunk: "partial", at_ms: 1 });

		useStore.getState().applyRunFinished(
			baseRun({
				run_id: "r-out",
				status: "succeeded",
				finished_at_ms: 20,
				duration_ms: 20,
			}),
		);

		const entry = useStore.getState().execution.results.find((r) => r.runId === "r-out");
		expect(entry?.stdout).toContain("partial");
		expect(entry?.pending).toBe(false);
		expect(entry?.success).toBe(true);
	});
});
