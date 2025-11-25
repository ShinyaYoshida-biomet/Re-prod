import type { ServerMessage } from "shared";
import { socketService } from "./socket";

const interruptMatcher = (message: ServerMessage): boolean =>
	message.type === "execution_interrupted" || message.type === "error";

const restartMatcher = (message: ServerMessage): boolean =>
	message.type === "session_restarted" || message.type === "error";

export async function interruptExecution(): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			{ type: "interrupt_execution" },
			(message) => {
				if (message.type === "execution_interrupted") {
					resolve(message.success);
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
				}
			},
			interruptMatcher,
		);

		if (!didSend) {
			reject(new Error("WebSocket is not connected."));
		}
	});
}

export async function restartSession(): Promise<void> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			{ type: "restart_session" },
			(message) => {
				if (message.type === "session_restarted") {
					resolve();
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
				}
			},
			restartMatcher,
		);

		if (!didSend) {
			reject(new Error("WebSocket is not connected."));
		}
	});
}
