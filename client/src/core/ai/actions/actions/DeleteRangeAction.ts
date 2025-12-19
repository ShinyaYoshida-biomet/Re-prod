import type { CodeBlock } from "@/types";
import type { CodeActionContext, CodeActionValidation, ICodeAction } from "../ICodeAction";

/**
 * Action for deleting a specific range of code
 */
export class DeleteRangeAction implements ICodeAction {
	getLabel(codeBlock: CodeBlock): string {
		const targetFile = codeBlock.filepath || "active editor";

		if (!codeBlock.targetRange) {
			return `Delete code in ${targetFile}`;
		}

		const { startLine, endLine } = codeBlock.targetRange;
		return `Delete ${targetFile} lines ${startLine}-${endLine}`;
	}

	validate(codeBlock: CodeBlock): CodeActionValidation {
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

		const { startLine, endLine } = codeBlock.targetRange;

		if (startLine < 0 || endLine < 0) {
			return {
				valid: false,
				error: "Range coordinates must be non-negative",
			};
		}

		if (startLine > endLine) {
			return {
				valid: false,
				error: "Invalid range: start line must be before or equal to end line",
			};
		}

		return { valid: true };
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
