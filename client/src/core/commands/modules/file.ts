import { DEFAULT_FILENAMES } from "@/constants/ui";
import { DEFAULT_R_SCRIPT } from "@/core/state/slices/editorSlice";
import { useStore } from "@/core/state/store";
import { socketService } from "@/services/socket";
import { downloadFile, openFile } from "@/utils/fileOperations";
import { openFolder } from "@/utils/folderOperations";
import { commandRegistry } from "../registry";

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
				} catch (error) {}
			},
		},
		{
			id: "file.openFolder",
			title: "Open Folder...",
			category: "File",
			keybinding: "Mod+Shift+O",
			execute: async () => {
				try {
					const folderPath = await openFolder();
					if (!folderPath) return;
					socketService.send({
						type: "project_switch_folder",
						path: folderPath,
					});
				} catch (error) {}
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
					return;
				}

				downloadFile(DEFAULT_FILENAMES.UNTITLED_R_SCRIPT, content);
			},
		},
	]);
}
