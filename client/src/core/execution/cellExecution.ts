import type { editor as MonacoEditor } from "monaco-editor";
import type { Cell } from "./cellParser";
import { getCellCode, getCurrentCell } from "./cellParser";

/**
 * Represents what code should be executed and its context
 */
export interface ExecutionTarget {
	code: string;
	cellIndex?: number; // undefined for selection/whole document
	source: "selection" | "cell" | "whole-document";
	range?: {
		startLine: number;
		endLine: number;
	};
}

/**
 * Result of getExecutionTargetAndNext
 */
export interface ExecutionTargetWithNext {
	target: ExecutionTarget;
	nextCell?: Cell;
}

/**
 * Determine what code to execute based on editor state
 *
 * Priority:
 * 1. Text selection (if exists and not empty)
 * 2. Current cell (based on cursor position)
 * 3. Whole document (fallback)
 *
 * @param monacoEditor - Monaco editor instance
 * @param cells - Parsed cells from the document
 * @param cursorLine - Current cursor line number
 * @returns ExecutionTarget or null if nothing to execute
 */
export function getExecutionTarget(
	monacoEditor: MonacoEditor.IStandaloneCodeEditor | null,
	cells: Cell[],
	cursorLine: number,
): ExecutionTarget | null {
	// Priority 1: Text selection
	if (monacoEditor) {
		const selection = monacoEditor.getSelection();
		if (selection && !selection.isEmpty()) {
			const model = monacoEditor.getModel();
			const selectedText = model?.getValueInRange(selection);
			if (selectedText && selectedText.trim()) {
				return {
					code: selectedText,
					cellIndex: undefined,
					source: "selection",
					range: {
						startLine: selection.startLineNumber,
						endLine: selection.endLineNumber,
					},
				};
			}
		}
	}

	// Priority 2: Current cell
	if (cells.length > 0) {
		const currentCell = getCurrentCell(cells, cursorLine);
		if (currentCell) {
			const cellIndex = cells.indexOf(currentCell);
			const code = getCellCode(currentCell);
			return {
				code,
				cellIndex,
				source: "cell",
			};
		}
	}

	// Priority 3: Whole document
	if (monacoEditor) {
		const wholeContent = monacoEditor.getValue();
		if (wholeContent.trim()) {
			return {
				code: wholeContent,
				cellIndex: undefined,
				source: "whole-document",
			};
		}
	}

	return null;
}

/**
 * Get execution target and determine next cell for "run and move next" behavior
 *
 * Only moves to next cell if:
 * - Current execution is from a cell (not selection)
 * - There is a next cell available
 *
 * @param monacoEditor - Monaco editor instance
 * @param cells - Parsed cells from the document
 * @param cursorLine - Current cursor line number
 * @returns ExecutionTarget with optional nextCell, or null
 */
export function getExecutionTargetAndNext(
	monacoEditor: MonacoEditor.IStandaloneCodeEditor | null,
	cells: Cell[],
	cursorLine: number,
): ExecutionTargetWithNext | null {
	const target = getExecutionTarget(monacoEditor, cells, cursorLine);

	if (!target) return null;

	// Only move to next cell if we executed a cell (not selection or whole document)
	if (target.source === "cell" && target.cellIndex !== undefined) {
		const nextCellIndex = target.cellIndex + 1;
		if (nextCellIndex < cells.length) {
			return {
				target,
				nextCell: cells[nextCellIndex],
			};
		}
	}

	// Return target without nextCell for selection or whole-document execution
	return { target };
}

/**
 * Get all code from the document
 * Used for "Run All" functionality
 *
 * @param monacoEditor - Monaco editor instance
 * @returns Code string or null if editor not ready
 */
export function getAllCode(monacoEditor: MonacoEditor.IStandaloneCodeEditor | null): string | null {
	if (!monacoEditor) return null;

	const content = monacoEditor.getValue();
	return content.trim() ? content : null;
}
