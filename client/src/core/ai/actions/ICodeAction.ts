import type { CodeBlock } from "@shared/types";

/**
 * Interface for code action strategies.
 * Each concrete action implements how to apply a specific type of code change.
 */
export interface ICodeAction {
	/**
	 * Get a human-readable label describing this action
	 * @param codeBlock - The code block containing action details
	 * @returns A descriptive label for display in UI
	 */
	getLabel(codeBlock: CodeBlock): string;

	/**
	 * Apply the code change to the target
	 * @param codeBlock - The code block containing the change to apply
	 * @param context - Context for applying the change (editor ref, file system, etc.)
	 * @returns Promise that resolves when the change is applied
	 */
	apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void>;

	/**
	 * Validate whether this action can be performed with the given code block
	 * @param codeBlock - The code block to validate
	 * @returns Validation result with success status and optional error message
	 */
	validate(codeBlock: CodeBlock): CodeActionValidation;
}

/**
 * Context provided to code actions for applying changes
 */
export interface CodeActionContext {
	/** Function to apply changes to the current editor */
	applyToEditor?: (codeBlock: CodeBlock) => Promise<void>;

	/** Function to apply changes to remote files */
	applyToFile?: (codeBlock: CodeBlock) => Promise<void>;

	/** Current editor filepath */
	editorFilepath?: string | null;

	/** Callback for posting status messages */
	postMessage?: (message: string, extras?: unknown) => void;
}

/**
 * Result of validating a code action
 */
export interface CodeActionValidation {
	/** Whether the action is valid */
	valid: boolean;

	/** Error message if invalid */
	error?: string;
}
