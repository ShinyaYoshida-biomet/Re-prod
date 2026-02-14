import { describe, expect, it, vi } from "vitest";
import { ReplaceAllAction } from "../ReplaceAllAction";
import type { CodeBlock } from "@/types";
import type { CodeActionContext } from "../ICodeAction";

describe("ReplaceAllAction", () => {
	const action = new ReplaceAllAction();
	const context: CodeActionContext = {
		editorFilepath: "active.ts",
		applyToEditor: vi.fn(),
		applyToFile: vi.fn(),
		postMessage: vi.fn(),
	};

	describe("getLabel", () => {
		it("should return label with filepath", () => {
			const block = { filepath: "test.ts" } as CodeBlock;
			expect(action.getLabel(block)).toBe("Replace entire test.ts");
		});

		it("should return label with active editor fallback", () => {
			const block = {} as CodeBlock;
			expect(action.getLabel(block)).toBe("Replace entire active editor");
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
		it("should apply to editor if current file", async () => {
			const block = { code: "content", filepath: "active.ts" } as CodeBlock;
			await action.apply(block, context);

			expect(context.applyToEditor).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith("Replaced entire active.ts");
		});

		it("should apply to editor if no file specified", async () => {
			const block = { code: "content" } as CodeBlock;
			await action.apply(block, context);

			expect(context.applyToEditor).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith("Replaced entire active editor");
		});

		it("should apply to file if not current", async () => {
			const block = { code: "content", filepath: "other.ts" } as CodeBlock;
			await action.apply(block, context);

			expect(context.applyToFile).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith("Replaced entire other.ts");
		});

		it("should throw if validation fails", async () => {
			const block = { code: "" } as CodeBlock;
			await expect(action.apply(block, context)).rejects.toThrow(
				"Cannot replace with empty content",
			);
		});

		it("should throw if apply method is missing", async () => {
			const block = { code: "content", filepath: "active.ts" } as CodeBlock;
			const invalidContext = { ...context, applyToEditor: undefined, applyToFile: undefined };

			await expect(action.apply(block, invalidContext)).rejects.toThrow(
				"No suitable apply method available",
			);
		});
	});
});
