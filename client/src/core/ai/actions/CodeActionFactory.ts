import type { CodeBlock } from "@/types";
import { getErrorMessage } from "@/utils/error";
import { CreateFileAction } from "./CreateFileAction";
import { DeleteRangeAction } from "./DeleteRangeAction";
import { InsertAction } from "./InsertAction";
import { ReplaceAllAction } from "./ReplaceAllAction";
import { ReplaceRangeAction } from "./ReplaceRangeAction";
import type { ICodeAction } from "./ICodeAction";

/**
 * Factory for creating code action instances based on action type.
 * Implements the Factory Pattern to decouple action creation from usage.
 *
 * Benefits:
 * - Adding new actions only requires creating a new class and registering it here
 * - Consumer code doesn't need to know about concrete action classes
 * - Follows Open/Closed Principle: open for extension, closed for modification
 */
export class CodeActionFactory {
	private static readonly actions = new Map<string, ICodeAction>([
		["replace-all", new ReplaceAllAction()],
		["replace-range", new ReplaceRangeAction()],
		["delete-range", new DeleteRangeAction()],
		["create-file", new CreateFileAction()],
		["insert", new InsertAction()],
	]);

	/**
	 * Get the appropriate action handler for a code block
	 * @param codeBlock - The code block containing the action type
	 * @returns The action handler instance
	 * @throws Error if action type is unknown
	 */
	static getAction(codeBlock: CodeBlock): ICodeAction {
		const action = CodeActionFactory.actions.get(codeBlock.action);

		if (!action) {
			throw new Error(
				`Unknown code action type: ${codeBlock.action}. ` +
					`Supported actions: ${Array.from(CodeActionFactory.actions.keys()).join(", ")}`,
			);
		}

		return action;
	}

	/**
	 * Get a human-readable label for a code block's action
	 * @param codeBlock - The code block to get label for
	 * @returns Descriptive label string
	 */
	static getLabel(codeBlock: CodeBlock): string {
		try {
			const action = CodeActionFactory.getAction(codeBlock);
			return action.getLabel(codeBlock);
		} catch {
			// Intentionally ignored: Unknown action types fall back to generic label.
			// This allows UI to display a reasonable label even for unsupported actions.
			return "Apply suggested change";
		}
	}

	/**
	 * Validate whether a code action can be performed
	 * @param codeBlock - The code block to validate
	 * @returns Validation result
	 */
	static validate(codeBlock: CodeBlock) {
		try {
			const action = CodeActionFactory.getAction(codeBlock);
			return action.validate(codeBlock);
		} catch (error) {
			return {
				valid: false,
				error: getErrorMessage(error, "Unknown validation error"),
			};
		}
	}

	/**
	 * Check if an action type is supported
	 * @param actionType - The action type to check
	 * @returns True if supported, false otherwise
	 */
	static isSupported(actionType: string): boolean {
		return CodeActionFactory.actions.has(actionType);
	}

	/**
	 * Get all supported action types
	 * @returns Array of supported action type strings
	 */
	static getSupportedActions(): string[] {
		return Array.from(CodeActionFactory.actions.keys());
	}
}
