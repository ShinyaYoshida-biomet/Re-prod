export type { Condition } from "../../specifications/Condition";
export {
	AlwaysTrue,
	AndCondition,
	OrCondition,
	NotCondition,
} from "../../specifications/Condition";

export type { CommandStateSnapshot } from "./CommandStateSnapshot";
export { IsExecutionRunning } from "./IsExecutionRunning";
export { IsViewPaneVisible } from "./IsViewPaneVisible";
export { IsEditorDirty } from "./IsEditorDirty";

import { AlwaysTrue } from "../../specifications/Condition";
import { IsEditorDirty } from "./IsEditorDirty";
import { IsExecutionRunning } from "./IsExecutionRunning";

/**
 * Convenience factory for common command conditions.
 */
export const When = {
	ExecutionIsRunning: new IsExecutionRunning(),
	EditorIsDirty: new IsEditorDirty(),
	Always: new AlwaysTrue(),
};
