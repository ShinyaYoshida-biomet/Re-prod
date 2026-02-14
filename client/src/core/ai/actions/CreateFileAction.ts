import type { CodeBlock } from "@/types";
import { isEmptyString } from "@/utils/string";
import { EDITOR_BUFFER_PLACEHOLDER_PATTERNS } from "@/constants/placeholders";
import type { CodeActionContext, CodeActionValidation, ICodeAction } from "./ICodeAction";

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
		if (isEmptyString(codeBlock.filepath)) {
			return {
				valid: false,
				error: "Create file requires a filepath",
			};
		}

		// Check for placeholder/invalid paths
		if (
			EDITOR_BUFFER_PLACEHOLDER_PATTERNS.some((pattern) => codeBlock.filepath?.includes(pattern))
		) {
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

		if (isEmptyString(codeBlock.code)) {
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
