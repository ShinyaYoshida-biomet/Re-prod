import type { ExecutionLogEntry, PlotInfo, RunOutputChunk, RunSummary } from "@shared/types";
import type { StateCreator } from "zustand";

export interface ExecutionState {
	execution: {
		isRunning: boolean;
		results: ExecutionLogEntry[];
		history: ExecutionLogEntry[];
		currentCell: number | undefined;
	};
	setIsRunning: (isRunning: boolean) => void;
	appendExecutionEntry: (entry: ExecutionLogEntry) => void;
	applyRunState: (runs: RunSummary[]) => void;
	applyRunStarted: (run: RunSummary) => void;
	applyRunOutput: (chunk: RunOutputChunk) => void;
	applyRunFinished: (run: RunSummary) => void;
	clearExecutionResults: () => void;
	setCurrentCell: (cellIndex: number | undefined) => void;
	resetExecutionState: () => void;
	loadExecutionHistory: (history: ExecutionLogEntry[]) => void;
}

export const createExecutionSlice: StateCreator<ExecutionState> = (set) => ({
	execution: {
		isRunning: false,
		results: [],
		history: [],
		currentCell: undefined,
	},
	setIsRunning: (isRunning) =>
		set((state) => ({
			execution: { ...state.execution, isRunning },
		})),
	appendExecutionEntry: (entry) =>
		set((state) => {
			const next = { ...entry, pending: entry.pending ?? false };
			return {
				execution: {
					...state.execution,
					results: [...state.execution.results, next].slice(-10),
					history: [...state.execution.history, next],
				},
			};
		}),
	applyRunState: (runs) =>
		set((state) => {
			const normalized = runs.map((run) => {
				const base = runSummaryToLogEntry(run);
				const existing = state.execution.history.find((entry) => entry.runId === run.run_id);
				if (!existing) {
					return base;
				}
				return {
					...existing,
					...base,
					stdout: existing.stdout,
					stderr: existing.stderr,
					plots: base.plots.length ? base.plots : existing.plots,
					code: existing.code || base.code,
				};
			});
			return {
				execution: {
					...state.execution,
					results: normalized.slice(-10),
					history: normalized,
				},
			};
		}),
	applyRunStarted: (run) =>
		set((state) => {
			const entry = runSummaryToLogEntry(run);
			return {
				execution: {
					...state.execution,
					results: [...state.execution.results.filter((r) => r.runId !== run.run_id), entry].slice(
						-10,
					),
					history: [...state.execution.history.filter((r) => r.runId !== run.run_id), entry],
				},
			};
		}),
	applyRunOutput: (chunk) =>
		set((state) => {
			const updateList = (list: ExecutionLogEntry[]): ExecutionLogEntry[] => {
				const idx = list.findIndex((r) => r.runId === chunk.run_id);
				if (idx == null || idx === -1) {
					const entry: ExecutionLogEntry = {
						runId: chunk.run_id,
						code: "",
						stdout: chunk.stream === "stdout" ? chunk.chunk : "",
						stderr: chunk.stream === "stderr" ? chunk.chunk : "",
						plots: [],
						timestamp: chunk.at_ms,
						duration: 0,
						success: false,
						pending: true,
					};
					return [...list, entry];
				}
				const next = [...list];
				const entry = { ...next[idx] };
				if (chunk.stream === "stdout") {
					entry.stdout = [entry.stdout, chunk.chunk].filter(Boolean).join("\n");
					entry.pending = true;
				}
				if (chunk.stream === "stderr") {
					entry.stderr = [entry.stderr, chunk.chunk].filter(Boolean).join("\n");
					entry.pending = true;
				}
				next[idx] = entry;
				return next;
			};

			return {
				execution: {
					...state.execution,
					results: updateList(state.execution.results).slice(-10),
					history: updateList(state.execution.history),
				},
			};
		}),
	applyRunFinished: (run) =>
		set((state) => {
			const entry = runSummaryToLogEntry(run);
			const mergeWithExisting = (existing: ExecutionLogEntry | undefined): ExecutionLogEntry => {
				if (!existing) {
					return entry;
				}
				const mergedStderr = run.error
					? [existing.stderr, run.error].filter(Boolean).join("\n")
					: existing.stderr;
				return {
					...existing,
					...entry,
					stdout: existing.stdout,
					stderr: mergedStderr,
					plots: entry.plots.length ? entry.plots : existing.plots,
					code: existing.code || entry.code,
					timestamp: existing.timestamp ?? entry.timestamp,
				};
			};
			const upsert = (list: ExecutionLogEntry[]): ExecutionLogEntry[] => {
				const idx = list.findIndex((r) => r.runId === run.run_id);
				if (idx !== -1) {
					const next = [...list];
					next[idx] = mergeWithExisting(list[idx]);
					return next;
				}
				return [...list, mergeWithExisting(undefined)];
			};
			return {
				execution: {
					...state.execution,
					results: upsert(state.execution.results).slice(-10),
					history: upsert(state.execution.history),
				},
			};
		}),
	clearExecutionResults: () =>
		set((state) => ({
			execution: { ...state.execution, results: [] },
		})),
	setCurrentCell: (currentCell) =>
		set((state) => ({
			execution: { ...state.execution, currentCell },
		})),
	resetExecutionState: () =>
		set(() => ({
			execution: {
				isRunning: false,
				results: [],
				history: [],
				currentCell: undefined,
			},
		})),
	loadExecutionHistory: (history) =>
		set(() => {
			const normalized = history.map((entry) => ({
				...entry,
				code: entry.code ?? "",
				pending: entry.pending ?? false,
			}));
			return {
				execution: {
					isRunning: false,
					results: normalized.slice(-10),
					history: normalized,
					currentCell: undefined,
				},
			};
		}),
});

function runSummaryToLogEntry(run: RunSummary): ExecutionLogEntry {
	return {
		runId: run.run_id,
		code: run.code ?? "",
		stdout: "",
		stderr: run.error ?? "",
		plots: (run.plots ?? []).map(mapPlotInfo),
		timestamp: run.started_at_ms,
		duration: run.duration_ms ?? 0,
		success: run.status === "succeeded",
		pending: run.status === "running" || run.status === "queued",
	};
}

function mapPlotInfo(plot: PlotInfo): ExecutionLogEntry["plots"][number] {
	return {
		id: plot.id || plot.filename || `plot-${plot.index}`,
		path: plot.storage_path || plot.filename,
		storagePath: plot.storage_path || null,
		data: plot.base64_data.startsWith("data:")
			? plot.base64_data
			: `data:image/png;base64,${plot.base64_data}`,
		timestamp: plot.timestamp ?? Date.now(),
		width: plot.width ?? null,
		height: plot.height ?? null,
		code: plot.code ?? null,
	};
}
