import { useEffect } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { requestPlotHistory } from "@/services/plotHistoryService";
import { DEFAULT_VIEW_STATE } from "@/services/sessionPersistence";
import { socketService } from "@/services/socket";
import type { ProjectRecord } from "@/types";

function resetWorkspace(): void {
	const store = useStore.getState();
	useStore.setState((state) => ({
		editor: { ...state.editor, content: "", filepath: "", isDirty: false },
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
