import type { Condition } from "../../specifications/Condition";
import type { CommandStateSnapshot } from "./CommandStateSnapshot";

/**
 * Specification: Check if the active editor buffer has unsaved changes.
 * Used to enable/disable save commands.
 */
export class IsEditorDirty implements Condition<CommandStateSnapshot> {
	isSatisfiedBy(context: CommandStateSnapshot): boolean {
		return context.isEditorDirty;
	}
}
