import type { editor as MonacoEditor } from "monaco-editor";
import { describe, expect, it, vi } from "vitest";
import { getAllCode, getExecutionTarget, getExecutionTargetAndNext } from "../cellExecution";
import type { Cell } from "../cellParser";

describe("cellExecution", () => {
	const mockCells: Cell[] = [
		{
			startLine: 1,
			endLine: 3,
			code: "x <- 1\ny <- 2\nz <- x + y",
			type: "section",
			label: "Cell 1",
		},
		{
			startLine: 5,
			endLine: 7,
			code: "a <- 10\nb <- 20\nc <- a + b",
			type: "section",
			label: "Cell 2",
		},
	];

	describe("getExecutionTarget", () => {
		it("should prioritize text selection over cell", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => false,
					startLineNumber: 4,
					endLineNumber: 5,
				}),
				getModel: vi.fn().mockReturnValue({
					getValueInRange: vi.fn().mockReturnValue("selected text"),
				}),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTarget(mockEditor, mockCells, 2);

			expect(result).toEqual({
				code: "selected text",
				cellIndex: undefined,
				source: "selection",
				range: {
					startLine: 4,
					endLine: 5,
				},
			});
		});

		it("should execute current cell when no selection", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => true,
				}),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTarget(mockEditor, mockCells, 2);

			expect(result).toEqual({
				code: "x <- 1\ny <- 2\nz <- x + y",
				cellIndex: 0,
				source: "cell",
			});
		});

		it("should execute whole document when no cells", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => true,
				}),
				getValue: vi.fn().mockReturnValue("whole document code"),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTarget(mockEditor, [], 1);

			expect(result).toEqual({
				code: "whole document code",
				cellIndex: undefined,
				source: "whole-document",
			});
		});

		it("should execute cell when editor is null but cells exist", () => {
			const result = getExecutionTarget(null, mockCells, 2);

			// Should fall back to cell execution
			expect(result).toEqual({
				code: "x <- 1\ny <- 2\nz <- x + y",
				cellIndex: 0,
				source: "cell",
			});
		});

		it("should return null when editor is null and no cells", () => {
			const result = getExecutionTarget(null, [], 1);

			expect(result).toBeNull();
		});

		it("should ignore empty selection", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => false,
					startLineNumber: 3,
					endLineNumber: 3,
				}),
				getModel: vi.fn().mockReturnValue({
					getValueInRange: vi.fn().mockReturnValue("   "),
				}),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTarget(mockEditor, mockCells, 2);

			expect(result).toEqual({
				code: "x <- 1\ny <- 2\nz <- x + y",
				cellIndex: 0,
				source: "cell",
			});
		});
	});

	describe("getExecutionTargetAndNext", () => {
		it("should return next cell when executing a cell", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => true,
				}),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTargetAndNext(mockEditor, mockCells, 2);

			expect(result).toEqual({
				target: {
					code: "x <- 1\ny <- 2\nz <- x + y",
					cellIndex: 0,
					source: "cell",
				},
				nextCell: mockCells[1],
			});
		});

		it("should not return next cell when executing selection", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => false,
					startLineNumber: 3,
					endLineNumber: 3,
				}),
				getModel: vi.fn().mockReturnValue({
					getValueInRange: vi.fn().mockReturnValue("selected text"),
				}),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTargetAndNext(mockEditor, mockCells, 2);

			expect(result).toEqual({
				target: {
					code: "selected text",
					cellIndex: undefined,
					source: "selection",
					range: {
						startLine: 3,
						endLine: 3,
					},
				},
			});
		});

		it("should not return next cell when on last cell", () => {
			const mockEditor = {
				getSelection: vi.fn().mockReturnValue({
					isEmpty: () => true,
				}),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getExecutionTargetAndNext(mockEditor, mockCells, 6);

			expect(result).toEqual({
				target: {
					code: "a <- 10\nb <- 20\nc <- a + b",
					cellIndex: 1,
					source: "cell",
				},
			});
		});
	});

	describe("getAllCode", () => {
		it("should return all code from editor", () => {
			const mockEditor = {
				getValue: vi.fn().mockReturnValue("all code content"),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getAllCode(mockEditor);

			expect(result).toBe("all code content");
		});

		it("should return null when editor is null", () => {
			const result = getAllCode(null);

			expect(result).toBeNull();
		});

		it("should return null when content is empty", () => {
			const mockEditor = {
				getValue: vi.fn().mockReturnValue("   "),
			} as unknown as MonacoEditor.IStandaloneCodeEditor;

			const result = getAllCode(mockEditor);

			expect(result).toBeNull();
		});
	});
});
