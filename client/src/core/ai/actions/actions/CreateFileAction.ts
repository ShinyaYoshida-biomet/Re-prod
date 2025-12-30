import type { CodeBlock } from "@/types";
import type { CodeActionContext, CodeActionValidation, ICodeAction } from "../ICodeAction";

/**
 * Action for creating a new file with content
 */
export class CreateFileAction implements ICodeAction {
	getLabel(codeBlock: CodeBlock): string {
		if (!codeBlock.filepath) {
			return "Create new file";
		}

		return `Create file ${codeBlock.filepath}`;
	}

	validate(codeBlock: CodeBlock): CodeActionValidation {
		if (!codeBlock.filepath || codeBlock.filepath.trim().length === 0) {
			return {
				valid: false,
				error: "Create file requires a filepath",
			};
		}

		// Check for placeholder/invalid paths
		const invalidPatterns = [
			"<current editor buffer>",
			"current editor buffer",
			"current_editor_buffer",
		];

		if (invalidPatterns.some((pattern) => codeBlock.filepath?.includes(pattern))) {
			return {
				valid: false,
				error: "Cannot create file with placeholder path",
			};
		}

		if (codeBlock.filepath.startsWith("<") || codeBlock.filepath.startsWith(">")) {
			return {
				valid: false,
				error: "Invalid file path format",
			};
		}

		if (!codeBlock.code || codeBlock.code.trim().length === 0) {
			return {
				valid: false,
				error: "Cannot create file with empty content",
			};
		}

		return { valid: true };
	}

	async apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void> {
		const validation = this.validate(codeBlock);
		if (!validation.valid) {
			throw new Error(validation.error || "Invalid create-file action");
		}

		if (context.applyToFile) {
			await context.applyToFile(codeBlock);
			context.postMessage?.(`Created file ${codeBlock.filepath}`);
		} else {
			throw new Error("File apply method not available for create-file");
		}
	}
}
