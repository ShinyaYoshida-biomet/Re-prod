import type { editor as MonacoEditor } from "monaco-editor";
import type { MutableRefObject } from "react";
import { useCallback, useState } from "react";
import type { ExecutionTarget } from "@/core";
import {
	buildExecutionRequest,
	getAllCode,
	getExecutionTarget,
	getExecutionTargetAndNext,
	useStore,
} from "@/core";
import type { Cell } from "@/core/execution/cellParser";
import { ExecutionServiceError, executeRequest } from "@/services/executionService";

interface UseEditorExecutionProps {
	editorRef: MutableRefObject<MonacoEditor.IStandaloneCodeEditor | null>;
	cells: Cell[];
}

export function useEditorExecution({ editorRef, cells }: UseEditorExecutionProps) {
	const editorContent = useStore((state) => state.editor.content);
	const editorFilepath = useStore((state) => state.editor.filepath);
	const cursorLine = useStore((state) => state.editor.cursorPosition.line);
	const setIsRunning = useStore((state) => state.setIsRunning);
	const setExecutionError = useStore((state) => state.setExecutionError);

	const [executingCellIndex, setExecutingCellIndex] = useState<number | null>(null);

	const executeCode = useCallback(
		async (target: ExecutionTarget, cellIndex?: number | null) => {
			setExecutionError(null);
			setIsRunning(true);
			if (cellIndex !== undefined && cellIndex !== null) {
				setExecutingCellIndex(cellIndex);
			}

			const request = buildExecutionRequest({
				target,
				cells,
				documentContent: editorContent,
				filepath: editorFilepath ?? undefined,
			});

			try {
				await executeRequest(request);
			} catch (error) {
				const message =
					error instanceof ExecutionServiceError
						? error.message
						: "Execution failed due to an unexpected error.";
				setExecutionError(message);
				setIsRunning(false);
			} finally {
				setExecutingCellIndex(null);
			}
		},
		[cells, editorContent, editorFilepath, setExecutionError, setIsRunning],
	);

	const handleRunAll = useCallback(() => {
		const monacoEditor = editorRef.current;
		const code = getAllCode(monacoEditor);
		if (!code) {
			return;
		}

		void executeCode({
			code,
			source: "whole-document",
		});
	}, [editorRef, executeCode]);

	const handleRunCurrentCell = useCallback(() => {
		const monacoEditor = editorRef.current;
		const target = getExecutionTarget(monacoEditor, cells, cursorLine);
		if (!target) {
			return;
		}

		void executeCode(target, target.cellIndex);
	}, [cells, cursorLine, editorRef, executeCode]);

	const handleRunCellAndMoveNext = useCallback(() => {
		const monacoEditor = editorRef.current;
		const result = getExecutionTargetAndNext(monacoEditor, cells, cursorLine);
		if (!result) {
			return;
		}

		void executeCode(result.target, result.target.cellIndex);

		if (result.nextCell && monacoEditor) {
			monacoEditor.setPosition({
				lineNumber: result.nextCell.startLine,
				column: 1,
			});
			monacoEditor.revealLineInCenter(result.nextCell.startLine);
		}
	}, [cells, cursorLine, editorRef, executeCode]);

	return {
		executingCellIndex,
		handleRunAll,
		handleRunCurrentCell,
		handleRunCellAndMoveNext,
	};
}
