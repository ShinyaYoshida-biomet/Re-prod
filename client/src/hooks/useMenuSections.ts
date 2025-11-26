import { useMemo } from "react";
import { useStore } from "@/core";
import { buildMenuSections } from "@/core/menu/menuConfig";

export function useMenuSections() {
	const isEditorDirty = useStore((state) => state.editor?.isDirty ?? false);
	const isExecutionRunning = useStore((state) => state.execution?.isRunning ?? false);
	const viewPanes = useStore((state) => state.view.panes);

	return useMemo(
		() =>
			buildMenuSections({
				isEditorDirty,
				isExecutionRunning,
				viewPanes,
			}),
		[isEditorDirty, isExecutionRunning, viewPanes],
	);
}
