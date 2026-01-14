import { WEBSOCKET_REQUEST_TIMEOUT } from "@/constants/timeouts";
import { useStore } from "@/core";
import { socketService } from "@/services/socket";
import type { ExtractServerMessage } from "@/types";

type DevWindow = Window & {
	reprodTest?: {
		sendMessage: typeof socketService.send;
		isConnected: () => boolean;
		waitForProjectOpened: (
			projectName: string,
			timeoutMs?: number,
		) => Promise<ExtractServerMessage<"project_opened">>;
		openExportDialog: () => void;
		openTimelineDialog: () => void;
	};
};

export const setupDevGlobals = (): void => {
	const target = window as DevWindow;
	target.reprodTest = {
		sendMessage: socketService.send.bind(socketService),
		isConnected: socketService.isConnected.bind(socketService),
		waitForProjectOpened: (projectName: string, timeoutMs = WEBSOCKET_REQUEST_TIMEOUT) =>
			new Promise((resolve, reject) => {
				if (!socketService.isConnected()) {
					reject(new Error("WebSocket is not connected"));
					return;
				}

				let timeoutId: ReturnType<typeof setTimeout> | null = null;
				const offOpened = socketService.on("project_opened", (message) => {
					if (message.type !== "project_opened") {
						return;
					}
					if (message.project.name !== projectName) {
						return;
					}
					cleanup();
					resolve(message);
				});
				const offError = socketService.on("error", (message) => {
					if (message.type !== "error") {
						return;
					}
					cleanup();
					reject(new Error(message.message));
				});

				const cleanup = (): void => {
					if (timeoutId) {
						clearTimeout(timeoutId);
						timeoutId = null;
					}
					offOpened();
					offError();
				};

				timeoutId = setTimeout(() => {
					cleanup();
					reject(new Error(`Timed out waiting for project_opened: ${projectName}`));
				}, timeoutMs);
			}),
		openExportDialog: () => {
			useStore.getState().setModalOpen("export", true);
		},
		openTimelineDialog: () => {
			const timelineRef = useStore.getState().timelinePanelRef;
			if (timelineRef) {
				timelineRef.scrollIntoView();
			}
		},
	};
};
