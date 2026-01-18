import { IS_TAURI, isTauri } from "@/constants/features";
import { DEFAULT_FILENAMES } from "@/constants/ui";
import { DEFAULT_R_SCRIPT, type Buffer } from "@/core/state/slices/editorSlice";
import { createBufferId } from "@/core/state/utils/createBufferId";
import { useStore } from "@/core/state/store";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { socketService } from "@/services/socket";
import { showError } from "@/services/toastService";
import { getErrorMessage } from "@/utils/error";
import { downloadFile, openFile } from "@/utils/fileOperations";
import { openFolder } from "@/utils/folderOperations";
import type { ExtractServerMessage } from "@/types";
import { CommandBuilder } from "../builders";
import { CommandResolver } from "../resolvers";
import { commandRegistry } from "../registry";
import { When } from "../specifications";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Get current command state snapshot for file commands.
 */
function getCommandState(): CommandStateSnapshot {
	const state = useStore.getState();
	return {
		isEditorDirty: state.getActiveBuffer()?.isDirty ?? false,
		isExecutionRunning: state.execution?.isRunning ?? false,
		viewPanes: state.view.panes,
		hasActiveEditor: state.monacoEditor !== null,
		isEditorFocused: state.monacoEditor !== null,
	};
}

export function setupFileCommands() {
	const openFolderTitle = IS_TAURI ? "Open Folder..." : "Open Project...";

	const commandsWithConditions = CommandBuilder.create()
		.command("file.new", "New R Script")
		.category("File")
		.keybinding("Mod+N")
		.handler(() => {
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
		})

		.command("file.open", "Open...")
		.category("File")
		.keybinding("Mod+O")
		.handler(async () => {
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
			} catch (error) {
				// Ignore file open errors; user may cancel dialog or file may be unreadable.
				// User experience: No file is opened, app continues normally.
			}
		})

		.command("file.openFolder", openFolderTitle)
		.category("File")
		.keybinding("Mod+Shift+O")
		.handler(async () => {
			try {
				if (isTauri()) {
					const folderPath = await openFolder();
					if (!folderPath) return;
					const response = await socketService.sendAndWait(
						{ type: "project_switch_folder", path: folderPath },
						(
							message,
						): message is ExtractServerMessage<"project_opened"> | ExtractServerMessage<"error"> =>
							message.type === "project_opened" || message.type === "error",
					);
					if (response.type === "error") {
						showError(response.message);
						return;
					}
					useFileSystemStore
						.getState()
						.resetAndLoadRoot()
						.catch((error) => {
							showError(getErrorMessage(error, "Failed to refresh file tree"));
						});
					return;
				}
				useStore.getState().setModalOpen("projectSwitch", true);
			} catch (error) {
				showError(getErrorMessage(error, "Failed to open folder"));
			}
		})

		.command("file.save", "Save")
		.category("File")
		.keybinding("Mod+S")
		.enabledWhen(When.EditorIsDirty)
		.handler(() => {
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
		})

		.command("file.saveAs", "Save As...")
		.category("File")
		.keybinding("Mod+Shift+S")
		.handler(() => {
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
		})

		.build();

	// Resolve commands against current state
	const commands = CommandResolver.resolve(commandsWithConditions, getCommandState());

	commandRegistry.registerMany(commands);
}
