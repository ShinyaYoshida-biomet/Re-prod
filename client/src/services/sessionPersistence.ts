import { executionEventToLogEntry, useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import type { ViewData } from "@/core/state/slices/viewSlice";
import { fileSystem } from "@/services/fileSystem";
import { queryTimeline } from "@/services/timelineService";

const SNAPSHOT_VERSION = 2;
const STORAGE_FILENAME = () =>
	`reprod-session-${new Date().toISOString().replace(/[:]/g, "-")}.json`;

export const DEFAULT_VIEW_STATE: ViewData = {
	panes: {
		files: true,
		editor: true,
		assistant: true,
	},
	modals: {
		export: false,
		shortcuts: false,
		about: false,
		sessionInfo: false,
		settings: false,
		projects: false,
	},
	zoom: 1,
};

export interface SessionSnapshot {
	version: number;
	savedAt: number;
	editor?: {
		filepath: string | null;
	};
	view?: ViewData;
}

const mergeViewState = (view?: ViewData): ViewData => ({
	panes: { ...DEFAULT_VIEW_STATE.panes, ...(view?.panes ?? {}) },
	modals: { ...DEFAULT_VIEW_STATE.modals, ...(view?.modals ?? {}) },
	zoom: view?.zoom ?? DEFAULT_VIEW_STATE.zoom,
});

const applyViewState = (view?: ViewData): void => {
	const merged = mergeViewState(view);
	useStore.setState((state) => ({
		...state,
		view: {
			panes: { ...state.view.panes, ...merged.panes },
			modals: { ...state.view.modals, ...merged.modals },
			zoom: merged.zoom,
		},
	}));
	useStore.getState().setZoomLevel(merged.zoom);
};

const resetDomainState = (): void => {
	const state = useStore.getState();
	state.clearAIMessages();
	state.resetExecutionState();
	state.reset();
};

const restoreEditorFromFilesystem = async (filepath: string | null): Promise<void> => {
	const normalizedPath = filepath ?? "";
	useFileSystemStore.getState().setActivePath(normalizedPath || null);

	if (!normalizedPath) {
		useStore.setState((state) => ({
			editor: { ...state.editor, content: "", filepath: "", isDirty: false },
		}));
		return;
	}

	useStore.setState((state) => ({
		editor: { ...state.editor, content: "", filepath: normalizedPath, isDirty: false },
	}));

	try {
		const content = await fileSystem.readFile(normalizedPath);
		useStore.setState((state) => ({
			editor: { ...state.editor, content, filepath: normalizedPath, isDirty: false },
		}));
	} catch (error) {
		console.error("Failed to load file from filesystem", error);
		useStore.setState((state) => ({
			editor: { ...state.editor, content: "", filepath: normalizedPath, isDirty: false },
		}));
	}
};

export function getSessionSnapshot(): SessionSnapshot {
	const state = useStore.getState();
	return {
		version: SNAPSHOT_VERSION,
		savedAt: Date.now(),
		editor: {
			filepath: state.editor.filepath || null,
		},
		view: mergeViewState(state.view),
	};
}

export function exportSessionSnapshot(): void {
	const snapshot = getSessionSnapshot();

	const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = STORAGE_FILENAME();
	link.click();
	URL.revokeObjectURL(url);
}

export function importSessionSnapshot(): void {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "application/json";
	input.onchange = async (event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text) as SessionSnapshot;
			await applySessionSnapshot(data);
		} catch (error) {
			window.alert("Unable to load session snapshot. Ensure the file is valid JSON.");
		}
	};

	input.click();
}

export async function applySessionSnapshot(snapshot: SessionSnapshot): Promise<boolean> {
	if (snapshot.version !== SNAPSHOT_VERSION) {
		window.alert("Session snapshot version is not compatible with this build.");
		resetDomainState();
		applyViewState();
		await restoreEditorFromFilesystem(snapshot.editor?.filepath ?? null);
		void refreshTimelineData();
		return false;
	}

	resetDomainState();
	applyViewState(snapshot.view);
	await restoreEditorFromFilesystem(snapshot.editor?.filepath ?? null);
	void refreshTimelineData();
	return true;
}

export async function refreshTimelineData(): Promise<void> {
	const state = useStore.getState();
	const { filters, sort, limit, setEvents, setLoading, setError, loadExecutionHistory } = state;

	setLoading(true);
	try {
		const response = await queryTimeline({
			filters,
			sort,
			limit,
			offset: 0,
		});
		setEvents(response.events, response.total, response.hasMore);
		const executionHistory = response.events.map(executionEventToLogEntry);
		loadExecutionHistory(executionHistory);
	} catch (error) {
		setError(error instanceof Error ? error.message : "Failed to refresh timeline");
	}
}
