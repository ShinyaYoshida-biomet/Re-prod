import type { CodeBlock } from "@/types";
import { BaseCodeAction } from "../BaseCodeAction";
import type { CodeActionContext, CodeActionValidation } from "../ICodeAction";

/**
 * Action for inserting code at a specific position
 */
export class InsertAction extends BaseCodeAction {
	getLabel(codeBlock: CodeBlock): string {
		return `Insert code in ${this.getTargetFile(codeBlock)}`;
	}

	protected validateSpecific(_codeBlock: CodeBlock): CodeActionValidation {
		// Base class already validates non-empty code
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
