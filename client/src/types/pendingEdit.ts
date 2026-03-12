import type { DiffChange, DiffHunk } from "@/types/generated";

export type PendingEditSource =
	| { type: "acp"; sessionId: string }
	| { type: "api-key"; codeBlockId: string };

export type PendingEditReviewStatus = "keep" | "reject";
export type PendingEditReviewMap = Record<string, PendingEditReviewStatus>;

export interface PendingEdit {
	id: string;
	source: PendingEditSource;
	filePath: string;
	oldContent: string;
	newContent: string;
	unifiedDiff: string;
	baseHash: string;
	expectedSha?: string | null;
	createdAt: number;
	reviewedChanges?: PendingEditReviewMap;
	changes: DiffChange[];
	hunks: DiffHunk[];
}
