import { describe, expect, it } from "vitest";
import {
	buildChangeId,
	buildDiffChanges,
	buildDiffHunks,
	applyPendingEditChanges,
	type DiffChangeRange,
	type DiffChange,
} from "../pendingEditDiff";
import type { PendingEditReviewMap } from "@/types/pendingEdit";

describe("pendingEditDiff", () => {
	describe("buildChangeId", () => {
		it("should build ID from range and index", () => {
			const range: DiffChangeRange = {
				originalStartLineNumber: 1,
				originalEndLineNumber: 3,
				modifiedStartLineNumber: 1,
				modifiedEndLineNumber: 4,
			};

			const id = buildChangeId(range, 0);

			expect(id).toBe("change-1-3-1-4-0");
		});
	});

	describe("buildDiffChanges", () => {
		it("should detect add type when oldLines is empty", () => {
			const oldContent = "line1\nline2";
			const newContent = "line1\ninserted line\nline2";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 2,
					originalEndLineNumber: 1,
					modifiedStartLineNumber: 2,
					modifiedEndLineNumber: 2,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges).toHaveLength(1);
			expect(diffChanges[0].type).toBe("add");
			expect(diffChanges[0].oldLines).toEqual([]);
			expect(diffChanges[0].newLines).toEqual(["inserted line"]);
		});

		it("should detect remove type when newLines is empty", () => {
			const oldContent = "line1\nremoved line\nline2";
			const newContent = "line1\nline2";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 2,
					originalEndLineNumber: 2,
					modifiedStartLineNumber: 2,
					modifiedEndLineNumber: 1,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges).toHaveLength(1);
			expect(diffChanges[0].type).toBe("remove");
			expect(diffChanges[0].oldLines).toEqual(["removed line"]);
			expect(diffChanges[0].newLines).toEqual([]);
		});

		it("should detect modify type when both have lines", () => {
			const oldContent = "line1\nold content\nline2";
			const newContent = "line1\nnew content\nline2";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 2,
					originalEndLineNumber: 2,
					modifiedStartLineNumber: 2,
					modifiedEndLineNumber: 2,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges).toHaveLength(1);
			expect(diffChanges[0].type).toBe("modify");
			expect(diffChanges[0].oldLines).toEqual(["old content"]);
			expect(diffChanges[0].newLines).toEqual(["new content"]);
		});

		it("should handle multiple changes", () => {
			const oldContent = "line1\nline2\nline3";
			const newContent = "line1\nmodified line2\nline3";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 2,
					originalEndLineNumber: 2,
					modifiedStartLineNumber: 2,
					modifiedEndLineNumber: 2,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges).toHaveLength(1);
			expect(diffChanges[0].id).toBe("change-2-2-2-2-0");
		});

		it("should handle multiline modifications", () => {
			const oldContent = "line1\nline2\nline3\nline4";
			const newContent = "line1\nnew2\nnew3\nline4";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 2,
					originalEndLineNumber: 3,
					modifiedStartLineNumber: 2,
					modifiedEndLineNumber: 3,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges).toHaveLength(1);
			expect(diffChanges[0].oldLines).toEqual(["line2", "line3"]);
			expect(diffChanges[0].newLines).toEqual(["new2", "new3"]);
		});

		it("should preserve line numbers correctly", () => {
			const oldContent = "a\nb\nc";
			const newContent = "a\nX\nc";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 2,
					originalEndLineNumber: 2,
					modifiedStartLineNumber: 2,
					modifiedEndLineNumber: 2,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges[0].originalStartLine).toBe(2);
			expect(diffChanges[0].originalEndLine).toBe(2);
			expect(diffChanges[0].modifiedStartLine).toBe(2);
			expect(diffChanges[0].modifiedEndLine).toBe(2);
		});

		it("should handle empty content", () => {
			const oldContent = "";
			const newContent = "new line";
			const changes: DiffChangeRange[] = [
				{
					originalStartLineNumber: 1,
					originalEndLineNumber: 0,
					modifiedStartLineNumber: 1,
					modifiedEndLineNumber: 1,
				},
			];

			const diffChanges = buildDiffChanges(oldContent, newContent, changes);

			expect(diffChanges).toHaveLength(1);
			expect(diffChanges[0].type).toBe("add");
			expect(diffChanges[0].newLines).toEqual(["new line"]);
		});
	});

	describe("buildDiffHunks", () => {
		it("should build hunk with remove and add lines", () => {
			const change: DiffChange = {
				id: "change-1",
				type: "modify",
				originalStartLine: 5,
				originalEndLine: 5,
				modifiedStartLine: 5,
				modifiedEndLine: 5,
				oldLines: ["old line"],
				newLines: ["new line"],
			};

			const hunks = buildDiffHunks([change]);

			expect(hunks).toHaveLength(1);
			expect(hunks[0].id).toBe("change-1");
			expect(hunks[0].index).toBe(0);
			expect(hunks[0].lines).toHaveLength(2);
			expect(hunks[0].lines[0]).toEqual({
				type: "remove",
				content: "old line",
				oldLine: 5,
			});
			expect(hunks[0].lines[1]).toEqual({
				type: "add",
				content: "new line",
				newLine: 5,
			});
		});

		it("should build hunk for addition only", () => {
			const change: DiffChange = {
				id: "change-add",
				type: "add",
				originalStartLine: 3,
				originalEndLine: 2,
				modifiedStartLine: 3,
				modifiedEndLine: 3,
				oldLines: [],
				newLines: ["added line"],
			};

			const hunks = buildDiffHunks([change]);

			expect(hunks).toHaveLength(1);
			expect(hunks[0].lines).toHaveLength(1);
			expect(hunks[0].lines[0]).toEqual({
				type: "add",
				content: "added line",
				newLine: 3,
			});
		});

		it("should build hunk for removal only", () => {
			const change: DiffChange = {
				id: "change-remove",
				type: "remove",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 1,
				oldLines: ["deleted line"],
				newLines: [],
			};

			const hunks = buildDiffHunks([change]);

			expect(hunks).toHaveLength(1);
			expect(hunks[0].lines).toHaveLength(1);
			expect(hunks[0].lines[0]).toEqual({
				type: "remove",
				content: "deleted line",
				oldLine: 2,
			});
		});

		it("should build multiple hunks for multiple changes", () => {
			const changes: DiffChange[] = [
				{
					id: "change-1",
					type: "modify",
					originalStartLine: 1,
					originalEndLine: 1,
					modifiedStartLine: 1,
					modifiedEndLine: 1,
					oldLines: ["old1"],
					newLines: ["new1"],
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

			const hunks = buildDiffHunks(changes);

			expect(hunks).toHaveLength(2);
			expect(hunks[0].index).toBe(0);
			expect(hunks[1].index).toBe(1);
		});

		it("should handle multiline changes correctly", () => {
			const change: DiffChange = {
				id: "change-multi",
				type: "modify",
				originalStartLine: 10,
				originalEndLine: 12,
				modifiedStartLine: 10,
				modifiedEndLine: 12,
				oldLines: ["old10", "old11", "old12"],
				newLines: ["new10", "new11", "new12"],
			};

			const hunks = buildDiffHunks([change]);

			expect(hunks[0].lines).toHaveLength(6);
			// Check remove lines
			expect(hunks[0].lines[0].oldLine).toBe(10);
			expect(hunks[0].lines[1].oldLine).toBe(11);
			expect(hunks[0].lines[2].oldLine).toBe(12);
			// Check add lines
			expect(hunks[0].lines[3].newLine).toBe(10);
			expect(hunks[0].lines[4].newLine).toBe(11);
			expect(hunks[0].lines[5].newLine).toBe(12);
		});

		it("should preserve change reference in hunk", () => {
			const change: DiffChange = {
				id: "test-change",
				type: "add",
				originalStartLine: 1,
				originalEndLine: 0,
				modifiedStartLine: 1,
				modifiedEndLine: 1,
				oldLines: [],
				newLines: ["new"],
			};

			const hunks = buildDiffHunks([change]);

			expect(hunks[0].change).toBe(change);
		});
	});

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
				"change-1": "revert",
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
				"change-2": "revert",
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

		it("should handle removal changes with revert decision", () => {
			const oldContent = "line1\nkeep this\nline3";
			const changes: DiffChange[] = [
				{
					id: "change-remove",
					type: "remove",
					originalStartLine: 2,
					originalEndLine: 2,
					modifiedStartLine: 2,
					modifiedEndLine: 1,
					oldLines: ["keep this"],
					newLines: [],
				},
			];
			const reviewMap: PendingEditReviewMap = {
				"change-remove": "revert",
			};

			const result = applyPendingEditChanges(oldContent, changes, reviewMap);

			expect(result).toBe("line1\nkeep this\nline3");
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

		it("should handle empty old content", () => {
			const oldContent = "";
			const changes: DiffChange[] = [
				{
					id: "change-1",
					type: "add",
					originalStartLine: 1,
					originalEndLine: 0,
					modifiedStartLine: 1,
					modifiedEndLine: 1,
					oldLines: [],
					newLines: ["new line"],
				},
			];
			const reviewMap: PendingEditReviewMap = {
				"change-1": "keep",
			};

			const result = applyPendingEditChanges(oldContent, changes, reviewMap);

			// Empty content is represented as [""] by splitLines, which adds trailing newline
			expect(result).toBe("new line\n");
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
});
