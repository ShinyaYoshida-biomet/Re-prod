import type { CodeBlock } from "@/types";
import type { CodeActionContext, CodeActionValidation } from "../ICodeAction";
import { BaseCodeAction } from "../BaseCodeAction";

/**
 * Action for deleting a specific range of code
 */
export class DeleteRangeAction extends BaseCodeAction {
	getLabel(codeBlock: CodeBlock): string {
		const targetFile = codeBlock.filepath || "active editor";

		if (!codeBlock.targetRange) {
			return `Delete code in ${targetFile}`;
		}

		const { startLine, endLine } = codeBlock.targetRange;
		return `Delete ${targetFile} lines ${startLine}-${endLine}`;
	}

	protected requiresCode(): boolean {
		return false;
	}

	protected validateSpecific(codeBlock: CodeBlock): CodeActionValidation {
		const hasRange = Boolean(codeBlock.targetRange);
		const hasStructuredContext = Boolean(
			codeBlock.patchChunks?.length ||
				codeBlock.simpleChanges?.length ||
				(codeBlock.originalCode && codeBlock.originalCode.trim().length > 0),
		);

		if (!hasRange && !hasStructuredContext) {
			return {
				valid: false,
				error: "Delete range requires targetRange or contextual diff data",
			};
		}

		if (!codeBlock.targetRange) {
			return { valid: true };
		}

		return this.validateTargetRange(codeBlock);
	}

	async apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void> {
		const validation = this.validate(codeBlock);
		if (!validation.valid) {
			throw new Error(validation.error || "Invalid delete-range action");
		}

		if (context.applyToEditor) {
			await context.applyToEditor(codeBlock);
			context.postMessage?.(this.getLabel(codeBlock));
		} else {
			throw new Error("Editor apply method not available for delete-range");
		}
	}
}
