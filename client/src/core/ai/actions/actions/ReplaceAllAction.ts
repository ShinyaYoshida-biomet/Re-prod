import type { CodeBlock } from "@/types";
import { isEmptyString } from "@/utils/string";
import type { CodeActionContext, CodeActionValidation, ICodeAction } from "../ICodeAction";
/**
 * Action for replacing entire file contents
 */
export class ReplaceAllAction implements ICodeAction {
	getLabel(codeBlock: CodeBlock): string {
		const targetFile = codeBlock.filepath || "active editor";
		return `Replace entire ${targetFile}`;
	}

	validate(codeBlock: CodeBlock): CodeActionValidation {
		if (isEmptyString(codeBlock.code)) {
			return {
				valid: false,
				error: "Cannot replace with empty content",
			};
		}

		return { valid: true };
	}

	async apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void> {
		const validation = this.validate(codeBlock);
		if (!validation.valid) {
			throw new Error(validation.error || "Invalid replace-all action");
		}

		const targetFile = codeBlock.filepath;
		const isCurrentEditor = this.isCurrentEditor(targetFile, context.editorFilepath);

		if (isCurrentEditor && context.applyToEditor) {
			await context.applyToEditor(codeBlock);
			context.postMessage?.(`Replaced entire ${targetFile || "active editor"}`);
		} else if (targetFile && context.applyToFile) {
			await context.applyToFile(codeBlock);
			context.postMessage?.(`Replaced entire ${targetFile}`);
		} else {
			throw new Error("No suitable apply method available for replace-all");
		}
	}

	private isCurrentEditor(
		targetFile: string | undefined,
		editorFilepath: string | null | undefined,
	): boolean {
		if (!targetFile) return true;

		const placeholderPatterns = [
			"<current editor buffer>",
			"current editor buffer",
			"current_editor_buffer",
		];

		return (
			placeholderPatterns.some((pattern) => targetFile.includes(pattern)) ||
			targetFile.startsWith("<") ||
			targetFile === editorFilepath
		);
	}
}
