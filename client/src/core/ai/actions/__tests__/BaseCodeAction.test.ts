import { describe, expect, it, vi } from "vitest";
import { BaseCodeAction } from "../BaseCodeAction";
import type { CodeBlock } from "@/types";
import type { CodeActionContext, CodeActionValidation } from "../ICodeAction";

class TestCodeAction extends BaseCodeAction {
	getLabel(codeBlock: CodeBlock): string {
		return "Test Action";
	}

	protected validateSpecific(codeBlock: CodeBlock): CodeActionValidation {
		if (codeBlock.code === "invalid") {
			return { valid: false, error: "Specific validation failed" };
		}
		return { valid: true };
	}

	async apply(codeBlock: CodeBlock, context: CodeActionContext): Promise<void> {
		await this.applyWithValidation(codeBlock, context, "Success");
	}

	// Expose protected methods for testing
	public testRequiresCode(): boolean {
		return this.requiresCode();
	}

	public testIsCurrentEditor(
		targetFile: string | undefined,
		editorFilepath: string | null | undefined,
	): boolean {
		return this.isCurrentEditor(targetFile, editorFilepath);
	}

	public testValidateTargetRange(codeBlock: CodeBlock): CodeActionValidation {
		return this.validateTargetRange(codeBlock);
	}
}

class NoCodeAction extends TestCodeAction {
	protected requiresCode(): boolean {
		return false;
	}
}

describe("BaseCodeAction", () => {
	const context: CodeActionContext = {
		editorFilepath: "test.ts",
		applyToEditor: vi.fn(),
		applyToFile: vi.fn(),
		postMessage: vi.fn(),
	};

	describe("validate", () => {
		it("should validate empty code when required", () => {
			const action = new TestCodeAction();
			const result = action.validate({ code: "" } as CodeBlock);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Cannot apply action with empty content");
		});

		it("should allow empty code when not required", () => {
			const action = new NoCodeAction();
			const result = action.validate({ code: "" } as CodeBlock);
			expect(result.valid).toBe(true);
		});

		it("should run specific validation", () => {
			const action = new TestCodeAction();
			const result = action.validate({ code: "invalid" } as CodeBlock);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Specific validation failed");
		});
	});

	describe("isCurrentEditor", () => {
		const action = new TestCodeAction();

		it("should match undefined target file", () => {
			expect(action.testIsCurrentEditor(undefined, "any")).toBe(true);
		});

		it("should match exact filepath", () => {
			expect(action.testIsCurrentEditor("test.ts", "test.ts")).toBe(true);
		});

		it("should match buffer placeholders", () => {
			expect(action.testIsCurrentEditor("current editor buffer", "other.ts")).toBe(true);
			expect(action.testIsCurrentEditor("<buffer>", "other.ts")).toBe(true);
		});

		it("should not match different files", () => {
			expect(action.testIsCurrentEditor("file1.ts", "file2.ts")).toBe(false);
		});
	});

	describe("validateTargetRange", () => {
		const action = new TestCodeAction();

		it("should fail if range is missing", () => {
			const result = action.testValidateTargetRange({} as CodeBlock);
			expect(result.valid).toBe(false);
		});

		it("should fail if coordinates are negative", () => {
			const result = action.testValidateTargetRange({
				targetRange: { startLine: -1, startColumn: 0, endLine: 1, endColumn: 1 },
			} as CodeBlock);
			expect(result.valid).toBe(false);
		});

		it("should fail if start > end", () => {
			const result = action.testValidateTargetRange({
				targetRange: { startLine: 2, startColumn: 0, endLine: 1, endColumn: 1 },
			} as CodeBlock);
			expect(result.valid).toBe(false);
		});

		it("should pass for valid range", () => {
			const result = action.testValidateTargetRange({
				targetRange: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 1 },
			} as CodeBlock);
			expect(result.valid).toBe(true);
		});
	});

	describe("applyWithValidation", () => {
		it("should apply to editor when current", async () => {
			const action = new TestCodeAction();
			const codeBlock = { code: "valid", filepath: "test.ts" } as CodeBlock;

			await action.apply(codeBlock, context);

			expect(context.applyToEditor).toHaveBeenCalledWith(codeBlock);
			expect(context.postMessage).toHaveBeenCalledWith("Success");
		});

		it("should apply to file when not current", async () => {
			const action = new TestCodeAction();
			const codeBlock = { code: "valid", filepath: "other.ts" } as CodeBlock;

			await action.apply(codeBlock, context);

			expect(context.applyToFile).toHaveBeenCalledWith(codeBlock);
			expect(context.postMessage).toHaveBeenCalledWith("Success");
		});

		it("should throw if validation fails", async () => {
			const action = new TestCodeAction();
			const codeBlock = { code: "invalid" } as CodeBlock;

			await expect(action.apply(codeBlock, context)).rejects.toThrow("Specific validation failed");
		});
	});
});
