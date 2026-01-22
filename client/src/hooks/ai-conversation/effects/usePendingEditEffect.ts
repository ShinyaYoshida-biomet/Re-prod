import { useCallback } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import type { PendingEdit } from "@/types";

export function usePendingEditEffect() {
	const registerPendingEdit = useStore((state) => state.registerPendingEdit);
	const updateBuffer = useStore((state) => state.updateBuffer);
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);

	const activeBufferId = activeBuffer?.id ?? null;
	const editorFilepath = activeBuffer?.filepath ?? "";

	const handlePendingEdit = useCallback(
		(pendingEdit: PendingEdit) => {
			const normalizedEditorPath = normalizeWorkspaceRelativePath(editorFilepath, workspaceRoot, {
				keepRootEmpty: true,
			});

			const registered = registerPendingEdit(pendingEdit);
			if (registered && pendingEdit.filePath === normalizedEditorPath) {
				if (activeBufferId) {
					updateBuffer(activeBufferId, {
						content: pendingEdit.newContent,
						isDirty: true,
					});
				}
			}
		},
		[activeBufferId, editorFilepath, registerPendingEdit, updateBuffer, workspaceRoot],
	);

	return { handlePendingEdit };
}
