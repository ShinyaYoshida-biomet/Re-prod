import { useStore } from "@/core/state/store";
import { socketService } from "@/services/socket";
import { refreshTimelineData } from "@/services/sessionPersistence";

export function setupSocketListeners(): () => void {
	const store = useStore.getState();

	// --- Session Control Events ---
	const offInterrupt = socketService.on("execution_interrupted", (message) => {
		if (message.type === "execution_interrupted" && message.success) {
			store.setIsRunning(false);
		}
	});

	const offRestart = socketService.on("session_restarted", (message) => {
		if (message.type === "session_restarted") {
			store.resetExecutionState();
			store.reset(); // resetTimeline
			void refreshTimelineData();
		}
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
				console.warn("Plot delete failed:", message.error);
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
		offState();
		offUpdate();
		offDeleted();
		offCleared();
	};
}
