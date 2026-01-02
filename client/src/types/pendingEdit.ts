export type PendingEditSource =
	| { type: "acp"; sessionId: string }
	| { type: "api-key"; codeBlockId: string };

export type PendingEditStatus = "pending" | "accepted" | "rejected";

export interface PendingEdit {
	id: string;
	source: PendingEditSource;
	filePath: string;
	oldContent: string;
	newContent: string;
	unifiedDiff: string;
	baseHash: string;
	expectedSha?: string | null;
	status: PendingEditStatus;
	createdAt: number;
}
