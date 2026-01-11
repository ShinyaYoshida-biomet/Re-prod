import type { MenuStateSnapshot } from "../menuConfig";
import type { Condition } from "./Condition";

/**
 * Condition: Editor has unsaved changes.
 */
export class IsEditorDirty implements Condition {
	isSatisfiedBy(context: MenuStateSnapshot): boolean {
		return context.isEditorDirty;
	}
}
