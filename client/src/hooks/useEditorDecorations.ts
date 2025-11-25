import type { editor as MonacoEditor } from "monaco-editor";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import type { Cell } from "@/core/execution/cellParser";

interface UseEditorDecorationsOptions {
	showCellDecorations: boolean;
	highlightExecutingCell: boolean;
	executingCellIndex: number | null;
}

export function useEditorDecorations(
	editorRef: MutableRefObject<MonacoEditor.IStandaloneCodeEditor | null>,
	cells: Cell[],
	options: UseEditorDecorationsOptions,
) {
	const { showCellDecorations, highlightExecutingCell, executingCellIndex } = options;
	const decorationsRef = useRef<string[]>([]);

	useEffect(() => {
		const monacoEditor = editorRef.current;
		if (!monacoEditor) {
			return;
		}

		decorationsRef.current = monacoEditor.deltaDecorations(decorationsRef.current, []);

		if (!showCellDecorations) {
			return;
		}

		const newDecorations: MonacoEditor.IModelDeltaDecoration[] = [];

		cells.forEach((cell, index) => {
			if (cell.startLine > 1) {
				newDecorations.push({
					range: {
						startLineNumber: cell.startLine,
						startColumn: 1,
						endLineNumber: cell.startLine,
						endColumn: 1,
					},
					options: {
						isWholeLine: true,
						linesDecorationsClassName: "cell-boundary-decoration",
						overviewRuler: {
							color: "#4285f4",
							position: 4,
						},
					},
				});
			}

			if (highlightExecutingCell && executingCellIndex === index) {
				newDecorations.push({
					range: {
						startLineNumber: cell.startLine,
						startColumn: 1,
						endLineNumber: cell.endLine,
						endColumn: 1,
					},
					options: {
						isWholeLine: true,
						className: "executing-cell-background",
					},
				});
			}
		});

		decorationsRef.current = monacoEditor.deltaDecorations(decorationsRef.current, newDecorations);
	}, [cells, editorRef, executingCellIndex, highlightExecutingCell, showCellDecorations]);
}
