import type { PlotHistoryStatePayload } from "shared";
import type { ServerMessage } from "shared";
import { plotHistoryMessages } from "@/services/messageBuilders";
import { socketService } from "./socket";

const historyMatcher = (message: ServerMessage): boolean =>
	message.type === "plot_history_state" || message.type === "error";

export async function requestPlotHistory(): Promise<PlotHistoryStatePayload> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			plotHistoryMessages.get(),
			(message) => {
				if (message.type === "plot_history_state") {
					resolve({
						activePlotId: message.activePlotId ?? null,
						plots: message.plots,
					});
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected plot history response: ${message.type}`));
			},
			historyMatcher,
		);

		if (!didSend) {
			reject(new Error("Failed to request plot history: WebSocket is not connected"));
		}
	});
}

export async function setActivePlot(plotId: string): Promise<PlotHistoryStatePayload> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			plotHistoryMessages.setActive(plotId),
			(message) => {
				if (message.type === "plot_history_state") {
					resolve({
						activePlotId: message.activePlotId ?? null,
						plots: message.plots,
					});
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected plot history response: ${message.type}`));
			},
			historyMatcher,
		);

		if (!didSend) {
			reject(new Error("Failed to set active plot: WebSocket is not connected"));
		}
	});
}

export async function exportPlot(
	plotId: string,
	path: string,
	format?: "png" | "pdf",
): Promise<void> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			plotHistoryMessages.export(plotId, path, format),
			(message) => {
				if (message.type === "plot_history_exported") {
					if (message.success) {
						resolve();
					} else {
						reject(new Error(message.error || "Failed to export plot"));
					}
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected plot export response: ${message.type}`));
			},
			(message) => message.type === "plot_history_exported" || message.type === "error",
		);

		if (!didSend) {
			reject(new Error("Failed to export plot: WebSocket is not connected"));
		}
	});
}

export async function deletePlot(plotId: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			plotHistoryMessages.delete(plotId),
			(message) => {
				if (message.type === "plot_history_deleted") {
					if (message.error) {
						reject(new Error(message.error));
					} else {
						resolve();
					}
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected plot delete response: ${message.type}`));
			},
			(message) => message.type === "plot_history_deleted" || message.type === "error",
		);

		if (!didSend) {
			reject(new Error("Failed to delete plot: WebSocket is not connected"));
		}
	});
}

export async function clearPlotHistory(): Promise<void> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			plotHistoryMessages.clear(),
			(message) => {
				if (message.type === "plot_history_cleared") {
					if (message.error) {
						reject(new Error(message.error));
					} else {
						resolve();
					}
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				reject(new Error(`Unexpected plot history clear response: ${message.type}`));
			},
			(message) => message.type === "plot_history_cleared" || message.type === "error",
		);

		if (!didSend) {
			reject(new Error("Failed to clear plot history: WebSocket is not connected"));
		}
	});
}
