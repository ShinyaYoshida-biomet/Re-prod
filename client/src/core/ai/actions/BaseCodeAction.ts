import type { CodeBlock } from "@/types";
import type { CodeActionContext, CodeActionValidation, ICodeAction } from "./ICodeAction";
import { isEmptyString } from "@/utils/string";

/**
 * Abstract base class for code actions.
 * Provides common validation logic and helper methods to reduce duplication.
 */
export abstract class BaseCodeAction implements ICodeAction {
	/**
	 * Get a human-readable label for this action.
	 * Must be implemented by subclasses.
	 */
	abstract getLabel(codeBlock: CodeBlock): string;

	/**
	 * Perform action-specific validation.
	 * Must be implemented by subclasses.
	 */
	protected abstract validateSpecific(codeBlock: CodeBlock): CodeActionValidation;

	/**
	 * Apply the code action.
	 * Must be implemented by subclasses.
	 */
	abstract apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void>;

	/**
	 * Validate the code block.
	 * Performs common validation, then delegates to validateSpecific().
	 */
	validate(codeBlock: CodeBlock): CodeActionValidation {
		// Common validation: check if code content is required
		if (this.requiresCode() && isEmptyString(codeBlock.code)) {
			return {
				valid: false,
				error: "Cannot apply action with empty content",
			};
		}

		// Delegate to subclass for specific validation
		return this.validateSpecific(codeBlock);
	}

	/**
	 * Whether this action requires non-empty code content.
	 * Override in subclasses if needed (e.g., delete-range doesn't need code).
	 */
	protected requiresCode(): boolean {
		return true;
	}

	/**
	 * Check if the target file represents the current editor.
	 */
	protected isCurrentEditor(
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

	/**
	 * Get target file description for display.
	 */
	protected getTargetFile(codeBlock: CodeBlock): string {
		return codeBlock.filepath || "active editor";
	}

	/**
	 * Validate that targetRange exists and is valid.
	 */
	protected validateTargetRange(codeBlock: CodeBlock): CodeActionValidation {
		if (!codeBlock.targetRange) {
			return {
				valid: false,
				error: "Action requires targetRange specification",
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

	/**
	 * Apply action using appropriate context method.
	 * Throws error if validation fails or no suitable apply method is available.
	 */
	protected async applyWithValidation(
		codeBlock: CodeBlock,
		context: CodeActionContext,
		successMessage: string,
	): Promise<void> {
		const validation = this.validate(codeBlock);
		if (!validation.valid) {
			throw new Error(validation.error || "Invalid code action");
		}

		const targetFile = codeBlock.filepath;
		const isCurrentEditor = this.isCurrentEditor(targetFile, context.editorFilepath);

		if (isCurrentEditor && context.applyToEditor) {
			await context.applyToEditor(codeBlock);
			context.postMessage?.(successMessage);
		} else if (targetFile && context.applyToFile) {
			await context.applyToFile(codeBlock);
			context.postMessage?.(successMessage);
		} else {
			throw new Error("No suitable apply method available for this action");
		}
	}
}
