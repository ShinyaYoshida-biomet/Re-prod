import { describe, expect, it, vi } from "vitest";
import { ReplaceRangeAction } from "../ReplaceRangeAction";
import type { CodeBlock } from "@/types";
import type { CodeActionContext } from "../../ICodeAction";

describe("ReplaceRangeAction", () => {
	const action = new ReplaceRangeAction();
	const context: CodeActionContext = {
		editorFilepath: "active.ts",
		applyToEditor: vi.fn(),
		applyToFile: vi.fn(),
		postMessage: vi.fn(),
	};

	describe("getLabel", () => {
		it("should return label with range", () => {
			const block = {
				filepath: "test.ts",
				targetRange: { startLine: 1, startColumn: 1, endLine: 2, endColumn: 2 },
			} as CodeBlock;
			expect(action.getLabel(block)).toBe("Replace test.ts 1:1-2:2");
		});

		it("should return label with active editor fallback", () => {
			const block = {
				targetRange: { startLine: 1, startColumn: 1, endLine: 2, endColumn: 2 },
			} as CodeBlock;
			expect(action.getLabel(block)).toBe("Replace active editor 1:1-2:2");
		});

		it("should return generic label without range", () => {
			const block = { filepath: "test.ts" } as CodeBlock;
			expect(action.getLabel(block)).toBe("Replace code in test.ts");
		});
	});

	describe("validate", () => {
		it("should fail if code is empty", () => {
			const block = { code: "", targetRange: { startLine: 1, endLine: 2 } } as any;
			expect(action.validate(block).valid).toBe(false);
			expect(action.validate(block).error).toContain("Cannot apply action with empty content");
		});

		it("should fail without range or context", () => {
			const block = { code: "content" } as CodeBlock;
			expect(action.validate(block).valid).toBe(false);
			expect(action.validate(block).error).toContain("requires targetRange");
		});

		it("should pass if has originalCode context", () => {
			const block = { code: "content", originalCode: "context" } as CodeBlock;
			expect(action.validate(block).valid).toBe(true);
		});

		it("should validate invalid range", () => {
			const block = {
				code: "content",
				targetRange: { startLine: 5, startColumn: 0, endLine: 1, endColumn: 0 },
			} as CodeBlock;
			expect(action.validate(block).valid).toBe(false);
		});
	});

	describe("apply", () => {
		it("should call applyToEditor", async () => {
			const block = { code: "content", targetRange: { startLine: 1, endLine: 2 } } as any;
			await action.apply(block, context);

			expect(context.applyToEditor).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith(expect.stringContaining("Replace"));
		});

		it("should throw if validation fails", async () => {
			const block = { code: "" } as CodeBlock;
			await expect(action.apply(block, context)).rejects.toThrow();
		});

		it("should throw if applyToEditor is missing", async () => {
			const block = { code: "content", targetRange: { startLine: 1, endLine: 2 } } as any;
			const invalidContext = { ...context, applyToEditor: undefined };

			await expect(action.apply(block, invalidContext)).rejects.toThrow(
				"Editor apply method not available",
			);
		});
	});
});
