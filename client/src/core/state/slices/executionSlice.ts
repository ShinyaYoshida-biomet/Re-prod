import type { ExecutionLogEntry, RunOutputChunk, RunSummary } from "@shared/types";
import type { StateCreator } from "zustand";

export interface ExecutionState {
	execution: {
		isRunning: boolean;
		results: ExecutionLogEntry[];
		history: ExecutionLogEntry[];
		currentCell: number | undefined;
	};
	setIsRunning: (isRunning: boolean) => void;
	addPendingExecution: (code: string) => void;
	addExecutionResult: (result: ExecutionLogEntry) => void;
	applyRunState: (runs: RunSummary[]) => void;
	applyRunStarted: (run: RunSummary) => void;
	applyRunOutput: (chunk: RunOutputChunk) => void;
	applyRunFinished: (run: RunSummary) => void;
	replacePendingExecution: (result: ExecutionLogEntry) => void;
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
	addPendingExecution: (code) =>
		set((state) => {
			const entry: ExecutionLogEntry = {
				runId: undefined,
				code,
				stdout: "",
				stderr: "",
				plots: [],
				timestamp: Date.now(),
				duration: 0,
				success: true,
				pending: true,
			};
			return {
				execution: {
					...state.execution,
					results: [...state.execution.results, entry],
					history: [...state.execution.history, entry],
				},
			};
		}),
	addExecutionResult: (result) =>
		set((state) => {
			const upsert = (list: ExecutionLogEntry[]): ExecutionLogEntry[] => {
				if (result.runId) {
					const idx = list.findIndex((entry) => entry.runId === result.runId);
					if (idx !== -1) {
						const next = [...list];
						next[idx] = { ...next[idx], ...result, pending: false };
						return next;
					}
				}
				return [...list, { ...result, pending: false }];
			};

			const nextResults = upsert(state.execution.results);
			const nextHistory = upsert(state.execution.history);

			return {
				execution: {
					...state.execution,
					results: nextResults.slice(-10),
					history: nextHistory,
				},
			};
		}),
	applyRunState: (runs) =>
		set((state) => {
			const normalized = runs.map(runSummaryToLogEntry);
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
					return list;
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
			const upsert = (list: ExecutionLogEntry[]): ExecutionLogEntry[] => {
				const idx = list.findIndex((r) => r.runId === run.run_id);
				if (idx !== -1) {
					const next = [...list];
					next[idx] = entry;
					return next;
				}
				return [...list, entry];
			};
			return {
				execution: {
					...state.execution,
					results: upsert(state.execution.results).slice(-10),
					history: upsert(state.execution.history),
				},
			};
		}),
	replacePendingExecution: (result) =>
		set((state) => {
			const normalized = { ...result, pending: false };
			const replace = (list: ExecutionLogEntry[]): ExecutionLogEntry[] => {
				if (normalized.runId) {
					const byId = list.findIndex((entry) => entry.runId === normalized.runId);
					if (byId !== -1) {
						const next = [...list];
						next[byId] = { ...next[byId], ...normalized };
						return next;
					}
				}
				const idx = list.findIndex((entry) => entry.pending);
				if (idx === -1) {
					return [...list, normalized];
				}
				const next = [...list];
				next[idx] = normalized;
				return next;
			};
			return {
				execution: {
					...state.execution,
					results: replace(state.execution.results).slice(-10),
					history: replace(state.execution.history),
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
		plots: (run.plots ?? []).map((plot) => ({
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
		})),
		timestamp: run.started_at_ms,
		duration: run.duration_ms ?? 0,
		success: run.status === "succeeded",
		pending: run.status === "running" || run.status === "queued",
	};
}
