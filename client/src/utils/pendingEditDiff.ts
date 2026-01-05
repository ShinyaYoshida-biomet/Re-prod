import type { PendingEditReviewMap } from "@/types/pendingEdit";

export interface DiffChangeRange {
	originalStartLineNumber: number;
	originalEndLineNumber: number;
	modifiedStartLineNumber: number;
	modifiedEndLineNumber: number;
}

export interface DiffChange {
	id: string;
	type: "add" | "remove" | "modify";
	originalStartLine: number;
	originalEndLine: number;
	modifiedStartLine: number;
	modifiedEndLine: number;
	oldLines: string[];
	newLines: string[];
}

export interface DiffLine {
	type: "context" | "add" | "remove";
	content: string;
	oldLine?: number;
	newLine?: number;
}

export interface DiffHunk {
	id: string;
	index: number;
	change: DiffChange;
	lines: DiffLine[];
}

const splitLines = (content: string): string[] => {
	if (content === "") {
		return [""];
	}
	return content.split(/\r?\n/);
};

const sliceLines = (lines: string[], start: number, end: number): string[] => {
	if (start <= 0 || end <= 0 || start > end) {
		return [];
	}
	return lines.slice(start - 1, end);
};

export const buildChangeId = (range: DiffChangeRange, index: number): string =>
	`change-${range.originalStartLineNumber}-${range.originalEndLineNumber}-${range.modifiedStartLineNumber}-${range.modifiedEndLineNumber}-${index}`;

export const buildDiffChanges = (
	oldContent: string,
	newContent: string,
	changes: DiffChangeRange[],
): DiffChange[] => {
	const oldLines = splitLines(oldContent);
	const newLines = splitLines(newContent);

	return changes.map((change, index) => {
		const originalStartLine = change.originalStartLineNumber;
		const originalEndLine = change.originalEndLineNumber;
		const modifiedStartLine = change.modifiedStartLineNumber;
		const modifiedEndLine = change.modifiedEndLineNumber;
		const oldLinesSlice = sliceLines(oldLines, originalStartLine, originalEndLine);
		const newLinesSlice = sliceLines(newLines, modifiedStartLine, modifiedEndLine);
		const type =
			oldLinesSlice.length === 0 ? "add" : newLinesSlice.length === 0 ? "remove" : "modify";

		return {
			id: buildChangeId(change, index),
			type,
			originalStartLine,
			originalEndLine,
			modifiedStartLine,
			modifiedEndLine,
			oldLines: oldLinesSlice,
			newLines: newLinesSlice,
		};
	});
};

export const buildDiffHunks = (changes: DiffChange[]): DiffHunk[] => {
	return changes.map((change, index) => {
		const lines: DiffLine[] = [];
		let oldLine = change.originalStartLine;
		let newLine = change.modifiedStartLine;

		for (const line of change.oldLines) {
			lines.push({
				type: "remove",
				content: line,
				oldLine,
			});
			oldLine += 1;
		}

		for (const line of change.newLines) {
			lines.push({
				type: "add",
				content: line,
				newLine,
			});
			newLine += 1;
		}

		return {
			id: change.id,
			index,
			change,
			lines,
		};
	});
};

export const applyPendingEditChanges = (
	oldContent: string,
	changes: DiffChange[],
	reviewMap: PendingEditReviewMap,
): string => {
	const oldLines = splitLines(oldContent);
	const result: string[] = [];
	let cursor = 1;

	for (const change of changes) {
		const startLine = Math.max(change.originalStartLine, 1);
		const endLine = Math.max(change.originalEndLine, 0);

		if (cursor <= startLine - 1) {
			result.push(...oldLines.slice(cursor - 1, startLine - 1));
		}

		const decision = reviewMap[change.id] ?? "keep";
		if (decision === "keep") {
			result.push(...change.newLines);
		} else {
			result.push(...change.oldLines);
		}

		cursor = Math.max(endLine + 1, cursor);
	}

	if (cursor <= oldLines.length) {
		result.push(...oldLines.slice(cursor - 1));
	}

	return result.join("\n");
};
