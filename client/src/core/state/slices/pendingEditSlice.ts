import type { StateCreator } from "zustand";
import type {
	PendingEdit,
	PendingEditReviewMap,
	PendingEditReviewStatus,
} from "@/types/pendingEdit";
import { normalizeRelativePath } from "@/core/pathUtils";

export interface PendingEditState {
	pendingEdits: Record<string, PendingEdit>;
	registerPendingEdit: (edit: PendingEdit) => boolean;
	updatePendingEditReview: (
		filePath: string,
		changeId: string,
		status: PendingEditReviewStatus,
	) => void;
	setPendingEditReviewMap: (filePath: string, reviewMap: PendingEditReviewMap) => void;
	clearPendingEdit: (filePath: string) => void;
}

export const createPendingEditSlice: StateCreator<PendingEditState> = (set, get) => ({
	pendingEdits: {},
	registerPendingEdit: (edit) => {
		const { pendingEdits } = get();
		const normalizedPath = normalizeRelativePath(edit.filePath, { keepRootEmpty: true });
		if (pendingEdits[normalizedPath]) {
			return false;
		}
		const normalizedEdit: PendingEdit = {
			...edit,
			filePath: normalizedPath,
			reviewedChanges: edit.reviewedChanges ?? {},
		};
		set({
			pendingEdits: {
				...pendingEdits,
				[normalizedPath]: normalizedEdit,
			},
		});
		return true;
	},
	updatePendingEditReview: (filePath, changeId, status) => {
		const normalizedPath = normalizeRelativePath(filePath, { keepRootEmpty: true });
		set((state) => {
			const existing = state.pendingEdits[normalizedPath];
			if (!existing) return state;
			return {
				pendingEdits: {
					...state.pendingEdits,
					[normalizedPath]: {
						...existing,
						reviewedChanges: {
							...(existing.reviewedChanges ?? {}),
							[changeId]: status,
						},
					},
				},
			};
		});
	},
	setPendingEditReviewMap: (filePath, reviewMap) => {
		const normalizedPath = normalizeRelativePath(filePath, { keepRootEmpty: true });
		set((state) => {
			const existing = state.pendingEdits[normalizedPath];
			if (!existing) return state;
			return {
				pendingEdits: {
					...state.pendingEdits,
					[normalizedPath]: {
						...existing,
						reviewedChanges: { ...reviewMap },
					},
				},
			};
		});
	},
	clearPendingEdit: (filePath) => {
		const normalizedPath = normalizeRelativePath(filePath, { keepRootEmpty: true });
		set((state) => {
			if (!state.pendingEdits[normalizedPath]) return state;
			const next = { ...state.pendingEdits };
			delete next[normalizedPath];
			return { pendingEdits: next };
		});
	},
});
