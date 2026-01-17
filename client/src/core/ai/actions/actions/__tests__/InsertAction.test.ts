import { describe, expect, it, vi } from "vitest";
import { InsertAction } from "../InsertAction";
import type { CodeBlock } from "@/types";
import type { CodeActionContext } from "../../ICodeAction";

describe("InsertAction", () => {
	const action = new InsertAction();
	const context: CodeActionContext = {
		editorFilepath: "active.ts",
		applyToEditor: vi.fn(),
		applyToFile: vi.fn(),
		postMessage: vi.fn(),
	};

	describe("getLabel", () => {
		it("should return label with filepath", () => {
			const block = { filepath: "test.ts" } as CodeBlock;
			expect(action.getLabel(block)).toBe("Insert code in test.ts");
		});

		it("should return label with active editor fallback", () => {
			const block = {} as CodeBlock;
			expect(action.getLabel(block)).toBe("Insert code in active editor");
		});
	});

	describe("validate", () => {
		it("should fail if code is empty", () => {
			expect(action.validate({ code: "" } as CodeBlock).valid).toBe(false);
		});

		it("should pass if code is provided", () => {
			expect(action.validate({ code: "content" } as CodeBlock).valid).toBe(true);
		});
	});

	describe("apply", () => {
		it("should call applyToEditor", async () => {
			const block = { code: "content" } as CodeBlock;
			await action.apply(block, context);

			expect(context.applyToEditor).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith("Insert code in active editor");
		});

		it("should throw if validation fails", async () => {
			const block = { code: "" } as CodeBlock;
			await expect(action.apply(block, context)).rejects.toThrow(
				"Cannot apply action with empty content",
			);
		});

		it("should throw if applyToEditor is missing", async () => {
			const block = { code: "content" } as CodeBlock;
			const invalidContext = { ...context, applyToEditor: undefined };

			await expect(action.apply(block, invalidContext)).rejects.toThrow(
				"Editor apply method not available",
			);
		});
	});
});
