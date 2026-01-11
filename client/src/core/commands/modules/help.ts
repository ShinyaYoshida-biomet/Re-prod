import { DOCS_URL, GITHUB_ISSUE_URL } from "@/constants/urls";
import { useStore } from "@/core/state/store";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for help commands.
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

export function setupHelpCommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("help.docs", "Documentation")
		.category("Help")
		.handler(() => {
			window.open(DOCS_URL, "_blank");
		})

		.command("help.shortcuts", "Keyboard Shortcuts")
		.category("Help")
		.handler(() => {
			useStore.getState().setModalOpen("shortcuts", true);
		})

		.command("help.reportIssue", "Report Issue")
		.category("Help")
		.handler(() => {
			window.open(GITHUB_ISSUE_URL, "_blank");
		})

		.command("help.about", "About Re-prod")
		.category("Help")
		.handler(() => {
			useStore.getState().setModalOpen("about", true);
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
