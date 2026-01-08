import { DEFAULT_FILENAMES } from "@/constants/ui";
import { DEFAULT_R_SCRIPT, type Buffer } from "@/core/state/slices/editorSlice";
import { createBufferId } from "@/core/state/utils/createBufferId";
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
				const untitledCount = store.editor.buffers.filter((buffer) =>
					buffer.displayName?.startsWith("Untitled"),
				).length;
				const buffer: Buffer = {
					id: createBufferId(),
					filepath: null,
					content: DEFAULT_R_SCRIPT,
					isDirty: true,
					cursorPosition: { line: 1, column: 1 },
					displayName: `Untitled-${untitledCount + 1}`,
				};
				store.addBuffer(buffer);
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
					const existing = store.getBufferByFilepath(file.name);
					if (existing) {
						store.setActiveBuffer(existing.id);
						return;
					}
					const buffer: Buffer = {
						id: createBufferId(),
						filepath: file.name,
						content,
						isDirty: false,
						cursorPosition: { line: 1, column: 1 },
					};
					store.addBuffer(buffer);
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
				const activeBuffer = store.getActiveBuffer();

				if (!activeBuffer) {
					return;
				}

				if (!activeBuffer.filepath) {
					return commandRegistry.execute("file.saveAs");
				}

				if (!activeBuffer.content) {
					return;
				}

				downloadFile(activeBuffer.filepath, activeBuffer.content);
				store.updateBuffer(activeBuffer.id, { isDirty: false });
			},
			enabled: () => useStore.getState().getActiveBuffer()?.isDirty ?? false,
		},
		{
			id: "file.saveAs",
			title: "Save As...",
			category: "File",
			keybinding: "Mod+Shift+S",
			execute: () => {
				const store = useStore.getState();
				const activeBuffer = store.getActiveBuffer();

				if (!activeBuffer?.content) {
					return;
				}

				const filename =
					activeBuffer.filepath || activeBuffer.displayName || DEFAULT_FILENAMES.UNTITLED_R_SCRIPT;
				downloadFile(filename, activeBuffer.content);
				store.updateBuffer(activeBuffer.id, {
					isDirty: false,
					filepath: activeBuffer.filepath ?? filename,
					displayName: activeBuffer.filepath ? activeBuffer.displayName : undefined,
				});
			},
		},
	]);
}
