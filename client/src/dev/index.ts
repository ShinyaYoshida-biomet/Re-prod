import { WEBSOCKET_REQUEST_TIMEOUT } from "@/constants/timeouts";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import type { Buffer } from "@/core/state/slices/editorSlice";
import { createBufferId } from "@/core/state/utils/createBufferId";
import { fileSystem } from "@/services/fileSystem";
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
		setActiveMode: (mode: "api" | "external_agent") => void;
		getActiveMode: () => "api" | "external_agent";
		appendTerminalOutput: (chunk: string) => void;
		clearTerminalOutput: () => void;
		getTerminalOutput: () => string;
		openFile: (path: string) => Promise<void>;
		openExportDialog: () => void;
		openProjectSwitchDialog: () => void;
		openSettingsDialog: () => void;
		openTimelineDialog: () => void;
		reloadFileTree: () => Promise<void>;
	};
};

export const setupDevGlobals = (): void => {
	const target = window as DevWindow;
	const terminalOutputChunks: string[] = [];
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
					if (!/(project|workspace|folder)/i.test(message.message)) {
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
		setActiveMode: (mode) => {
			useStore.getState().setActiveMode(mode);
		},
		getActiveMode: () => useStore.getState().activeMode,
		appendTerminalOutput: (chunk) => {
			terminalOutputChunks.push(chunk);
		},
		clearTerminalOutput: () => {
			terminalOutputChunks.length = 0;
		},
		getTerminalOutput: () => terminalOutputChunks.join(""),
		openFile: async (path: string) => {
			const store = useStore.getState();
			const existingBuffer = store.getBufferByFilepath(path);
			if (existingBuffer) {
				store.setActiveBuffer(existingBuffer.id);
				return;
			}
			const content = await fileSystem.readFile(path);
			const buffer: Buffer = {
				id: createBufferId(),
				filepath: path,
				content,
				isDirty: false,
				cursorPosition: { line: 1, column: 1 },
			};
			store.addBuffer(buffer);
		},
		openExportDialog: () => {
			useStore.getState().setModalOpen("export", true);
		},
		openProjectSwitchDialog: () => {
			useStore.getState().setModalOpen("projectSwitch", true);
		},
		openSettingsDialog: () => {
			useStore.getState().setModalOpen("settings", true);
		},
		openTimelineDialog: () => {
			const timelineRef = useStore.getState().timelinePanelRef;
			if (timelineRef) {
				timelineRef.scrollIntoView();
			}
		},
		reloadFileTree: () => useFileSystemStore.getState().resetAndLoadRoot(),
	};
};
