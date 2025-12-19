import { commandRegistry } from "../registry";
import { useStore } from "@/core/state/store";
import { interruptExecution, restartSession } from "@/services/executionService";

export function setupCodeCommands() {
	commandRegistry.registerMany([
		{
			id: "code.runSelection",
			title: "Run Current Line/Selection",
			category: "Code",
			keybinding: "Mod+Enter",
			execute: () => {
				const runCurrentCell = useStore.getState().runCurrentCell;
				if (runCurrentCell) {
					runCurrentCell();
				} else {
				}
			},
		},
		{
			id: "code.runAll",
			title: "Run All",
			category: "Code",
			keybinding: "Mod+Shift+Enter",
			execute: () => {
				const runAll = useStore.getState().runAll;
				if (runAll) {
					runAll();
				} else {
				}
			},
		},
		{
			id: "code.sourceFile",
			title: "Source File",
			category: "Code",
			execute: () => {
				// Same as runAll for now
				commandRegistry.execute("code.runAll");
			},
		},
		{
			id: "code.interrupt",
			title: "Interrupt R",
			category: "Code",
			keybinding: "Esc",
			execute: () => {
				const store = useStore.getState();
				if (!store.execution.isRunning) {
					return;
				}
				void interruptExecution().catch(() => {});
			},
			enabled: () => useStore.getState().execution.isRunning,
		},
		{
			id: "code.restartSession",
			title: "Restart R Session",
			category: "Code",
			keybinding: "Mod+Shift+0",
			execute: () => {
				if (!confirm("Restart R session? All workspace variables will be lost.")) {
					return;
				}
				void restartSession().catch(() => {
					window.alert("Unable to restart session. Check logs for details.");
				});
			},
		},
		{
			id: "code.comment",
			title: "Comment/Uncomment Lines",
			category: "Code",
			keybinding: "Mod+/",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "editor.action.commentLine", null);
				}
			},
		},
	]);
}
