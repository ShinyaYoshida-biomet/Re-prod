import { ZOOM } from "@/constants/ui";
import { useStore } from "@/core/state/store";
import { commandRegistry } from "../registry";

export function setupViewCommands() {
	commandRegistry.registerMany([
		{
			id: "view.toggleFiles",
			title: "Show/Hide Files Pane",
			category: "View",
			keybinding: "Mod+Shift+E",
			execute: () => {
				useStore.getState().togglePaneVisibility("files");
			},
			checked: () => useStore.getState().view.panes.files,
		},
		{
			id: "view.toggleEditor",
			title: "Show/Hide Editor",
			category: "View",
			keybinding: "Mod+1",
			execute: () => {
				useStore.getState().togglePaneVisibility("editor");
			},
			checked: () => useStore.getState().view.panes.editor,
		},
		{
			id: "view.toggleAssistant",
			title: "Show/Hide AI Assistant",
			category: "View",
			keybinding: "Mod+2",
			execute: () => {
				useStore.getState().togglePaneVisibility("assistant");
			},
			checked: () => useStore.getState().view.panes.assistant,
		},
		{
			id: "view.zoomIn",
			title: "Zoom In",
			category: "View",
			keybinding: "Mod++",
			execute: () => {
				useStore.getState().adjustZoom(ZOOM.STEP);
			},
		},
		{
			id: "view.zoomOut",
			title: "Zoom Out",
			category: "View",
			keybinding: "Mod+-",
			execute: () => {
				useStore.getState().adjustZoom(-ZOOM.STEP);
			},
		},
		{
			id: "view.zoomReset",
			title: "Reset Zoom",
			category: "View",
			keybinding: "Mod+0",
			execute: () => {
				useStore.getState().resetZoom();
			},
		},
		{
			id: "view.focusTerminal",
			title: "Focus Terminal",
			category: "View",
			keybinding: "Mod+Backquote",
			execute: () => {
				window.dispatchEvent(new Event("terminal:focus"));
			},
		},
		{
			id: "view.newTerminalSession",
			title: "New Terminal Session",
			category: "View",
			keybinding: "Mod+Shift+T",
			execute: () => {
				window.dispatchEvent(new Event("terminal:focus"));
				window.dispatchEvent(new Event("terminal:new"));
			},
		},
	]);
}
