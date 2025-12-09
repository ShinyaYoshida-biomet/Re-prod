import type { AIMessage, AppSettings, ExecutionLogEntry } from "@shared/types";
import { useStore } from "@/core";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";
import { queryTimeline } from "@/services/timelineService";

const SNAPSHOT_VERSION = 1;
const STORAGE_FILENAME = () =>
	`reprod-session-${new Date().toISOString().replace(/[:]/g, "-")}.json`;

export interface SessionSnapshot {
	version: number;
	savedAt: number;
	editor: {
		content: string;
		filepath: string;
	};
	executionHistory: ExecutionLogEntry[];
	settings: AppSettings;
	aiMessages: AIMessage[];
}

const normalizeAIMessages = (messages: AIMessage[]): AIMessage[] =>
	messages.map((message) => {
		if (message.codeBlocks && message.codeBlocks.length > 0) {
			return message;
		}

		const fallbackText = message.content || message.code || "";
		const codeBlocks = fallbackText ? extractCodeBlocks(fallbackText) : [];

		return codeBlocks.length ? { ...message, codeBlocks } : message;
	});

export function getSessionSnapshot(): SessionSnapshot {
	const state = useStore.getState();
	return {
		version: SNAPSHOT_VERSION,
		savedAt: Date.now(),
		editor: {
			content: state.editor.content,
			filepath: state.editor.filepath,
		},
		executionHistory: state.execution.history,
		settings: state.settings,
		aiMessages: normalizeAIMessages(state.ai.messages),
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
			applySessionSnapshot(data);
		} catch (error) {
			window.alert("Unable to load session snapshot. Ensure the file is valid JSON.");
		}
	};

	input.click();
}

export function applySessionSnapshot(snapshot: SessionSnapshot): void {
	if (snapshot.version !== SNAPSHOT_VERSION) {
		window.alert("Session snapshot version is not compatible with this build.");
		return;
	}

	const state = useStore.getState();
	state.setEditorContent(snapshot.editor.content);
	state.setEditorFilepath(snapshot.editor.filepath);
	state.setEditorIsDirty(false);
	state.loadExecutionHistory(snapshot.executionHistory ?? []);
	state.updateSettings(snapshot.settings);
	state.setAIMessages(normalizeAIMessages(snapshot.aiMessages ?? []));
	void refreshTimelineData();
}

export async function refreshTimelineData(): Promise<void> {
	const state = useStore.getState();
	const { filters, sort, limit, setEvents, setLoading, setError } = state;

	setLoading(true);
	try {
		const response = await queryTimeline({
			filters,
			sort,
			limit,
			offset: 0,
		});
		setEvents(response.events, response.total, response.hasMore);
	} catch (error) {
		setError(error instanceof Error ? error.message : "Failed to refresh timeline");
	}
}
