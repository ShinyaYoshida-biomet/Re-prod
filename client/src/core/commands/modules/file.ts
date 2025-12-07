import { commandRegistry } from "../registry";
import { useStore } from "@/core/state/store";
import { DEFAULT_FILENAMES } from "@/constants/ui";
import { DEFAULT_R_SCRIPT } from "@/core/state/slices/editorSlice";
import { downloadFile, openFile } from "@/utils/fileOperations";

export function setupFileCommands() {
	commandRegistry.registerMany([
		{
			id: "file.new",
			title: "New R Script",
			category: "File",
			keybinding: "Mod+N",
			execute: () => {
				const store = useStore.getState();
				const isDirty = store.editor?.isDirty;

				if (isDirty) {
					if (!confirm("Discard unsaved changes?")) {
						return;
					}
				}

				store.setEditorContent(DEFAULT_R_SCRIPT);
				store.setEditorFilepath(DEFAULT_FILENAMES.NEW_R_SCRIPT);
				store.setEditorIsDirty(false);
			},
		},
		{
			id: "file.open",
			title: "Open...",
			category: "File",
			keybinding: "Mod+O",
			execute: async () => {
				try {
					const file = await openFile(".R,.Rmd");
					if (!file) return;

					const content = await file.text();
					const store = useStore.getState();
					store.setEditorContent(content);
					store.setEditorFilepath(file.name);
					store.setEditorIsDirty(false);
				} catch (error) {
					console.error(`Failed to open file: ${error}`);
				}
			},
		},
		{
			id: "file.save",
			title: "Save",
			category: "File",
			keybinding: "Mod+S",
			execute: () => {
				const store = useStore.getState();
				const { filepath, content } = store.editor || {};

				if (!filepath) {
					return commandRegistry.execute("file.saveAs");
				}

				if (!content) {
					console.error("No content to save");
					return;
				}

				downloadFile(filepath, content);
				store.setEditorIsDirty(false);
			},
			enabled: () => useStore.getState().editor?.isDirty ?? false,
		},
		{
			id: "file.saveAs",
			title: "Save As...",
			category: "File",
			keybinding: "Mod+Shift+S",
			execute: () => {
				const store = useStore.getState();
				const { content } = store.editor || {};

				if (!content) {
					console.error("No content to save");
					return;
				}

				downloadFile(DEFAULT_FILENAMES.UNTITLED_R_SCRIPT, content);
			},
		},
		{
			id: "file.projects",
			title: "Projects...",
			category: "File",
			execute: () => {
				useStore.getState().setModalOpen("projects", true);
			},
		},
	]);
}
