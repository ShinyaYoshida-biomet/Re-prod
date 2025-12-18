import type { ServerMessage } from "shared";
import { useStore } from "@/core/state/store";
import { socketService } from "@/services/socket";
import { refreshTimelineData } from "@/services/sessionPersistence";

type RunEventHandlers = {
	run_state: (message: Extract<ServerMessage, { type: "run_state" }>) => void;
	run_started: (message: Extract<ServerMessage, { type: "run_started" }>) => void;
	run_output: (message: Extract<ServerMessage, { type: "run_output" }>) => void;
	run_finished: (message: Extract<ServerMessage, { type: "run_finished" }>) => void;
};

function registerHandlers(handlers: Partial<RunEventHandlers>): () => void {
	const unsubs = Object.entries(handlers).map(([type, fn]) =>
		socketService.on(type as keyof RunEventHandlers, (message) => fn?.(message as never)),
	);
	return () => {
		unsubs.forEach((off) => off());
	};
}

export function setupSocketListeners(): () => void {
	const store = useStore.getState();
	const setIsRunningFromExecutionState = (): void => {
		const hasRunning = useStore.getState().execution.history.some((entry) => entry.pending);
		store.setIsRunning(hasRunning);
	};

	// --- Session Control Events ---
	const offInterrupt = socketService.on("execution_interrupted", (message) => {
		if (message.type === "execution_interrupted" && message.success) {
			setIsRunningFromExecutionState();
		}
	});

	const offRestart = socketService.on("session_restarted", (message) => {
		if (message.type === "session_restarted") {
			store.resetExecutionState();
			store.reset(); // resetTimeline
			void refreshTimelineData();
		}
	});

	const offRunEvents = registerHandlers({
		run_state: (message) => {
			store.applyRunState(message.runs);
			const hasRunning = message.runs.some(
				(run) => run.status === "running" || run.status === "queued",
			);
			store.setIsRunning(hasRunning);
		},
		run_started: (message) => {
			store.applyRunStarted(message.run);
			store.setIsRunning(true);
		},
		run_output: (message) => {
			store.applyRunOutput(message);
			setIsRunningFromExecutionState();
		},
		run_finished: (message) => {
			store.applyRunFinished(message.run);
			setIsRunningFromExecutionState();
		},
	});

	// --- Plot History Events ---
	const offState = socketService.on("plot_history_state", (message) => {
		if (message.type === "plot_history_state") {
			store.applyPlotHistorySnapshot({
				activePlotId: message.activePlotId ?? null,
				plots: message.plots,
			});
		}
	});

	const offUpdate = socketService.on("plot_history_updated", (message) => {
		if (message.type === "plot_history_updated") {
			store.appendPlotHistory(message.plots, message.activePlotId ?? null);
		}
	});

	const offDeleted = socketService.on("plot_history_deleted", (message) => {
		if (message.type === "plot_history_deleted") {
			if (message.error) {
				return;
			}
			if (message.state) {
				store.applyPlotHistorySnapshot({
					activePlotId: message.activePlotId ?? null,
					plots: message.state,
				});
			} else {
				store.resetPlotHistory();
				store.setActivePlotId(null);
			}
		}
	});

	const offCleared = socketService.on("plot_history_cleared", (message) => {
		if (message.type === "plot_history_cleared") {
			if (message.state) {
				store.applyPlotHistorySnapshot({
					activePlotId: message.activePlotId ?? null,
					plots: message.state,
				});
			} else {
				store.resetPlotHistory();
			}
		}
	});

	return () => {
		offInterrupt();
		offRestart();
		offRunEvents();
		offState();
		offUpdate();
		offDeleted();
		offCleared();
	};
}
