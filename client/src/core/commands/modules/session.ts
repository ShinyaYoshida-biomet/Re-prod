import { useStore } from "@/core/state/store";
import { exportSessionSnapshot, importSessionSnapshot } from "@/services/sessionPersistence";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for session commands.
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

export function setupSessionCommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("session.showTimeline", "Timeline...")
		.category("Session")
		.keybinding("Mod+T")
		.handler(() => {
			const { timelinePanelRef } = useStore.getState();
			if (timelinePanelRef) {
				timelinePanelRef.scrollIntoView();
			} else {
			}
		})

		.command("session.new", "New Session")
		.category("Session")
		.keybinding("Mod+Shift+N")
		.handler(() => {
			if (!confirm("Start new session? Unsaved work will be lost.")) {
				return;
			}
			window.location.reload();
		})

		.command("session.save", "Save Session...")
		.category("Session")
		.handler(() => {
			exportSessionSnapshot();
		})

		.command("session.load", "Load Session...")
		.category("Session")
		.handler(() => {
			importSessionSnapshot();
		})

		.command("session.exportReproducible", "Export Reproducible Session...")
		.category("Session")
		.handler(() => {
			useStore.getState().setModalOpen("export", true);
		})

		.command("session.info", "Session Info")
		.category("Session")
		.handler(() => {
			useStore.getState().setModalOpen("sessionInfo", true);
		})

		.command("session.settings", "Settings...")
		.category("Session")
		.keybinding("Mod+,")
		.handler(() => {
			useStore.getState().setModalOpen("settings", true);
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
