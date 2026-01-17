import { describe, expect, it, vi } from "vitest";
import { DeleteRangeAction } from "../DeleteRangeAction";
import type { CodeBlock } from "@/types";
import type { CodeActionContext } from "../../ICodeAction";

describe("DeleteRangeAction", () => {
	const action = new DeleteRangeAction();
	const context: CodeActionContext = {
		editorFilepath: "active.ts",
		applyToEditor: vi.fn(),
		applyToFile: vi.fn(),
		postMessage: vi.fn(),
	};

	describe("getLabel", () => {
		it("should return label with range", () => {
			const block = { filepath: "test.ts", targetRange: { startLine: 1, endLine: 5 } } as CodeBlock;
			expect(action.getLabel(block)).toBe("Delete test.ts lines 1-5");
		});

		it("should return label with active editor fallback", () => {
			const block = { targetRange: { startLine: 1, endLine: 5 } } as CodeBlock;
			expect(action.getLabel(block)).toBe("Delete active editor lines 1-5");
		});

		it("should return generic label without range", () => {
			const block = { filepath: "test.ts" } as CodeBlock;
			expect(action.getLabel(block)).toBe("Delete code in test.ts");
		});
	});

	describe("validate", () => {
		it("should validate without code content", () => {
			const block = {
				targetRange: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 0 },
			} as CodeBlock;
			expect(action.validate(block).valid).toBe(true);
		});

		it("should fail without range or context", () => {
			const block = {} as CodeBlock;
			expect(action.validate(block).valid).toBe(false);
			expect(action.validate(block).error).toContain("requires targetRange");
		});

		it("should pass if has originalCode context", () => {
			const block = { originalCode: "some context" } as CodeBlock;
			expect(action.validate(block).valid).toBe(true);
		});

		it("should validate invalid range", () => {
			const block = {
				targetRange: { startLine: 5, startColumn: 0, endLine: 1, endColumn: 0 },
			} as CodeBlock;
			expect(action.validate(block).valid).toBe(false);
		});
	});

	describe("apply", () => {
		it("should call applyToEditor", async () => {
			const block = { targetRange: { startLine: 1, endLine: 2 } } as any;
			await action.apply(block, context);

			expect(context.applyToEditor).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith("Delete active editor lines 1-2");
		});

		it("should throw if validation fails", async () => {
			const block = {} as CodeBlock;
			await expect(action.apply(block, context)).rejects.toThrow();
		});

		it("should throw if applyToEditor is missing", async () => {
			const block = { targetRange: { startLine: 1, endLine: 2 } } as any;
			const invalidContext = { ...context, applyToEditor: undefined };

			await expect(action.apply(block, invalidContext)).rejects.toThrow(
				"Editor apply method not available",
			);
		});
	});
});
