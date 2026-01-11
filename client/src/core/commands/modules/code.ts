import { useStore } from "@/core/state/store";
import { interruptExecution, restartSession } from "@/services/executionService";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import { When } from "../specifications";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for code commands.
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

export function setupCodeCommands() {
	const commandsWithConditions = CommandBuilder.create()
		.command("code.runSelection", "Run Current Line/Selection")
		.category("Code")
		.keybinding("Mod+Enter")
		.handler(() => {
			const runCurrentCell = useStore.getState().runCurrentCell;
			if (runCurrentCell) {
				runCurrentCell();
			}
		})

		.command("code.runAll", "Run All")
		.category("Code")
		.keybinding("Mod+Shift+Enter")
		.handler(() => {
			const runAll = useStore.getState().runAll;
			if (runAll) {
				runAll();
			}
		})

		.command("code.sourceFile", "Source File")
		.category("Code")
		.handler(() => {
			// Same as runAll for now
			commandRegistry.execute("code.runAll");
		})

		.command("code.interrupt", "Interrupt R")
		.category("Code")
		.keybinding("Esc")
		.enabledWhen(When.ExecutionIsRunning)
		.handler(() => {
			const store = useStore.getState();
			if (!store.execution.isRunning) {
				return;
			}
			void interruptExecution().catch(() => {});
		})

		.command("code.restartSession", "Restart R Session")
		.category("Code")
		.keybinding("Mod+Shift+0")
		.handler(() => {
			if (!confirm("Restart R session? All workspace variables will be lost.")) {
				return;
			}
			void restartSession().catch(async () => {
				const { showError } = await import("@/services/toastService");
				showError("Unable to restart session. Check logs for details.");
			});
		})

		.command("code.comment", "Comment/Uncomment Lines")
		.category("Code")
		.keybinding("Mod+/")
		.handler(() => {
			const editor = useStore.getState().monacoEditor;
			if (editor?.trigger) {
				editor.trigger("menu", "editor.action.commentLine", null);
			}
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
