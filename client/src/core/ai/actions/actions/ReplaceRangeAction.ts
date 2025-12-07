import type { CodeBlock } from "@shared/types";
import type { CodeActionContext, CodeActionValidation, ICodeAction } from "../ICodeAction";

/**
 * Action for replacing a specific range of code
 */
export class ReplaceRangeAction implements ICodeAction {
	getLabel(codeBlock: CodeBlock): string {
		const targetFile = codeBlock.filepath || "active editor";

		if (!codeBlock.targetRange) {
			return `Replace code in ${targetFile}`;
		}

		const { startLine, startColumn, endLine, endColumn } = codeBlock.targetRange;
		return `Replace ${targetFile} ${startLine}:${startColumn}-${endLine}:${endColumn}`;
	}

	validate(codeBlock: CodeBlock): CodeActionValidation {
		if (!codeBlock.targetRange) {
			return {
				valid: false,
				error: "Replace range requires targetRange specification",
			};
		}

		const { startLine, startColumn, endLine, endColumn } = codeBlock.targetRange;

		if (startLine < 0 || endLine < 0 || startColumn < 0 || endColumn < 0) {
			return {
				valid: false,
				error: "Range coordinates must be non-negative",
			};
		}

		if (startLine > endLine || (startLine === endLine && startColumn > endColumn)) {
			return {
				valid: false,
				error: "Invalid range: start position must be before end position",
			};
		}

		return { valid: true };
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
