import { describe, expect, it } from "vitest";
import { applyPendingEditChanges } from "../pendingEditDiff";
import type { DiffChange } from "@/types/generated";
import type { PendingEditReviewMap } from "@/types/pendingEdit";

describe("applyPendingEditChanges", () => {
	it("should keep new content when review decision is keep", () => {
		const oldContent = "line1\nold line2\nline3";
		const changes: DiffChange[] = [
			{
				id: "change-1",
				type: "modify",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["old line2"],
				newLines: ["new line2"],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-1": "keep",
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nnew line2\nline3");
	});

	it("should revert to old content when review decision is revert", () => {
		const oldContent = "line1\nold line2\nline3";
		const changes: DiffChange[] = [
			{
				id: "change-1",
				type: "modify",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["old line2"],
				newLines: ["new line2"],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-1": "revert" as PendingEditReviewMap[string],
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nold line2\nline3");
	});

	it("should default to keep when no review decision provided", () => {
		const oldContent = "line1\nold line2\nline3";
		const changes: DiffChange[] = [
			{
				id: "change-1",
				type: "modify",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["old line2"],
				newLines: ["new line2"],
			},
		];
		const reviewMap: PendingEditReviewMap = {};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nnew line2\nline3");
	});

	it("should handle multiple changes with mixed decisions", () => {
		const oldContent = "line1\nold2\nold3\nline4";
		const changes: DiffChange[] = [
			{
				id: "change-1",
				type: "modify",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["old2"],
				newLines: ["new2"],
			},
			{
				id: "change-2",
				type: "modify",
				originalStartLine: 3,
				originalEndLine: 3,
				modifiedStartLine: 3,
				modifiedEndLine: 3,
				oldLines: ["old3"],
				newLines: ["new3"],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-1": "keep",
			"change-2": "reject",
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nnew2\nold3\nline4");
	});

	it("should handle addition changes", () => {
		const oldContent = "line1\nline3";
		const changes: DiffChange[] = [
			{
				id: "change-add",
				type: "add",
				originalStartLine: 2,
				originalEndLine: 1,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: [],
				newLines: ["new line2"],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-add": "keep",
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nnew line2\nline3");
	});

	it("should handle removal changes with keep decision", () => {
		const oldContent = "line1\nremove this\nline3";
		const changes: DiffChange[] = [
			{
				id: "change-remove",
				type: "remove",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 1,
				oldLines: ["remove this"],
				newLines: [],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-remove": "keep",
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nline3");
	});

	it("should preserve unchanged lines before and after changes", () => {
		const oldContent = "unchanged1\nold\nunchanged3";
		const changes: DiffChange[] = [
			{
				id: "change-1",
				type: "modify",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["old"],
				newLines: ["new"],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-1": "keep",
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("unchanged1\nnew\nunchanged3");
	});

	it("should handle multiline modifications", () => {
		const oldContent = "line1\nold2\nold3\nline4";
		const changes: DiffChange[] = [
			{
				id: "change-multi",
				type: "modify",
				originalStartLine: 2,
				originalEndLine: 3,
				modifiedStartLine: 2,
				modifiedEndLine: 3,
				oldLines: ["old2", "old3"],
				newLines: ["new2", "new3"],
			},
		];
		const reviewMap: PendingEditReviewMap = {
			"change-multi": "keep",
		};

		const result = applyPendingEditChanges(oldContent, changes, reviewMap);

		expect(result).toBe("line1\nnew2\nnew3\nline4");
	});
});
