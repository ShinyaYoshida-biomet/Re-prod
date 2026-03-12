import type { DiffChange } from "@/types/generated";
import type { PendingEditReviewMap } from "@/types/pendingEdit";

const splitLines = (content: string): string[] => {
	if (content === "") {
		return [""];
	}
	return content.split(/\r?\n/);
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
