import { useMemo } from "react";
import { useStore } from "@/core";
import { buildMenuSections } from "@/core/menu/menuConfig";
import { MenuResolver } from "@/core/menu/resolvers";

/**
 * React hook that provides menu sections resolved against current application state.
 * Uses the Composite + Builder + Specification patterns to separate menu structure
 * from state evaluation logic.
 */
export function useMenuSections() {
	const isEditorDirty = useStore((state) => state.getActiveBuffer()?.isDirty ?? false);
	const isExecutionRunning = useStore((state) => state.execution?.isRunning ?? false);
	const viewPanes = useStore((state) => state.view.panes);

	return useMemo(() => {
		const menuStructure = buildMenuSections();
		return MenuResolver.resolve(menuStructure, {
			isEditorDirty,
			isExecutionRunning,
			viewPanes,
		});
	}, [isEditorDirty, isExecutionRunning, viewPanes]);
}
