import type { CodeBlock } from "@/types";
import type { CodeActionContext, CodeActionValidation } from "./ICodeAction";
import { BaseCodeAction } from "./BaseCodeAction";

/**
 * Action for replacing a specific range of code
 */
export class ReplaceRangeAction extends BaseCodeAction {
	getLabel(codeBlock: CodeBlock): string {
		const targetFile = codeBlock.filepath || "active editor";

		if (!codeBlock.targetRange) {
			return `Replace code in ${targetFile}`;
		}

		const { startLine, startColumn, endLine, endColumn } = codeBlock.targetRange;
		return `Replace ${targetFile} ${startLine}:${startColumn}-${endLine}:${endColumn}`;
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
				error: "Replace range requires targetRange or contextual diff data",
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
			throw new Error(validation.error || "Invalid replace-range action");
		}

		if (context.applyToEditor) {
			await context.applyToEditor(codeBlock);
			context.postMessage?.(this.getLabel(codeBlock));
		} else {
			throw new Error("Editor apply method not available for replace-range");
		}
	}
}
