import { DOCS_URL, GITHUB_ISSUE_URL } from "@/constants/urls";
import { useStore } from "@/core/state/store";
import { commandRegistry } from "../registry";

export function setupHelpCommands() {
	commandRegistry.registerMany([
		{
			id: "help.docs",
			title: "Documentation",
			category: "Help",
			execute: () => {
				window.open(DOCS_URL, "_blank");
			},
		},
		{
			id: "help.shortcuts",
			title: "Keyboard Shortcuts",
			category: "Help",
			execute: () => {
				useStore.getState().setModalOpen("shortcuts", true);
			},
		},
		{
			id: "help.reportIssue",
			title: "Report Issue",
			category: "Help",
			execute: () => {
				window.open(GITHUB_ISSUE_URL, "_blank");
			},
		},
		{
			id: "help.about",
			title: "About Re-prod",
			category: "Help",
			execute: () => {
				useStore.getState().setModalOpen("about", true);
			},
		},
	]);
}
