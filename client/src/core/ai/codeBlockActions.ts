import type { CodeBlock } from "@shared/types";

/**
 * Get target file description for a code block
 */
export function getCodeActionTarget(codeBlock: CodeBlock): string {
	return codeBlock.filepath || "active editor";
}

/**
 * Get human-readable action label for a code block
 */
export function getCodeActionLabel(codeBlock: CodeBlock): string {
	const targetFile = getCodeActionTarget(codeBlock);

	if (codeBlock.action === "replace-all") {
		return `Replace entire ${targetFile}`;
	}

	if (codeBlock.action === "replace-range" && codeBlock.targetRange) {
		const { startLine, startColumn, endLine, endColumn } = codeBlock.targetRange;
		return `Replace ${targetFile} ${startLine}:${startColumn}-${endLine}:${endColumn}`;
	}

	if (codeBlock.action === "delete-range" && codeBlock.targetRange) {
		const { startLine, endLine } = codeBlock.targetRange;
		return `Delete ${targetFile} lines ${startLine}-${endLine}`;
	}

	if (codeBlock.action === "create-file" && codeBlock.filepath) {
		return `Create file ${codeBlock.filepath}`;
	}

	if (codeBlock.action === "insert") {
		return `Insert code in ${targetFile}`;
	}

	return "Apply suggested change";
}
