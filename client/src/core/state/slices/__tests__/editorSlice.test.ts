import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { createEditorSlice, type Buffer, type EditorState } from "@/core/state/slices/editorSlice";

const makeBuffer = (overrides: Partial<Buffer> = {}): Buffer => ({
	id: overrides.id ?? "buffer-1",
	filepath: overrides.filepath ?? null,
	content: overrides.content ?? "",
	isDirty: overrides.isDirty ?? false,
	cursorPosition: overrides.cursorPosition ?? { line: 1, column: 1 },
	displayName: overrides.displayName,
});

const createTestStore = () => createStore<EditorState>()((...args) => createEditorSlice(...args));

describe("editorSlice", () => {
	it("adds a buffer and sets it active", () => {
		const store = createTestStore();
		const buffer = makeBuffer({ id: "buffer-new", content: "x <- 1" });

		store.getState().addBuffer(buffer);

		const state = store.getState();
		expect(state.editor.buffers).toContainEqual(buffer);
		expect(state.editor.activeBufferId).toBe("buffer-new");
	});

	it("updates buffer content and dirty state", () => {
		const store = createTestStore();
		const [first] = store.getState().editor.buffers;

		store.getState().updateBuffer(first.id, { content: "y <- 2", isDirty: true });

		const updated = store.getState().getBufferById(first.id);
		expect(updated?.content).toBe("y <- 2");
		expect(updated?.isDirty).toBe(true);
	});

	it("selects the next buffer when removing the active buffer", () => {
		const store = createTestStore();
		const first = store.getState().editor.buffers[0];
		const second = makeBuffer({ id: "buffer-2", filepath: "file.R" });
		store.getState().addBuffer(second);
		store.getState().setActiveBuffer(first.id);

		store.getState().removeBuffer(first.id);

		const state = store.getState();
		expect(state.editor.buffers).toHaveLength(1);
		expect(state.editor.activeBufferId).toBe(second.id);
	});

	it("finds buffers by filepath", () => {
		const store = createTestStore();
		const buffer = makeBuffer({ id: "buffer-3", filepath: "foo/bar.R" });

		store.getState().addBuffer(buffer);

		expect(store.getState().getBufferByFilepath("foo/bar.R")?.id).toBe("buffer-3");
	});
});
