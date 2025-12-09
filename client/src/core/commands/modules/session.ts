import { commandRegistry } from "../registry";
import { useStore } from "@/core/state/store";
import { exportSessionSnapshot, importSessionSnapshot } from "@/services/sessionPersistence";

export function setupSessionCommands() {
	commandRegistry.registerMany([
		{
			id: "session.showTimeline",
			title: "Timeline...",
			category: "Session",
			keybinding: "Mod+T",
			execute: () => {
				const { timelinePanelRef } = useStore.getState();
				if (timelinePanelRef) {
					timelinePanelRef.scrollIntoView();
				} else {
				}
			},
		},
		{
			id: "session.new",
			title: "New Session",
			category: "Session",
			keybinding: "Mod+Shift+N",
			execute: () => {
				if (!confirm("Start new session? Unsaved work will be lost.")) {
					return;
				}
				window.location.reload();
			},
		},
		{
			id: "session.save",
			title: "Save Session...",
			category: "Session",
			execute: () => {
				exportSessionSnapshot();
			},
		},
		{
			id: "session.load",
			title: "Load Session...",
			category: "Session",
			execute: () => {
				importSessionSnapshot();
			},
		},
		{
			id: "session.exportReproducible",
			title: "Export Reproducible Session...",
			category: "Session",
			execute: () => {
				useStore.getState().setModalOpen("export", true);
			},
		},
		{
			id: "session.info",
			title: "Session Info",
			category: "Session",
			execute: () => {
				useStore.getState().setModalOpen("sessionInfo", true);
			},
		},
		{
			id: "session.settings",
			title: "Settings...",
			category: "Session",
			keybinding: "Mod+,",
			execute: () => {
				useStore.getState().setModalOpen("settings", true);
			},
		},
	]);
}
