import type { ExecutionLogEntry, ExecutionResultPayload } from "@shared/types";
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

const normalizeResult = (result: ExecutionResultPayload, code: string): ExecutionLogEntry => ({
	code,
	stdout: result.output,
	stderr: result.error || "",
	plots: result.plots.map((plot) => ({
		id: plot.id || plot.filename || `plot-${plot.index}`,
		path: plot.storage_path || plot.filename,
		storagePath: plot.storage_path || null,
		data: plot.base64_data.startsWith("data:")
			? plot.base64_data
			: `data:image/png;base64,${plot.base64_data}`,
		timestamp: plot.timestamp ?? Date.now(),
		width: plot.width ?? null,
		height: plot.height ?? null,
		code: plot.code ?? null,
	})),
	timestamp: Date.now(),
	duration: result.execution_time_ms,
	success: result.success,
});

const normalizeFailure = (message: string, code: string): ExecutionLogEntry => ({
	code,
	stdout: "",
	stderr: message,
	plots: [],
	timestamp: Date.now(),
	duration: 0,
	success: false,
});

export function useEditorExecution({ editorRef, cells }: UseEditorExecutionProps) {
	const editorContent = useStore((state) => state.editor.content);
	const editorFilepath = useStore((state) => state.editor.filepath);
	const cursorLine = useStore((state) => state.editor.cursorPosition.line);
	const setIsRunning = useStore((state) => state.setIsRunning);
	const addPendingExecution = useStore((state) => state.addPendingExecution);
	const replacePendingExecution = useStore((state) => state.replacePendingExecution);

	const [executingCellIndex, setExecutingCellIndex] = useState<number | null>(null);

	const executeCode = useCallback(
		async (target: ExecutionTarget, cellIndex?: number | null) => {
			setIsRunning(true);
			if (cellIndex !== undefined && cellIndex !== null) {
				setExecutingCellIndex(cellIndex);
			}

			addPendingExecution(target.code);
			const request = buildExecutionRequest({
				target,
				cells,
				documentContent: editorContent,
				filepath: editorFilepath ?? undefined,
			});

			try {
				const { result } = await executeRequest(request);
				replacePendingExecution(normalizeResult(result, target.code));
			} catch (error) {
				const message =
					error instanceof ExecutionServiceError
						? error.message
						: "Execution failed due to an unexpected error.";
				replacePendingExecution(normalizeFailure(message, target.code));
			} finally {
				setExecutingCellIndex(null);
				setIsRunning(false);
			}
		},
		[
			addPendingExecution,
			replacePendingExecution,
			cells,
			editorContent,
			editorFilepath,
			setIsRunning,
		],
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
