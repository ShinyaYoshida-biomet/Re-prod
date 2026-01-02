import { useEffect } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { requestPlotHistory } from "@/services/plotHistoryService";
import { projectService } from "@/services/projectService";
import type { SessionSnapshot } from "@/services/sessionPersistence";
import {
	applySessionSnapshot,
	DEFAULT_VIEW_STATE,
	getSessionSnapshot,
	refreshTimelineData,
} from "@/services/sessionPersistence";
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
	const setProjects = useStore((state) => state.setProjects);
	const setLastRestoredState = useStore((state) => state.setLastRestoredState);
	const resetPlotHistory = useStore((state) => state.resetPlotHistory);

	useEffect(() => {
		const restoreSnapshot = async (snapshot: SessionSnapshot | null | undefined) => {
			if (!snapshot) {
				resetWorkspace();
				await refreshTimelineData();
				setLastRestoredState(null);
				return;
			}

			const applied = await applySessionSnapshot(snapshot);
			if (!applied) {
				resetWorkspace();
				await refreshTimelineData();
				setLastRestoredState(null);
				return;
			}

			setLastRestoredState(snapshot as unknown as Record<string, unknown>);
		};

		const handleProjectOpened = async (message: { project: ProjectRecord; state?: unknown }) => {
			const snapshot = message.state as unknown as SessionSnapshot | null | undefined;

			setProject(message.project);
			resetPlotHistory();
			void requestPlotHistory();

			// Reset and refresh workspace file tree for the new project
			const resetAndLoadRoot = useFileSystemStore.getState().resetAndLoadRoot;
			void resetAndLoadRoot();

			socketService.send({ type: "run_query", limit: 50 });
			await restoreSnapshot(snapshot);
		};

		const offOpened = socketService.on("project_opened", (message) => {
			if (message.type === "project_opened") {
				void handleProjectOpened(message);
			}
		});

		const offList = socketService.on("project_list", (message) => {
			if (message.type === "project_list") {
				setProjects(message.projects);
			}
		});

		const offState = socketService.on("project_state", (message) => {
			if (message.type === "project_state" && message.state) {
				void (async () => {
					await restoreSnapshot(message.state as unknown as SessionSnapshot);
				})();
			}
		});

		const offSaved = socketService.on("project_state_saved", (message) => {
			if (message.type === "project_state_saved" && message.project_id) {
			}
		});

		const unsubscribeConnection = socketService.onConnectionChange((status) => {
			if (status === "connected") {
				projectService.requestList();
				socketService.send({ type: "run_query", limit: 50 });
			}
		});

		if (socketService.isConnected()) {
			projectService.requestList();
			socketService.send({ type: "run_query", limit: 50 });
		}

		return () => {
			offOpened();
			offList();
			offState();
			offSaved();
			unsubscribeConnection();
		};
	}, [resetPlotHistory, setLastRestoredState, setProject, setProjects]);
}

export function persistCurrentProjectState(): void {
	const { project } = useStore.getState();
	if (!project) {
		return;
	}
	const snapshot = getSessionSnapshot();
	projectService.saveState(project.id, snapshot);
}
