import { ZOOM } from "@/constants/ui";
import { useStore } from "@/core/state/store";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import { IsViewPaneVisible } from "../specifications";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for view commands.
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

export function setupViewCommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("view.toggleFiles", "Show/Hide Files Pane")
		.category("View")
		.keybinding("Mod+Shift+E")
		.checkedWhen(new IsViewPaneVisible("files"))
		.handler(() => {
			useStore.getState().togglePaneVisibility("files");
		})

		.command("view.toggleEditor", "Show/Hide Editor")
		.category("View")
		.keybinding("Mod+1")
		.checkedWhen(new IsViewPaneVisible("editor"))
		.handler(() => {
			useStore.getState().togglePaneVisibility("editor");
		})

		.command("view.toggleAssistant", "Show/Hide AI Assistant")
		.category("View")
		.keybinding("Mod+2")
		.checkedWhen(new IsViewPaneVisible("assistant"))
		.handler(() => {
			useStore.getState().togglePaneVisibility("assistant");
		})

		.command("view.zoomIn", "Zoom In")
		.category("View")
		.keybinding("Mod++")
		.handler(() => {
			useStore.getState().adjustZoom(ZOOM.STEP);
		})

		.command("view.zoomOut", "Zoom Out")
		.category("View")
		.keybinding("Mod+-")
		.handler(() => {
			useStore.getState().adjustZoom(-ZOOM.STEP);
		})

		.command("view.zoomReset", "Reset Zoom")
		.category("View")
		.keybinding("Mod+0")
		.handler(() => {
			useStore.getState().resetZoom();
		})

		.command("view.focusTerminal", "Focus Terminal")
		.category("View")
		.keybinding("Mod+Backquote")
		.handler(() => {
			window.dispatchEvent(new Event("terminal:focus"));
		})

		.command("view.newTerminalSession", "New Terminal Session")
		.category("View")
		.keybinding("Mod+Shift+T")
		.handler(() => {
			window.dispatchEvent(new Event("terminal:focus"));
			window.dispatchEvent(new Event("terminal:new"));
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
