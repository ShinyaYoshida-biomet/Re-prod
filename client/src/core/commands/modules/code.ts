import { commandRegistry } from "../registry";
import { useStore } from "@/core/state/store";
import { socketService } from "@/services/socket";
import { executionMessages } from "@/services/messageBuilders";
import type { ServerMessage } from "shared";

const interruptMatcher = (message: ServerMessage): boolean =>
	message.type === "execution_interrupted" || message.type === "error";

const restartMatcher = (message: ServerMessage): boolean =>
	message.type === "session_restarted" || message.type === "error";

async function interruptExecution(): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			executionMessages.interrupt(),
			(message) => {
				if (message.type === "execution_interrupted") {
					resolve(message.success);
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
				}
			},
			interruptMatcher,
		);

		if (!didSend) {
			reject(new Error("WebSocket is not connected."));
		}
	});
}

async function restartSession(): Promise<void> {
	return new Promise((resolve, reject) => {
		const didSend = socketService.send(
			executionMessages.restart(),
			(message) => {
				if (message.type === "session_restarted") {
					resolve();
					return;
				}

				if (message.type === "error") {
					reject(new Error(message.message));
				}
			},
			restartMatcher,
		);

		if (!didSend) {
			reject(new Error("WebSocket is not connected."));
		}
	});
}

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
