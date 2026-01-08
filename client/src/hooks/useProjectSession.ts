import { useEffect } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { DEFAULT_R_SCRIPT, type Buffer } from "@/core/state/slices/editorSlice";
import { createBufferId } from "@/core/state/utils/createBufferId";
import { requestPlotHistory } from "@/services/plotHistoryService";
import { DEFAULT_VIEW_STATE } from "@/services/sessionPersistence";
import { socketService } from "@/services/socket";
import type { ProjectRecord } from "@/types";

function resetWorkspace(): void {
	const store = useStore.getState();
	const buffer: Buffer = {
		id: createBufferId(),
		filepath: null,
		content: DEFAULT_R_SCRIPT,
		isDirty: false,
		cursorPosition: { line: 1, column: 1 },
		displayName: "Untitled-1",
	};
	useStore.setState((state) => ({
		editor: {
			...state.editor,
			buffers: [buffer],
			activeBufferId: buffer.id,
		},
		view: {
			panes: { ...DEFAULT_VIEW_STATE.panes },
			modals: { ...DEFAULT_VIEW_STATE.modals },
			zoom: DEFAULT_VIEW_STATE.zoom,
		},
	}));
	store.setZoomLevel(DEFAULT_VIEW_STATE.zoom);
	store.clearAIMessages();
	store.resetExecutionState();
	store.reset();
	useFileSystemStore.getState().setActivePath(null);
}

export function useProjectSession(): void {
	const setProject = useStore((state) => state.setProject);
	const resetPlotHistory = useStore((state) => state.resetPlotHistory);

	useEffect(() => {
		const handleProjectOpened = async (message: { project: ProjectRecord }) => {
			resetWorkspace();
			setProject(message.project);
			resetPlotHistory();
			void requestPlotHistory();

			const resetAndLoadRoot = useFileSystemStore.getState().resetAndLoadRoot;
			void resetAndLoadRoot();

			socketService.send({ type: "run_query", limit: 50 });
		};

		const offOpened = socketService.on("project_opened", (message) => {
			if (message.type === "project_opened") {
				void handleProjectOpened(message);
			}
		});

		const unsubscribeConnection = socketService.onConnectionChange((status) => {
			if (status === "connected") {
				socketService.send({ type: "run_query", limit: 50 });
			}
		});

		if (socketService.isConnected()) {
			socketService.send({ type: "run_query", limit: 50 });
		}

		return () => {
			offOpened();
			unsubscribeConnection();
		};
	}, [resetPlotHistory, setProject]);
}
