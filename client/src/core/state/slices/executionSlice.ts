import type { ExecutionLogEntry, PlotInfoPayload, RunOutputChunk, RunSummary } from "@shared/types";
import type { StateCreator } from "zustand";

export interface ExecutionState {
	execution: {
		isRunning: boolean;
		results: ExecutionLogEntry[];
		history: ExecutionLogEntry[];
		currentCell: number | undefined;
		lastError: string | null;
	};
	setIsRunning: (isRunning: boolean) => void;
	setExecutionError: (message: string | null) => void;
	appendExecutionEntry: (entry: ExecutionLogEntry) => void;
	applyRunState: (runs: RunSummary[]) => void;
	applyRunStarted: (run: RunSummary) => void;
	applyRunOutput: (chunk: RunOutputChunk) => void;
	applyRunFinished: (run: RunSummary) => void;
	clearExecutionResults: () => void;
	setCurrentCell: (cellIndex: number | undefined) => void;
	resetExecutionState: () => void;
}

export const createExecutionSlice: StateCreator<ExecutionState> = (set) => ({
	execution: {
		isRunning: false,
		results: [],
		history: [],
		currentCell: undefined,
		lastError: null,
	},
	setIsRunning: (isRunning) =>
		set((state) => ({
			execution: { ...state.execution, isRunning },
		})),
	setExecutionError: (message) =>
		set((state) => ({
			execution: { ...state.execution, lastError: message },
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
					results: upsertRunEntry(state.execution.results, entry).slice(-10),
					history: upsertRunEntry(state.execution.history, entry),
				},
			};
		}),
	applyRunOutput: (chunk) =>
		set((state) => {
			return {
				execution: {
					...state.execution,
					results: updateRunOutput(state.execution.results, chunk).slice(-10),
					history: updateRunOutput(state.execution.history, chunk),
				},
			};
		}),
	applyRunFinished: (run) =>
		set((state) => {
			const entry = runSummaryToLogEntry(run);
			return {
				execution: {
					...state.execution,
					results: upsertFinished(state.execution.results, entry, run.error).slice(-10),
					history: upsertFinished(state.execution.history, entry, run.error),
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
				lastError: null,
			},
		})),
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

function mapPlotInfo(plot: PlotInfoPayload): ExecutionLogEntry["plots"][number] {
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

function upsertRunEntry(list: ExecutionLogEntry[], entry: ExecutionLogEntry): ExecutionLogEntry[] {
	return [...list.filter((r) => r.runId !== entry.runId), entry];
}

function updateRunOutput(list: ExecutionLogEntry[], chunk: RunOutputChunk): ExecutionLogEntry[] {
	const idx = list.findIndex((r) => r.runId === chunk.run_id);
	if (idx === -1) return list;
	const next = [...list];
	const entry = { ...next[idx] };
	if (chunk.stream === "stdout") {
		entry.stdout = [entry.stdout, chunk.chunk].filter(Boolean).join("\n");
	}
	if (chunk.stream === "stderr") {
		entry.stderr = [entry.stderr, chunk.chunk].filter(Boolean).join("\n");
	}
	next[idx] = entry;
	return next;
}

function upsertFinished(
	list: ExecutionLogEntry[],
	entry: ExecutionLogEntry,
	error?: string | null,
): ExecutionLogEntry[] {
	const mergeWithExisting = (existing: ExecutionLogEntry | undefined): ExecutionLogEntry => {
		if (!existing) {
			return entry;
		}
		const mergedStderr = error
			? [existing.stderr, error].filter(Boolean).join("\n")
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
	const idx = list.findIndex((r) => r.runId === entry.runId);
	if (idx !== -1) {
		const next = [...list];
		next[idx] = mergeWithExisting(list[idx]);
		return next;
	}
	return [...list, mergeWithExisting(undefined)];
}
