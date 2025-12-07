import { commandRegistry } from "../registry";
import { useStore } from "@/core/state/store";

export function setupEditCommands() {
	commandRegistry.registerMany([
		{
			id: "edit.undo",
			title: "Undo",
			category: "Edit",
			keybinding: "Mod+Z",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "undo", null);
				}
			},
		},
		{
			id: "edit.redo",
			title: "Redo",
			category: "Edit",
			keybinding: "Mod+Shift+Z",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "redo", null);
				}
			},
		},
		{
			id: "edit.cut",
			title: "Cut",
			category: "Edit",
			keybinding: "Mod+X",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "editor.action.clipboardCutAction", null);
				}
			},
		},
		{
			id: "edit.copy",
			title: "Copy",
			category: "Edit",
			keybinding: "Mod+C",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "editor.action.clipboardCopyAction", null);
				}
			},
		},
		{
			id: "edit.paste",
			title: "Paste",
			category: "Edit",
			keybinding: "Mod+V",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "editor.action.clipboardPasteAction", null);
				}
			},
		},
		{
			id: "edit.find",
			title: "Find...",
			category: "Edit",
			keybinding: "Mod+F",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "actions.find", null);
				}
			},
		},
		{
			id: "edit.replace",
			title: "Replace...",
			category: "Edit",
			keybinding: "Mod+H",
			execute: () => {
				const editor = useStore.getState().monacoEditor;
				if (editor?.trigger) {
					editor.trigger("menu", "editor.action.startFindReplaceAction", null);
				}
			},
		},
	]);
}
