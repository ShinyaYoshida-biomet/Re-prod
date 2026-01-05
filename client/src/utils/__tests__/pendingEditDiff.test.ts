import { describe, expect, it } from "vitest";
import type { DiffChange } from "@/utils/pendingEditDiff";
import { applyPendingEditChanges } from "@/utils/pendingEditDiff";

const makeChange = (overrides: Partial<DiffChange>): DiffChange => ({
	id: overrides.id ?? "change-1",
	type: overrides.type ?? "modify",
	originalStartLine: overrides.originalStartLine ?? 1,
	originalEndLine: overrides.originalEndLine ?? 1,
	modifiedStartLine: overrides.modifiedStartLine ?? 1,
	modifiedEndLine: overrides.modifiedEndLine ?? 1,
	oldLines: overrides.oldLines ?? [],
	newLines: overrides.newLines ?? [],
});

describe("applyPendingEditChanges", () => {
	it("keeps changes by default", () => {
		const oldContent = "alpha\nbeta\ngamma";
		const changes = [
			makeChange({
				id: "c1",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["beta"],
				newLines: ["beta-next"],
			}),
		];

		const result = applyPendingEditChanges(oldContent, changes, {});
		expect(result).toBe("alpha\nbeta-next\ngamma");
	});

	it("rejects a modified hunk", () => {
		const oldContent = "alpha\nbeta\ngamma";
		const changes = [
			makeChange({
				id: "c1",
				originalStartLine: 2,
				originalEndLine: 2,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: ["beta"],
				newLines: ["beta-next"],
			}),
		];

		const result = applyPendingEditChanges(oldContent, changes, { c1: "reject" });
		expect(result).toBe("alpha\nbeta\ngamma");
	});

	it("handles insertions and deletions", () => {
		const oldContent = "alpha\nbeta\ngamma";
		const changes = [
			makeChange({
				id: "c1",
				type: "add",
				originalStartLine: 2,
				originalEndLine: 1,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: [],
				newLines: ["inserted"],
			}),
			makeChange({
				id: "c2",
				type: "remove",
				originalStartLine: 3,
				originalEndLine: 3,
				modifiedStartLine: 4,
				modifiedEndLine: 3,
				oldLines: ["gamma"],
				newLines: [],
			}),
		];

		const result = applyPendingEditChanges(oldContent, changes, { c1: "keep", c2: "keep" });
		expect(result).toBe("alpha\ninserted\nbeta");
	});

	it("keeps rejected insertions in place", () => {
		const oldContent = "alpha\nbeta";
		const changes = [
			makeChange({
				id: "c1",
				type: "add",
				originalStartLine: 2,
				originalEndLine: 1,
				modifiedStartLine: 2,
				modifiedEndLine: 2,
				oldLines: [],
				newLines: ["inserted"],
			}),
		];

		const result = applyPendingEditChanges(oldContent, changes, { c1: "reject" });
		expect(result).toBe("alpha\nbeta");
	});
});
