import { UI_TIMING } from "@/constants/ui";
import { useStore } from "@/core/state/store";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for AI commands.
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

export function setupAICommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("ai.assist", "Ask AI Assistant...")
		.category("AI")
		.keybinding("Mod+K")
		.handler(() => {
			setTimeout(() => {
				const { aiPanelRef } = useStore.getState();
				if (aiPanelRef) {
					aiPanelRef.focusInput();
				}
			}, UI_TIMING.AI_INPUT_FOCUS_DELAY_MS);
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
