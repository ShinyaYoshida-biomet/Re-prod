import { commandRegistry } from "../registry";
import { useStore } from "@/core/state/store";
import {
	interruptExecution,
	restartSession as restartSessionRequest,
} from "@/services/sessionControl";

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
					console.error("Code execution not available: EditorPanel not mounted");
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
					console.error("Code execution not available: EditorPanel not mounted");
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
				void interruptExecution().catch((error) => {
					console.error("Failed to interrupt execution", error);
				});
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
				void restartSessionRequest().catch((error) => {
					console.error("Failed to restart session", error);
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
