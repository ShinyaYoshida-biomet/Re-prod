import { describe, expect, it, vi } from "vitest";
import type { CodeBlock } from "@shared/types";
import { CodeActionFactory } from "../CodeActionFactory";
import type { CodeActionContext } from "../ICodeAction";

describe("CodeActionFactory", () => {
	describe("getAction", () => {
		it("should return ReplaceAllAction for replace-all", () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "console.log('test');",
				language: "typescript",
			};

			const action = CodeActionFactory.getAction(codeBlock);
			expect(action).toBeDefined();
			expect(action.getLabel(codeBlock)).toContain("Replace entire");
		});

		it("should return ReplaceRangeAction for replace-range", () => {
			const codeBlock: CodeBlock = {
				action: "replace-range",
				code: "const x = 1;",
				language: "typescript",
				targetRange: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 10 },
			};

			const action = CodeActionFactory.getAction(codeBlock);
			expect(action).toBeDefined();
			expect(action.getLabel(codeBlock)).toContain("Replace");
		});

		it("should return DeleteRangeAction for delete-range", () => {
			const codeBlock: CodeBlock = {
				action: "delete-range",
				code: "",
				language: "typescript",
				targetRange: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 0 },
			};

			const action = CodeActionFactory.getAction(codeBlock);
			expect(action).toBeDefined();
			expect(action.getLabel(codeBlock)).toContain("Delete");
		});

		it("should return CreateFileAction for create-file", () => {
			const codeBlock: CodeBlock = {
				action: "create-file",
				code: "console.log('new file');",
				language: "typescript",
				filepath: "src/newFile.ts",
			};

			const action = CodeActionFactory.getAction(codeBlock);
			expect(action).toBeDefined();
			expect(action.getLabel(codeBlock)).toContain("Create file");
		});

		it("should return InsertAction for insert", () => {
			const codeBlock: CodeBlock = {
				action: "insert",
				code: "const newVar = 123;",
				language: "typescript",
			};

			const action = CodeActionFactory.getAction(codeBlock);
			expect(action).toBeDefined();
			expect(action.getLabel(codeBlock)).toContain("Insert");
		});

		it("should throw error for unknown action type", () => {
			const codeBlock: CodeBlock = {
				action: "unknown-action" as any,
				code: "test",
				language: "typescript",
			};

			expect(() => CodeActionFactory.getAction(codeBlock)).toThrow("Unknown code action type");
		});
	});

	describe("getLabel", () => {
		it("should return label from action", () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "test",
				language: "typescript",
				filepath: "test.ts",
			};

			const label = CodeActionFactory.getLabel(codeBlock);
			expect(label).toBe("Replace entire test.ts");
		});

		it("should return fallback for unknown action", () => {
			const codeBlock: CodeBlock = {
				action: "invalid" as any,
				code: "test",
				language: "typescript",
			};

			const label = CodeActionFactory.getLabel(codeBlock);
			expect(label).toBe("Apply suggested change");
		});
	});

	describe("validate", () => {
		it("should validate replace-all with code", () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "valid code",
				language: "typescript",
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(true);
		});

		it("should fail validation for replace-all with empty code", () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "",
				language: "typescript",
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("empty");
		});

		it("should fail validation for replace-range without targetRange", () => {
			const codeBlock: CodeBlock = {
				action: "replace-range",
				code: "code",
				language: "typescript",
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("targetRange");
		});

		it("should validate replace-range with contextual diff data", () => {
			const codeBlock: CodeBlock = {
				action: "replace-range",
				code: "code",
				language: "typescript",
				originalCode: "old code",
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(true);
		});

		it("should fail validation for create-file without filepath", () => {
			const codeBlock: CodeBlock = {
				action: "create-file",
				code: "code",
				language: "typescript",
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("filepath");
		});

		it("should fail validation for create-file with placeholder path", () => {
			const codeBlock: CodeBlock = {
				action: "create-file",
				code: "code",
				language: "typescript",
				filepath: "<current editor buffer>",
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("placeholder");
		});

		it("should validate delete-range when simple changes are provided", () => {
			const codeBlock: CodeBlock = {
				action: "delete-range",
				code: "",
				language: "typescript",
				simpleChanges: [
					{
						beforeContext: ["alpha"],
						afterContext: ["gamma"],
						oldLines: ["beta"],
						newLines: [],
					},
				],
			};

			const result = CodeActionFactory.validate(codeBlock);
			expect(result.valid).toBe(true);
		});
	});

	describe("isSupported", () => {
		it("should return true for supported actions", () => {
			expect(CodeActionFactory.isSupported("replace-all")).toBe(true);
			expect(CodeActionFactory.isSupported("replace-range")).toBe(true);
			expect(CodeActionFactory.isSupported("delete-range")).toBe(true);
			expect(CodeActionFactory.isSupported("create-file")).toBe(true);
			expect(CodeActionFactory.isSupported("insert")).toBe(true);
		});

		it("should return false for unsupported actions", () => {
			expect(CodeActionFactory.isSupported("unknown")).toBe(false);
			expect(CodeActionFactory.isSupported("")).toBe(false);
		});
	});

	describe("getSupportedActions", () => {
		it("should return all supported action types", () => {
			const actions = CodeActionFactory.getSupportedActions();
			expect(actions).toContain("replace-all");
			expect(actions).toContain("replace-range");
			expect(actions).toContain("delete-range");
			expect(actions).toContain("create-file");
			expect(actions).toContain("insert");
			expect(actions).toHaveLength(5);
		});
	});

	describe("Action apply methods", () => {
		it("should apply replace-all action successfully", async () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "new code",
				language: "typescript",
			};

			const applyToEditor = vi.fn().mockResolvedValue(undefined);
			const postMessage = vi.fn();

			const context: CodeActionContext = {
				applyToEditor,
				postMessage,
				editorFilepath: "test.ts",
			};

			const action = CodeActionFactory.getAction(codeBlock);
			await action.apply(codeBlock, context);

			expect(applyToEditor).toHaveBeenCalledWith(codeBlock);
			expect(postMessage).toHaveBeenCalled();
		});

		it("should apply create-file action to remote file", async () => {
			const codeBlock: CodeBlock = {
				action: "create-file",
				code: "file content",
				language: "typescript",
				filepath: "src/newFile.ts",
			};

			const applyToFile = vi.fn().mockResolvedValue(undefined);
			const postMessage = vi.fn();

			const context: CodeActionContext = {
				applyToFile,
				postMessage,
			};

			const action = CodeActionFactory.getAction(codeBlock);
			await action.apply(codeBlock, context);

			expect(applyToFile).toHaveBeenCalledWith(codeBlock);
			expect(postMessage).toHaveBeenCalledWith("Created file src/newFile.ts");
		});

		it("should throw error when apply method is not available", async () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "code",
				language: "typescript",
			};

			const context: CodeActionContext = {}; // No apply methods

			const action = CodeActionFactory.getAction(codeBlock);
			await expect(action.apply(codeBlock, context)).rejects.toThrow();
		});

		it("should throw error when validation fails", async () => {
			const codeBlock: CodeBlock = {
				action: "replace-all",
				code: "", // Empty code, will fail validation
				language: "typescript",
			};

			const context: CodeActionContext = {
				applyToEditor: vi.fn(),
			};

			const action = CodeActionFactory.getAction(codeBlock);
			await expect(action.apply(codeBlock, context)).rejects.toThrow("empty");
		});
	});
});
