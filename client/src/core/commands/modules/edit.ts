import { useStore } from "@/core/state/store";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for edit commands.
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

export function setupEditCommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("edit.undo", "Undo")
		.category("Edit")
		.keybinding("Mod+Z")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "undo", null);
			}
		})

		.command("edit.redo", "Redo")
		.category("Edit")
		.keybinding("Mod+Shift+Z")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "redo", null);
			}
		})

		.command("edit.cut", "Cut")
		.category("Edit")
		.keybinding("Mod+X")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "editor.action.clipboardCutAction", null);
			}
		})

		.command("edit.copy", "Copy")
		.category("Edit")
		.keybinding("Mod+C")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "editor.action.clipboardCopyAction", null);
			}
		})

		.command("edit.paste", "Paste")
		.category("Edit")
		.keybinding("Mod+V")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "editor.action.clipboardPasteAction", null);
			}
		})

		.command("edit.find", "Find...")
		.category("Edit")
		.keybinding("Mod+F")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "actions.find", null);
			}
		})

		.command("edit.replace", "Replace...")
		.category("Edit")
		.keybinding("Mod+H")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "editor.action.startFindReplaceAction", null);
			}
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
