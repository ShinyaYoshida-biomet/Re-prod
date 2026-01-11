import { useStore } from "@/core/state/store";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for editor commands.
 */
function getCommandState(): CommandStateSnapshot {
	const state = useStore.getState();
	return {
		isEditorDirty: state.getActiveBuffer()?.isDirty ?? false,
		isExecutionRunning: state.execution?.isRunning ?? false,
		viewPanes: state.view.panes,
		hasActiveEditor: state.monacoEditor !== null,
		isEditorFocused: state.monacoEditor !== null,
	};
}

export function setupEditorCommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("editor.closeBuffer", "Close Buffer")
		.category("Editor")
		.keybinding("Mod+W")
		.handler(() => {
			const store = useStore.getState();
			const activeBuffer = store.getActiveBuffer();
			if (!activeBuffer) return;
			if (activeBuffer.isDirty && !confirm("Discard unsaved changes?")) {
				return;
			}
			store.removeBuffer(activeBuffer.id);
		})

		.command("editor.nextBuffer", "Next Buffer")
		.category("Editor")
		.keybinding("Mod+Shift+]")
		.handler(() => {
			const store = useStore.getState();
			const { buffers, activeBufferId } = store.editor;
			if (buffers.length === 0) return;
			const currentIndex = buffers.findIndex((buffer) => buffer.id === activeBufferId);
			const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % buffers.length : 0;
			store.setActiveBuffer(buffers[nextIndex].id);
		})

		.command("editor.previousBuffer", "Previous Buffer")
		.category("Editor")
		.keybinding("Mod+Shift+[")
		.handler(() => {
			const store = useStore.getState();
			const { buffers, activeBufferId } = store.editor;
			if (buffers.length === 0) return;
			const currentIndex = buffers.findIndex((buffer) => buffer.id === activeBufferId);
			const prevIndex =
				currentIndex >= 0
					? (currentIndex - 1 + buffers.length) % buffers.length
					: buffers.length - 1;
			store.setActiveBuffer(buffers[prevIndex].id);
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
