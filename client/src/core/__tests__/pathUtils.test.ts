import { describe, expect, it } from "vitest";
import { normalizeWorkspaceRelativePath, ROOT_PATH } from "@/core/pathUtils";

describe("normalizeWorkspaceRelativePath", () => {
	it("normalizes absolute paths relative to the workspace root", () => {
		expect(
			normalizeWorkspaceRelativePath("/Users/me/project/src/file.ts", "/Users/me/project"),
		).toBe("src/file.ts");
	});

	it("keeps relative paths unchanged when they are already relative", () => {
		expect(normalizeWorkspaceRelativePath("src/file.ts", "/Users/me/project")).toBe("src/file.ts");
	});

	it("returns the root placeholder when pointing at the workspace root", () => {
		expect(normalizeWorkspaceRelativePath("/Users/me/project", "/Users/me/project")).toBe(
			ROOT_PATH,
		);
		expect(
			normalizeWorkspaceRelativePath("/Users/me/project", "/Users/me/project", {
				keepRootEmpty: true,
			}),
		).toBe("");
	});

	it("handles Windows-style paths", () => {
		expect(normalizeWorkspaceRelativePath("C:\\repo\\proj\\src\\file.ts", "C:\\repo\\proj")).toBe(
			"src/file.ts",
		);
	});
});
