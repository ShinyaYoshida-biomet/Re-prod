import { describe, expect, it } from "vitest";
import { extractDiffFromToolOutput, buildDiffFromCodeBlock } from "../diffArtifacts";

describe("diffArtifacts", () => {
	describe("extractDiffFromToolOutput", () => {
		it("should return null for non-record output", () => {
			expect(extractDiffFromToolOutput("string")).toBeNull();
			expect(extractDiffFromToolOutput(null)).toBeNull();
			expect(extractDiffFromToolOutput([1, 2])).toBeNull();
		});

		it("should extract diff from flat object", () => {
			const output = {
				old_text: "old",
				new_text: "new",
				unified_diff: "diff",
				status: "applied",
				path: "file.ts",
			};

			const result = extractDiffFromToolOutput(output);

			expect(result).toEqual({
				source: "tool",
				oldText: "old",
				newText: "new",
				unifiedDiff: "diff",
				status: "applied",
				path: "file.ts",
			});
		});

		it("should extract diff from result wrapper", () => {
			const output = {
				result: {
					old_text: "old",
					new_text: "new",
				},
			};

			const result = extractDiffFromToolOutput(output);

			expect(result).toEqual({
				source: "tool",
				oldText: "old",
				newText: "new",
				unifiedDiff: undefined,
				status: undefined,
				path: undefined,
			});
		});

		it("should return null if missing required fields", () => {
			expect(extractDiffFromToolOutput({ old_text: "old" })).toBeNull();
			expect(extractDiffFromToolOutput({ new_text: "new" })).toBeNull();
		});
	});

	describe("buildDiffFromCodeBlock", () => {
		const editorContent = "line1\nline2\nline3";
		const editorFilepath = "test.ts";

		it("should build diff from code block with target range", () => {
			const codeBlock = {
				code: "new content",
				filepath: "test.ts",
				targetRange: {
					startLine: 1,
					startColumn: 1,
					endLine: 2,
					endColumn: 6,
				},
			};

			const result = buildDiffFromCodeBlock(codeBlock as any, editorContent, editorFilepath);

			expect(result).toEqual({
				diff: {
					source: "code_block",
					oldText: "line1\nline2",
					newText: "new content",
					path: "test.ts",
				},
				isStale: false,
			});
		});

		it("should detect stale content", () => {
			const codeBlock = {
				code: "new content",
				filepath: "test.ts",
				originalCode: "different content",
				targetRange: {
					startLine: 1,
					startColumn: 1,
					endLine: 1,
					endColumn: 6,
				},
			};

			const result = buildDiffFromCodeBlock(codeBlock as any, editorContent, editorFilepath);

			expect(result?.isStale).toBe(true);
			expect(result?.diff.oldText).toBe("different content");
		});

		it("should return null if no original content can be determined", () => {
			const codeBlock = {
				code: "new content",
				filepath: "other.ts",
			};

			const result = buildDiffFromCodeBlock(codeBlock as any, editorContent, editorFilepath);

			expect(result).toBeNull();
		});
	});
});
