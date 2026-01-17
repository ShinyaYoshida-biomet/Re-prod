import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import type { ExecutionLogEntry, RunOutputChunk, RunSummary } from "@/types";
import { createExecutionSlice, type ExecutionState } from "../executionSlice";

const createMockRunSummary = (overrides?: Partial<RunSummary>): RunSummary => ({
	run_id: "run-123",
	code: "x <- 1:10\nprint(x)",
	status: "succeeded",
	started_at_ms: Date.now(),
	duration_ms: 42,
	error: null,
	plots: [],
	...overrides,
});

const createMockLogEntry = (overrides?: Partial<ExecutionLogEntry>): ExecutionLogEntry => ({
	runId: "run-123",
	code: "x <- 1:10",
	stdout: "[1]  1  2  3  4  5  6  7  8  9 10",
	stderr: "",
	plots: [],
	timestamp: Date.now(),
	duration: 42,
	success: true,
	pending: false,
	...overrides,
});

const createMockOutputChunk = (overrides?: Partial<RunOutputChunk>): RunOutputChunk => ({
	run_id: "run-123",
	stream: "stdout",
	chunk: "output text",
	...overrides,
});

describe("executionSlice", () => {
	let store: ReturnType<typeof create<ExecutionState>>;

	beforeEach(() => {
		store = create<ExecutionState>()(createExecutionSlice);
	});

	describe("initial state", () => {
		it("should have correct initial state", () => {
			const state = store.getState();

			expect(state.execution.isRunning).toBe(false);
			expect(state.execution.results).toEqual([]);
			expect(state.execution.history).toEqual([]);
			expect(state.execution.currentCell).toBeUndefined();
			expect(state.execution.lastError).toBeNull();
		});
	});

	describe("setIsRunning", () => {
		it("should set isRunning to true", () => {
			store.getState().setIsRunning(true);

			const state = store.getState();
			expect(state.execution.isRunning).toBe(true);
		});

		it("should set isRunning to false", () => {
			store.getState().setIsRunning(true);
			store.getState().setIsRunning(false);

			const state = store.getState();
			expect(state.execution.isRunning).toBe(false);
		});
	});

	describe("setExecutionError", () => {
		it("should set error message", () => {
			store.getState().setExecutionError("Test error");

			const state = store.getState();
			expect(state.execution.lastError).toBe("Test error");
		});

		it("should clear error message", () => {
			store.getState().setExecutionError("Error");
			store.getState().setExecutionError(null);

			const state = store.getState();
			expect(state.execution.lastError).toBeNull();
		});
	});

	describe("appendExecutionEntry", () => {
		it("should append entry to results and history", () => {
			const entry = createMockLogEntry();

			store.getState().appendExecutionEntry(entry);

			const state = store.getState();
			expect(state.execution.results).toHaveLength(1);
			expect(state.execution.history).toHaveLength(1);
			expect(state.execution.results[0]).toEqual({ ...entry, pending: false });
		});

		it("should set pending to false if not provided", () => {
			const entry = createMockLogEntry();
			delete (entry as any).pending;

			store.getState().appendExecutionEntry(entry);

			const state = store.getState();
			expect(state.execution.results[0].pending).toBe(false);
		});

		it("should preserve pending: true if provided", () => {
			const entry = createMockLogEntry({ pending: true });

			store.getState().appendExecutionEntry(entry);

			const state = store.getState();
			expect(state.execution.results[0].pending).toBe(true);
		});

		it("should limit results to last 10 entries", () => {
			for (let i = 0; i < 15; i++) {
				store.getState().appendExecutionEntry(createMockLogEntry({ runId: `run-${i}` }));
			}

			const state = store.getState();
			expect(state.execution.results).toHaveLength(10);
			expect(state.execution.history).toHaveLength(15);
		});

		it("should keep last 10 entries in results", () => {
			for (let i = 0; i < 15; i++) {
				store.getState().appendExecutionEntry(createMockLogEntry({ runId: `run-${i}` }));
			}

			const state = store.getState();
			expect(state.execution.results[0].runId).toBe("run-5");
			expect(state.execution.results[9].runId).toBe("run-14");
		});
	});

	describe("applyRunState", () => {
		it("should normalize run summaries to log entries", () => {
			const runs = [
				createMockRunSummary({ run_id: "run-1", code: "code1" }),
				createMockRunSummary({ run_id: "run-2", code: "code2" }),
			];

			store.getState().applyRunState(runs);

			const state = store.getState();
			expect(state.execution.results).toHaveLength(2);
			expect(state.execution.results[0].runId).toBe("run-1");
			expect(state.execution.results[1].runId).toBe("run-2");
		});

		it("should merge with existing entries preserving stdout/stderr", () => {
			// Add entry with output
			store.getState().appendExecutionEntry(
				createMockLogEntry({
					runId: "run-1",
					stdout: "existing stdout",
					stderr: "existing stderr",
				}),
			);

			// Apply run state with same run_id but no output
			const runs = [createMockRunSummary({ run_id: "run-1", code: "updated code" })];
			store.getState().applyRunState(runs);

			const state = store.getState();
			expect(state.execution.results[0].stdout).toBe("existing stdout");
			expect(state.execution.results[0].stderr).toBe("existing stderr");
		});

		it("should preserve existing plots if new run has none", () => {
			const existingPlots = [
				{
					id: "plot-1",
					path: "/tmp/plot1.png",
					storagePath: "/tmp/plot1.png",
					data: "data:image/png;base64,abc",
					timestamp: Date.now(),
					width: null,
					height: null,
					code: null,
				},
			];

			store.getState().appendExecutionEntry(
				createMockLogEntry({
					runId: "run-1",
					plots: existingPlots,
				}),
			);

			const runs = [createMockRunSummary({ run_id: "run-1", plots: [] })];
			store.getState().applyRunState(runs);

			const state = store.getState();
			expect(state.execution.results[0].plots).toEqual(existingPlots);
		});

		it("should replace plots if new run has plots", () => {
			store.getState().appendExecutionEntry(
				createMockLogEntry({
					runId: "run-1",
					plots: [],
				}),
			);

			const newPlots = [
				{
					id: "plot-1",
					index: 0,
					filename: "plot1.png",
					storage_path: "/tmp/plot1.png",
					base64_data: "data:image/png;base64,newdata",
					timestamp: Date.now(),
					width: 400,
					height: 300,
					code: "plot(1:10)",
				},
			];

			const runs = [createMockRunSummary({ run_id: "run-1", plots: newPlots })];
			store.getState().applyRunState(runs);

			const state = store.getState();
			expect(state.execution.results[0].plots).toHaveLength(1);
			expect(state.execution.results[0].plots[0].id).toBe("plot-1");
		});

		it("should limit results to last 10 entries", () => {
			const runs = Array.from({ length: 15 }, (_, i) =>
				createMockRunSummary({ run_id: `run-${i}` }),
			);

			store.getState().applyRunState(runs);

			const state = store.getState();
			expect(state.execution.results).toHaveLength(10);
			expect(state.execution.history).toHaveLength(15);
		});
	});

	describe("applyRunStarted", () => {
		it("should add new run entry", () => {
			const run = createMockRunSummary({ run_id: "run-1", status: "running" });

			store.getState().applyRunStarted(run);

			const state = store.getState();
			expect(state.execution.results).toHaveLength(1);
			expect(state.execution.results[0].runId).toBe("run-1");
			expect(state.execution.results[0].pending).toBe(true);
		});

		it("should mark running status as pending", () => {
			const run = createMockRunSummary({ status: "running" });

			store.getState().applyRunStarted(run);

			const state = store.getState();
			expect(state.execution.results[0].pending).toBe(true);
			expect(state.execution.results[0].success).toBe(false);
		});

		it("should update existing run entry", () => {
			store.getState().appendExecutionEntry(
				createMockLogEntry({
					runId: "run-1",
					stdout: "old output",
				}),
			);

			const run = createMockRunSummary({ run_id: "run-1", status: "running" });
			store.getState().applyRunStarted(run);

			const state = store.getState();
			expect(state.execution.results).toHaveLength(1);
			expect(state.execution.results[0].runId).toBe("run-1");
		});
	});

	describe("applyRunOutput", () => {
		beforeEach(() => {
			const run = createMockRunSummary({ run_id: "run-1" });
			store.getState().applyRunStarted(run);
		});

		it("should append stdout chunk", () => {
			const chunk = createMockOutputChunk({
				run_id: "run-1",
				stream: "stdout",
				chunk: "line 1",
			});

			store.getState().applyRunOutput(chunk);

			const state = store.getState();
			expect(state.execution.results[0].stdout).toContain("line 1");
		});

		it("should append multiple stdout chunks with newlines", () => {
			store
				.getState()
				.applyRunOutput(
					createMockOutputChunk({ run_id: "run-1", stream: "stdout", chunk: "line 1" }),
				);
			store
				.getState()
				.applyRunOutput(
					createMockOutputChunk({ run_id: "run-1", stream: "stdout", chunk: "line 2" }),
				);

			const state = store.getState();
			expect(state.execution.results[0].stdout).toBe("line 1\nline 2");
		});

		it("should append stderr chunk", () => {
			const chunk = createMockOutputChunk({
				run_id: "run-1",
				stream: "stderr",
				chunk: "Error message",
			});

			store.getState().applyRunOutput(chunk);

			const state = store.getState();
			expect(state.execution.results[0].stderr).toContain("Error message");
		});

		it("should handle interleaved stdout and stderr", () => {
			store
				.getState()
				.applyRunOutput(
					createMockOutputChunk({ run_id: "run-1", stream: "stdout", chunk: "output" }),
				);
			store
				.getState()
				.applyRunOutput(
					createMockOutputChunk({ run_id: "run-1", stream: "stderr", chunk: "error" }),
				);
			store
				.getState()
				.applyRunOutput(
					createMockOutputChunk({ run_id: "run-1", stream: "stdout", chunk: "more output" }),
				);

			const state = store.getState();
			expect(state.execution.results[0].stdout).toBe("output\nmore output");
			expect(state.execution.results[0].stderr).toBe("error");
		});

		it("should ignore chunks for non-existent run", () => {
			const chunk = createMockOutputChunk({ run_id: "non-existent", chunk: "text" });

			store.getState().applyRunOutput(chunk);

			const state = store.getState();
			// Should not crash or create new entry
			expect(state.execution.results[0].runId).toBe("run-1");
			expect(state.execution.results[0].stdout).not.toContain("text");
		});

		it("should update both results and history", () => {
			const chunk = createMockOutputChunk({ run_id: "run-1", chunk: "output" });

			store.getState().applyRunOutput(chunk);

			const state = store.getState();
			expect(state.execution.results[0].stdout).toContain("output");
			expect(state.execution.history[0].stdout).toContain("output");
		});
	});

	describe("applyRunFinished", () => {
		beforeEach(() => {
			const run = createMockRunSummary({ run_id: "run-1", status: "running" });
			store.getState().applyRunStarted(run);
			store.getState().applyRunOutput(createMockOutputChunk({ run_id: "run-1", chunk: "output" }));
		});

		it("should mark run as completed", () => {
			const run = createMockRunSummary({ run_id: "run-1", status: "succeeded" });

			store.getState().applyRunFinished(run);

			const state = store.getState();
			expect(state.execution.results[0].success).toBe(true);
			expect(state.execution.results[0].pending).toBe(false);
		});

		it("should preserve existing stdout", () => {
			const run = createMockRunSummary({ run_id: "run-1", status: "succeeded" });

			store.getState().applyRunFinished(run);

			const state = store.getState();
			expect(state.execution.results[0].stdout).toBe("output");
		});

		it("should append error message to stderr", () => {
			const run = createMockRunSummary({
				run_id: "run-1",
				status: "failed",
				error: "Runtime error",
			});

			store.getState().applyRunFinished(run);

			const state = store.getState();
			expect(state.execution.results[0].stderr).toContain("Runtime error");
			expect(state.execution.results[0].success).toBe(false);
		});

		it("should handle error with existing stderr", () => {
			store
				.getState()
				.applyRunOutput(
					createMockOutputChunk({ run_id: "run-1", stream: "stderr", chunk: "Warning" }),
				);

			const run = createMockRunSummary({
				run_id: "run-1",
				status: "failed",
				error: "Fatal error",
			});

			store.getState().applyRunFinished(run);

			const state = store.getState();
			expect(state.execution.results[0].stderr).toBe("Warning\nFatal error");
		});

		it("should update plots", () => {
			const plots = [
				{
					id: "plot-1",
					index: 0,
					filename: "plot.png",
					storage_path: "/tmp/plot.png",
					base64_data: "data:image/png;base64,abc",
					timestamp: Date.now(),
					width: 400,
					height: 300,
					code: null,
				},
			];

			const run = createMockRunSummary({ run_id: "run-1", status: "succeeded", plots });

			store.getState().applyRunFinished(run);

			const state = store.getState();
			expect(state.execution.results[0].plots).toHaveLength(1);
		});
	});

	describe("clearExecutionResults", () => {
		it("should clear results but preserve history", () => {
			store.getState().appendExecutionEntry(createMockLogEntry({ runId: "run-1" }));
			store.getState().appendExecutionEntry(createMockLogEntry({ runId: "run-2" }));

			store.getState().clearExecutionResults();

			const state = store.getState();
			expect(state.execution.results).toEqual([]);
			expect(state.execution.history).toHaveLength(2);
		});
	});

	describe("setCurrentCell", () => {
		it("should set current cell index", () => {
			store.getState().setCurrentCell(5);

			const state = store.getState();
			expect(state.execution.currentCell).toBe(5);
		});

		it("should clear current cell", () => {
			store.getState().setCurrentCell(5);
			store.getState().setCurrentCell(undefined);

			const state = store.getState();
			expect(state.execution.currentCell).toBeUndefined();
		});
	});

	describe("resetExecutionState", () => {
		it("should reset to initial state", () => {
			// Populate state
			store.getState().setIsRunning(true);
			store.getState().setExecutionError("Error");
			store.getState().appendExecutionEntry(createMockLogEntry());
			store.getState().setCurrentCell(5);

			// Reset
			store.getState().resetExecutionState();

			const state = store.getState();
			expect(state.execution.isRunning).toBe(false);
			expect(state.execution.lastError).toBeNull();
			expect(state.execution.results).toEqual([]);
			expect(state.execution.history).toEqual([]);
			expect(state.execution.currentCell).toBeUndefined();
		});
	});
});
