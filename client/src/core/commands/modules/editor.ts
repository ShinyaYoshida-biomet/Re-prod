import { useStore } from "@/core/state/store";
import { commandRegistry } from "../registry";

export function setupEditorCommands() {
	commandRegistry.registerMany([
		{
			id: "editor.closeBuffer",
			title: "Close Buffer",
			category: "Editor",
			keybinding: "Mod+W",
			execute: () => {
				const store = useStore.getState();
				const activeBuffer = store.getActiveBuffer();
				if (!activeBuffer) return;
				if (activeBuffer.isDirty && !confirm("Discard unsaved changes?")) {
					return;
				}
				store.removeBuffer(activeBuffer.id);
			},
		},
		{
			id: "editor.nextBuffer",
			title: "Next Buffer",
			category: "Editor",
			keybinding: "Mod+Shift+]",
			execute: () => {
				const store = useStore.getState();
				const { buffers, activeBufferId } = store.editor;
				if (buffers.length === 0) return;
				const currentIndex = buffers.findIndex((buffer) => buffer.id === activeBufferId);
				const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % buffers.length : 0;
				store.setActiveBuffer(buffers[nextIndex].id);
			},
		},
		{
			id: "editor.previousBuffer",
			title: "Previous Buffer",
			category: "Editor",
			keybinding: "Mod+Shift+[",
			execute: () => {
				const store = useStore.getState();
				const { buffers, activeBufferId } = store.editor;
				if (buffers.length === 0) return;
				const currentIndex = buffers.findIndex((buffer) => buffer.id === activeBufferId);
				const prevIndex =
					currentIndex >= 0
						? (currentIndex - 1 + buffers.length) % buffers.length
						: buffers.length - 1;
				store.setActiveBuffer(buffers[prevIndex].id);
			},
		},
	]);
}
