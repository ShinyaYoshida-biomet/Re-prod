import type { CodeBlock } from "@shared/types";
import type {
	CodeActionContext,
	CodeActionValidation,
	ICodeAction,
} from "../ICodeAction";

/**
 * Action for inserting code at a specific position
 */
export class InsertAction implements ICodeAction {
	getLabel(codeBlock: CodeBlock): string {
		const targetFile = codeBlock.filepath || "active editor";
		return `Insert code in ${targetFile}`;
	}

	validate(codeBlock: CodeBlock): CodeActionValidation {
		if (!codeBlock.code || codeBlock.code.trim().length === 0) {
			return {
				valid: false,
				error: "Cannot insert empty content",
			};
		}

		return { valid: true };
	}

	async apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void> {
		const validation = this.validate(codeBlock);
		if (!validation.valid) {
			throw new Error(validation.error || "Invalid insert action");
		}

		if (context.applyToEditor) {
			await context.applyToEditor(codeBlock);
			context.postMessage?.(this.getLabel(codeBlock));
		} else {
			throw new Error("Editor apply method not available for insert");
		}
	}
}
