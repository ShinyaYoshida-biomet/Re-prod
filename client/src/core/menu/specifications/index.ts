export type { Condition } from "./Condition";
export {
	AlwaysTrue,
	AndCondition,
	OrCondition,
	NotCondition,
} from "./Condition";
export { IsEditorDirty } from "./IsEditorDirty";
export { IsExecutionRunning } from "./IsExecutionRunning";
export { IsViewPaneVisible } from "./IsViewPaneVisible";

/**
 * Convenience factory for common conditions.
 */
export const When = {
	EditorIsDirty: new (class extends IsEditorDirty {})(),
	ExecutionIsRunning: new (class extends IsExecutionRunning {})(),
	Always: new (class extends AlwaysTrue {})(),
};

import { IsEditorDirty } from "./IsEditorDirty";
import { IsExecutionRunning } from "./IsExecutionRunning";
import { AlwaysTrue } from "./Condition";
