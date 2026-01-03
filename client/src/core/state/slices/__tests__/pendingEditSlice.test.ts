import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import {
	createPendingEditSlice,
	type PendingEditState,
} from "@/core/state/slices/pendingEditSlice";
import type { PendingEdit } from "@/types/pendingEdit";

const makeEdit = (filePath: string): PendingEdit => ({
	id: "edit-1",
	source: { type: "acp", sessionId: "s-1" },
	filePath,
	oldContent: "old",
	newContent: "new",
	unifiedDiff: "",
	baseHash: "",
	expectedSha: null,
	status: "pending",
	createdAt: 0,
});

function createTestStore() {
	return createStore<PendingEditState>()((...args) => createPendingEditSlice(...args));
}

describe("pendingEditSlice", () => {
	it("normalizes file paths on register", () => {
		const store = createTestStore();
		const edit = makeEdit("/foo//bar.R");

		const registered = store.getState().registerPendingEdit(edit);
		expect(registered).toBe(true);
		expect(store.getState().pendingEdits["foo/bar.R"]).toBeTruthy();
		expect(store.getState().pendingEdits["foo/bar.R"]?.filePath).toBe("foo/bar.R");
	});

	it("normalizes file paths on update and clear", () => {
		const store = createTestStore();
		const edit = makeEdit("foo/bar.R");

		store.getState().registerPendingEdit(edit);
		store.getState().updatePendingEditStatus("/foo/bar.R", "accepted");
		expect(store.getState().pendingEdits["foo/bar.R"]?.status).toBe("accepted");

		store.getState().clearPendingEdit("/foo/bar.R");
		expect(store.getState().pendingEdits["foo/bar.R"]).toBeUndefined();
	});
});
