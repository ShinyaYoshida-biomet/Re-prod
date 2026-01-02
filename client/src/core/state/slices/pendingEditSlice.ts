import type { StateCreator } from "zustand";
import type { PendingEdit, PendingEditStatus } from "@/types/pendingEdit";

export interface PendingEditState {
	pendingEdits: Record<string, PendingEdit>;
	registerPendingEdit: (edit: PendingEdit) => boolean;
	updatePendingEditStatus: (filePath: string, status: PendingEditStatus) => void;
	clearPendingEdit: (filePath: string) => void;
}

export const createPendingEditSlice: StateCreator<PendingEditState> = (set, get) => ({
	pendingEdits: {},
	registerPendingEdit: (edit) => {
		const { pendingEdits } = get();
		if (pendingEdits[edit.filePath]) {
			return false;
		}
		set({
			pendingEdits: {
				...pendingEdits,
				[edit.filePath]: edit,
			},
		});
		return true;
	},
	updatePendingEditStatus: (filePath, status) =>
		set((state) => {
			const existing = state.pendingEdits[filePath];
			if (!existing) return state;
			return {
				pendingEdits: {
					...state.pendingEdits,
					[filePath]: {
						...existing,
						status,
					},
				},
			};
		}),
	clearPendingEdit: (filePath) =>
		set((state) => {
			if (!state.pendingEdits[filePath]) return state;
			const next = { ...state.pendingEdits };
			delete next[filePath];
			return { pendingEdits: next };
		}),
});
