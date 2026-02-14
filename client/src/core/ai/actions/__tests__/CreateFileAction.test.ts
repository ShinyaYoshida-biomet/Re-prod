import { describe, expect, it, vi } from "vitest";
import { CreateFileAction } from "../CreateFileAction";
import type { CodeBlock } from "@/types";
import type { CodeActionContext } from "../ICodeAction";

describe("CreateFileAction", () => {
	const action = new CreateFileAction();
	const context: CodeActionContext = {
		editorFilepath: "active.ts",
		applyToEditor: vi.fn(),
		applyToFile: vi.fn(),
		postMessage: vi.fn(),
	};

	describe("getLabel", () => {
		it("should return generic label without filepath", () => {
			expect(action.getLabel({} as CodeBlock)).toBe("Create new file");
		});

		it("should return specific label with filepath", () => {
			expect(action.getLabel({ filepath: "test.ts" } as CodeBlock)).toBe("Create file test.ts");
		});
	});

	describe("validate", () => {
		it("should fail if filepath is empty", () => {
			expect(action.validate({ code: "content" } as CodeBlock).valid).toBe(false);
			expect(action.validate({ filepath: "", code: "content" } as CodeBlock).valid).toBe(false);
		});

		it("should fail if content is empty", () => {
			expect(action.validate({ filepath: "test.ts", code: "" } as CodeBlock).valid).toBe(false);
		});

		it("should fail for placeholder paths", () => {
			expect(
				action.validate({ filepath: "current editor buffer", code: "content" } as CodeBlock).valid,
			).toBe(false);
			expect(action.validate({ filepath: "<new file>", code: "content" } as CodeBlock).valid).toBe(
				false,
			);
		});

		it("should pass for valid input", () => {
			expect(action.validate({ filepath: "test.ts", code: "content" } as CodeBlock).valid).toBe(
				true,
			);
		});
	});

	describe("apply", () => {
		it("should call applyToFile", async () => {
			const block = { filepath: "test.ts", code: "content" } as CodeBlock;
			await action.apply(block, context);

			expect(context.applyToFile).toHaveBeenCalledWith(block);
			expect(context.postMessage).toHaveBeenCalledWith("Created file test.ts");
		});

		it("should throw if validation fails", async () => {
			const block = { filepath: "", code: "content" } as CodeBlock;
			await expect(action.apply(block, context)).rejects.toThrow("Create file requires a filepath");
		});

		it("should throw if applyToFile is missing", async () => {
			const block = { filepath: "test.ts", code: "content" } as CodeBlock;
			const invalidContext = { ...context, applyToFile: undefined };

			await expect(action.apply(block, invalidContext)).rejects.toThrow(
				"File apply method not available",
			);
		});
	});
});
