import type { CodeBlock, CodeRange } from "@/types";

export type DiffSource = "tool" | "code_block";

export type DiffStatus = "applied" | "no_op" | "conflict" | "error";

export interface DiffArtifact {
	source: DiffSource;
	oldText: string;
	newText: string;
	unifiedDiff?: string;
	status?: DiffStatus;
	path?: string;
}

export type CodeBlockDiffData = {
	diff: DiffArtifact;
	isStale: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const toOptionalString = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

const sliceContent = (content: string, range: CodeRange): string => {
	const lines = content.split(/\r?\n/);
	const startIdx = Math.max(range.startLine - 1, 0);
	const endIdx = Math.min(range.endLine, lines.length);
	const selected = lines.slice(startIdx, endIdx);

	if (selected.length === 0) {
		return "";
	}

	const first = selected[0];
	const last = selected[selected.length - 1];

	selected[0] = first.slice(Math.max(range.startColumn - 1, 0));
	selected[selected.length - 1] = last.slice(0, Math.max(range.endColumn - 1, 0));

	return selected.join("\n");
};

export const extractDiffFromToolOutput = (output: unknown): DiffArtifact | null => {
	if (!isRecord(output)) {
		return null;
	}

	const candidate =
		"result" in output && isRecord(output.result)
			? (output.result as Record<string, unknown>)
			: output;

	if (!("old_text" in candidate) || !("new_text" in candidate)) {
		return null;
	}

	const oldText = String(candidate.old_text ?? "");
	const newText = String(candidate.new_text ?? "");
	return {
		source: "tool",
		oldText,
		newText,
		unifiedDiff: toOptionalString(candidate.unified_diff),
		status: toOptionalString(candidate.status) as DiffStatus | undefined,
		path: toOptionalString(candidate.path),
	};
};

export const buildDiffFromCodeBlock = (
	codeBlock: CodeBlock,
	editorContent: string,
	editorFilepath: string,
): CodeBlockDiffData | null => {
	const localSlice =
		codeBlock.targetRange && (!codeBlock.filepath || codeBlock.filepath === editorFilepath)
			? sliceContent(editorContent, codeBlock.targetRange)
			: null;

	const original = codeBlock.originalCode ?? localSlice;
	if (!original) {
		return null;
	}

	const isStale = Boolean(
		codeBlock.originalCode && localSlice && codeBlock.originalCode !== localSlice,
	);

	return {
		diff: {
			source: "code_block",
			oldText: original,
			newText: codeBlock.code,
			path: codeBlock.filepath,
		},
		isStale,
	};
};
