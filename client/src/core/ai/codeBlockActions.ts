import type { CodeBlock } from "@shared/types";
import { CodeActionFactory } from "./actions";

/**
 * Get target file description for a code block
 * @deprecated Use CodeActionFactory.getAction(codeBlock).getLabel() instead
 */
export function getCodeActionTarget(codeBlock: CodeBlock): string {
	return codeBlock.filepath || "active editor";
}

/**
 * Get human-readable action label for a code block
 * @deprecated Use CodeActionFactory.getLabel(codeBlock) instead
 */
export function getCodeActionLabel(codeBlock: CodeBlock): string {
	// Delegate to factory pattern
	return CodeActionFactory.getLabel(codeBlock);
}
