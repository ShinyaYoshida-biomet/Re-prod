import type { ExecutionLogEntry } from "@shared/types";
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
