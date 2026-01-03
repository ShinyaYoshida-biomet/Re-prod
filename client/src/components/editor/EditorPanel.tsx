import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { ForwardedRef } from "react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { ConfirmDialog, IconPlay, IconPlayCircle, useToast } from "@/components/shared";
import { useStore } from "@/core";
import { computeTargetRange, findCodeInEditor, matchPatchChunk } from "@/core/ai/contextMatcher";
import { commandRegistry } from "@/core/commands/registry";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useEditorCells } from "@/hooks/useEditorCells";
import { useEditorDecorations } from "@/hooks/useEditorDecorations";
import { useEditorExecution } from "@/hooks/useEditorExecution";
import type { AppliedCodeChange } from "@/core/state/slices/editorSlice";
import { acceptPendingEdit, rejectPendingEdit } from "@/services/pendingEditService";
import type { CodeBlock, CodeRange } from "@/types";
import { clamp } from "@/utils/math";
import { normalizeRelativePath } from "@/core/pathUtils";
import type { EditorRef } from "./editorRef";

function EditorPanelComponent(_: unknown, ref: ForwardedRef<EditorRef>): JSX.Element {
	const toast = useToast();
	const editor = useStore((state) => state.editor);
	const execution = useStore((state) => state.execution);
	const settings = useStore((state) => state.settings);
	const setEditorContent = useStore((state) => state.setEditorContent);
	const setEditorCursorPosition = useStore((state) => state.setEditorCursorPosition);
	const setApplyCodeChange = useStore((state) => state.setApplyCodeChange);
	const setRunCurrentCell = useStore((state) => state.setRunCurrentCell);
	const setRunAll = useStore((state) => state.setRunAll);
	const setMonacoEditor = useStore((state) => state.setMonacoEditor);
	const setEditorRef = useStore((state) => state.setEditorRef);
	const recordPatchMatchFailure = useStore((state) => state.recordPatchMatchFailure);
	const recordPatchMatchSuccess = useStore((state) => state.recordPatchMatchSuccess);
	const normalizedEditorPath = useMemo(
		() => normalizeRelativePath(editor.filepath, { keepRootEmpty: true }),
		[editor.filepath],
	);
	const pendingEdit = useStore((state) => state.pendingEdits[normalizedEditorPath]);
	const clearPendingEdit = useStore((state) => state.clearPendingEdit);
	const updatePendingEditStatus = useStore((state) => state.updatePendingEditStatus);
	const editorMethodsRef = useRef<EditorRef | null>(null);
	const monacoEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
	const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();
	const pendingEditWarningRef = useRef(false);
	const [pendingNotice, setPendingNotice] = useState<{
		type: "warning" | "error";
		message: string;
	} | null>(null);

	const cells = useEditorCells(editor.content, editor.filepath);
	const { state, actions } = useEditorExecution({
		editorRef: monacoEditorRef,
		cells,
	});
	const { executingCellIndex } = state;
	const { handleRunAll, handleRunCurrentCell } = actions;

	useEditorDecorations(monacoEditorRef, cells, {
		showCellDecorations: settings.showCellDecorations,
		highlightExecutingCell: settings.highlightExecutingCell,
		executingCellIndex,
	});

	useEffect(() => {
		pendingEditWarningRef.current = false;
		setPendingNotice(null);
	}, [pendingEdit?.id]);

	useEffect(() => {
		if (!pendingEdit) return;
		if (editor.content === pendingEdit.newContent) return;
		setEditorContent(pendingEdit.newContent);
	}, [editor.content, pendingEdit, setEditorContent]);

	const handlePendingAccept = useCallback(async () => {
		if (!pendingEdit) return;
		if (editor.content !== pendingEdit.newContent) {
			setPendingNotice({
				type: "warning",
				message: "Editor content changed since the pending edit was created.",
			});
			return;
		}
		try {
			await acceptPendingEdit(pendingEdit);
			updatePendingEditStatus(pendingEdit.filePath, "accepted");
			clearPendingEdit(pendingEdit.filePath);
			setPendingNotice(null);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to accept pending edit";
			setPendingNotice({
				type: "error",
				message: message.includes("Pending edit not found")
					? "Pending edit is no longer available. Re-run the change or reject it."
					: message,
			});
		}
	}, [clearPendingEdit, editor.content, pendingEdit, updatePendingEditStatus]);

	const handlePendingReject = useCallback(async () => {
		if (!pendingEdit) return;
		try {
			await rejectPendingEdit(pendingEdit);
			setEditorContent(pendingEdit.oldContent);
			updatePendingEditStatus(pendingEdit.filePath, "rejected");
			clearPendingEdit(pendingEdit.filePath);
			setPendingNotice(null);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to reject pending edit";
			setPendingNotice({
				type: "error",
				message: message.includes("Pending edit not found")
					? "Pending edit is no longer available. The buffer may already be resolved."
					: message,
			});
		}
	}, [clearPendingEdit, pendingEdit, setEditorContent, updatePendingEditStatus]);

	useEffect(() => {
		if (!pendingEdit) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
				event.preventDefault();
				handlePendingAccept();
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				handlePendingReject();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handlePendingAccept, handlePendingReject, pendingEdit]);

	const handleEditorChange = (value: string | undefined): void => {
		if (value !== undefined) {
			if (pendingEdit && !pendingEditWarningRef.current) {
				if (!pendingNotice || pendingNotice.type !== "error") {
					setPendingNotice({
						type: "warning",
						message: "Resolve the pending edit before making additional changes.",
					});
				}
				pendingEditWarningRef.current = true;
			}
			setEditorContent(value);
		}
	};

	const navigateToLine = useCallback((lineNumber: number): void => {
		const monacoEditor = monacoEditorRef.current;
		if (!monacoEditor) {
			return;
		}

		const model = monacoEditor.getModel();
		if (!model) {
			return;
		}

		const clampLine = clamp(lineNumber, 1, model.getLineCount());
		monacoEditor.revealLine(clampLine);
		monacoEditor.setPosition({ lineNumber: clampLine, column: 1 });
		monacoEditor.focus();
	}, []);

	const focusEditor = useCallback((): void => {
		const monacoEditor = monacoEditorRef.current;
		if (!monacoEditor) {
			return;
		}

		monacoEditor.focus();
	}, []);

	const editorMethods = useMemo(
		() => ({
			navigateToLine,
			focus: focusEditor,
		}),
		[focusEditor, navigateToLine],
	);

	useImperativeHandle(ref, () => editorMethods, [editorMethods]);
	useImperativeHandle(editorMethodsRef, () => editorMethods, [editorMethods]);

	// Apply code changes from AI
	const applyCodeChange = useCallback(
		async (codeBlock: CodeBlock): Promise<AppliedCodeChange | null> => {
			const monacoEditor = monacoEditorRef.current;
			if (!monacoEditor) {
				return null;
			}

			const model = monacoEditor.getModel();
			if (!model) {
				return null;
			}

			const clampLine = (line: number): number => clamp(line, 1, model.getLineCount());

			const clampColumn = (line: number, column?: number): number => {
				const maxColumn = model.getLineMaxColumn(line);
				const requested = column ?? 1;
				return clamp(requested, 1, maxColumn);
			};

			const editorContent = monacoEditor.getValue();
			const originalContent = editorContent;
			const contextAlertMessage =
				"Unable to locate the suggested context in the current editor. Try running the suggestion again after scrolling the intended section into view.";
			let contextMatchingFailed = false;
			let contextAlertPending = false;

			const finalizeChange = (): AppliedCodeChange | null => {
				const newContent = monacoEditor.getValue();
				if (newContent === originalContent) {
					return null;
				}
				return { oldContent: originalContent, newContent };
			};

			const resolveTargetRange = (): CodeRange | undefined => {
				if (codeBlock.targetRange) {
					return codeBlock.targetRange;
				}

				if (codeBlock.originalCode) {
					return computeTargetRange(editorContent, codeBlock.originalCode) ?? undefined;
				}

				return undefined;
			};

			const applyRange = (range: CodeRange, text: string): void => {
				monacoEditor.executeEdits("ai-apply", [
					{
						range: {
							startLineNumber: clampLine(range.startLine),
							startColumn: clampColumn(range.startLine, range.startColumn),
							endLineNumber: clampLine(range.endLine),
							endColumn: clampColumn(range.endLine, range.endColumn),
						},
						text,
					},
				]);
				setEditorContent(monacoEditor.getValue());
			};

			const applySnapshotEdit = (snapshot: string, range: CodeRange, text: string): string => {
				const lines = snapshot.split(/\r?\n/);
				const startIndex = Math.max(range.startLine - 1, 0);
				const endIndex = Math.min(range.endLine, lines.length);
				const replacement = text.length ? text.split(/\r?\n/) : [];
				return [...lines.slice(0, startIndex), ...replacement, ...lines.slice(endIndex)].join("\n");
			};

			const applySimpleChanges = (): boolean => {
				if (!codeBlock.simpleChanges?.length) {
					return false;
				}

				const plannedEdits: Array<{ range: CodeRange; text: string }> = [];
				let snapshot = editorContent;
				let appliedCount = 0;

				for (const change of codeBlock.simpleChanges) {
					const range = findCodeInEditor(
						snapshot,
						change.oldLines,
						change.beforeContext,
						change.afterContext,
					);
					if (!range) {
						// If the new lines already exist, treat as already applied and continue.
						const alreadyApplied = findCodeInEditor(snapshot, change.newLines, [], []);
						if (alreadyApplied) {
							appliedCount += 1;
							continue;
						}
						contextMatchingFailed = true;
						contextAlertPending = true;
						recordPatchMatchFailure("Unable to match contextual diff block", codeBlock.id);
						continue;
					}

					const replacement = change.newLines.join("\n");
					plannedEdits.push({ range, text: replacement });
					snapshot = applySnapshotEdit(snapshot, range, replacement);
					appliedCount += 1;
				}

				if (!appliedCount) {
					return false;
				}

				for (const edit of plannedEdits) {
					applyRange(edit.range, edit.text);
				}

				recordPatchMatchSuccess();
				return true;
			};

			const applyPatchChunks = (): boolean => {
				if (!codeBlock.patchChunks?.length) {
					return false;
				}

				const plannedEdits: Array<{ range: CodeRange; text: string }> = [];
				let snapshot = editorContent;

				for (const chunk of codeBlock.patchChunks) {
					const range = matchPatchChunk(snapshot, chunk);
					if (!range) {
						const alreadyApplied = chunk.newLines.length
							? findCodeInEditor(snapshot, chunk.newLines, [], [])
							: null;
						if (alreadyApplied) {
							continue;
						}
						recordPatchMatchFailure(
							`Unable to match patch chunk: ${chunk.context ?? "missing context"}`,
							codeBlock.id,
						);
						contextMatchingFailed = true;
						contextAlertPending = true;
						return false;
					}

					const replacement = chunk.newLines.join("\n");
					plannedEdits.push({ range, text: replacement });
					snapshot = applySnapshotEdit(snapshot, range, replacement);
				}

				for (const edit of plannedEdits) {
					applyRange(edit.range, edit.text);
				}

				recordPatchMatchSuccess();
				return true;
			};

			const applyRangeChange = (text: string, alertOnFail = true): boolean => {
				const range = resolveTargetRange();
				if (!range) {
					if (alertOnFail) {
						recordPatchMatchFailure(`Missing target range for ${codeBlock.action}`, codeBlock.id);
						const hasExplicitContext = Boolean(codeBlock.targetRange);
						if (
							alertOnFail &&
							contextAlertPending &&
							hasExplicitContext &&
							typeof window !== "undefined"
						) {
							toast.showError(contextAlertMessage);
						}
					}
					return false;
				}

				applyRange(range, text);
				recordPatchMatchSuccess();
				return true;
			};

			const hasStructuredContext = Boolean(
				codeBlock.simpleChanges?.length || codeBlock.patchChunks?.length || codeBlock.targetRange,
			);

			const effectiveAction =
				codeBlock.action === "insert" && codeBlock.simpleChanges?.length
					? "replace-range"
					: codeBlock.action === "insert" && !hasStructuredContext
						? "replace-all"
						: codeBlock.action;

			const applyStructuredContext = (): boolean => {
				// Prefer patch chunks (highest fidelity), then simple changes
				const patchApplied = applyPatchChunks();
				if (patchApplied) {
					return true;
				}

				const simpleApplied = applySimpleChanges();
				return simpleApplied;
			};

			switch (effectiveAction) {
				case "replace-all": {
					const structuredApplied = applyStructuredContext();
					if (structuredApplied) {
						return finalizeChange();
					}

					const appliedRange = applyRangeChange(codeBlock.code, false);
					if (appliedRange) {
						return finalizeChange();
					}

					const target = codeBlock.filepath ? `file ${codeBlock.filepath}` : "current editor";
					const confirmationMessage = contextMatchingFailed
						? `Context matching failed, so this action will replace the entire ${target}. Proceed only if you understand the change.`
						: `This AI suggestion will replace the entire ${target}. Proceed only if you understand the change.`;
					const confirmed = await showConfirm("Confirm Replace All", confirmationMessage);
					if (confirmed) {
						monacoEditor.setValue(codeBlock.code);
						setEditorContent(codeBlock.code);
						return finalizeChange();
					}
					return null;
				}
				case "replace-range": {
					const structuredApplied = applyStructuredContext();
					if (structuredApplied) {
						return finalizeChange();
					}

					const applied = applyRangeChange(codeBlock.code, contextMatchingFailed);
					if (applied) {
						return finalizeChange();
					}

					const target = codeBlock.filepath ? `file ${codeBlock.filepath}` : "current editor";
					const confirmed = await showConfirm(
						"Confirm Replace All",
						`Could not match the suggested context. Replace the entire ${target} with the suggested code?`,
					);
					if (confirmed) {
						monacoEditor.setValue(codeBlock.code);
						setEditorContent(codeBlock.code);
						return finalizeChange();
					}
					return null;
				}
				case "delete-range": {
					const structuredApplied = applyStructuredContext();
					if (!structuredApplied) {
						const applied = applyRangeChange("", contextMatchingFailed);
						if (!applied) {
							return null;
						}
					}
					return finalizeChange();
				}
				case "insert": {
					const position = monacoEditor.getPosition();
					if (position) {
						applyRange(
							{
								startLine: position.lineNumber,
								startColumn: position.column,
								endLine: position.lineNumber,
								endColumn: position.column,
							},
							codeBlock.code,
						);
						return finalizeChange();
					}
					return null;
				}
				case "create-file":
					return null;
				default:
					return null;
			}
		},
		[setEditorContent, showConfirm, recordPatchMatchFailure, recordPatchMatchSuccess],
	);

	useEffect(() => {
		setApplyCodeChange(applyCodeChange);
	}, [applyCodeChange, setApplyCodeChange]);

	useEffect(() => {
		setEditorRef(editorMethodsRef);
		return () => {
			setEditorRef(null);
		};
	}, [editorMethodsRef, setEditorRef]);

	useEffect(() => {
		setRunCurrentCell(handleRunCurrentCell);
		setRunAll(handleRunAll);
	}, [handleRunCurrentCell, handleRunAll, setRunCurrentCell, setRunAll]);

	const handleEditorDidMount = (
		monacoEditor: MonacoEditor.IStandaloneCodeEditor,
		monaco: Monaco,
	): void => {
		monacoEditorRef.current = monacoEditor;
		setMonacoEditor(monacoEditor);

		// Track cursor position
		monacoEditor.onDidChangeCursorPosition((e) => {
			setEditorCursorPosition({
				line: e.position.lineNumber,
				column: e.position.column,
			});
		});

		// Keyboard shortcuts
		// Cmd/Ctrl + Enter: Run current cell
		monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			commandRegistry.execute("code.runSelection");
		});

		// Cmd/Ctrl + Shift + Enter: Run all
		monacoEditor.addCommand(
			monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
			() => {
				commandRegistry.execute("code.runAll");
			},
		);
	};

	return (
		<>
			<div className="panel editor-panel">
				<div className="panel-header">
					<div className="panel-title">
						{editor.filepath || "Untitled.R"}
						{editor.isDirty && <span className="dirty-marker"> •</span>}
					</div>
					<div className="panel-actions">
						<button
							className="btn"
							onClick={() => commandRegistry.execute("code.runSelection")}
							disabled={execution.isRunning}
							title="Run Current Cell (Cmd/Ctrl+Enter)"
						>
							<IconPlay width={16} height={16} aria-hidden />
							Run Selection
						</button>
						<button
							className="btn btn-primary"
							onClick={() => commandRegistry.execute("code.runAll")}
							disabled={execution.isRunning}
							title="Run All (Cmd/Ctrl+Shift+Enter)"
						>
							{execution.isRunning ? (
								<>
									<div className="spinner"></div>
									Running
								</>
							) : (
								<>
									<IconPlayCircle width={16} height={16} aria-hidden />
									Run All
								</>
							)}
						</button>
					</div>
				</div>
				{pendingEdit && (
					<div className="pending-edit-toolbar">
						<div className="pending-edit-info">
							Pending edit ({pendingEdit.source.type === "acp" ? "ACP" : "API Key"})
						</div>
						{pendingNotice && (
							<div className={`pending-edit-message ${pendingNotice.type}`}>
								{pendingNotice.message}
							</div>
						)}
						<div className="pending-edit-actions">
							<button className="btn btn-primary" onClick={handlePendingAccept} type="button">
								Accept (Enter)
							</button>
							<button className="btn" onClick={handlePendingReject} type="button">
								Reject (Esc)
							</button>
						</div>
					</div>
				)}
				<div className="panel-content">
					<Editor
						height="100%"
						defaultLanguage="r"
						theme="vs"
						value={editor.content}
						onChange={handleEditorChange}
						options={{
							fontSize: settings.fontSize,
							fontFamily: "Monaco, Menlo, Consolas, monospace",
							minimap: { enabled: false },
							scrollBeyondLastLine: false,
							wordWrap: "on",
							lineNumbers: "on",
							renderWhitespace: "selection",
							tabSize: 2,
							automaticLayout: true,
							padding: { top: 8, bottom: 8 },
							scrollbar: {
								useShadows: false,
								verticalScrollbarSize: 12,
								horizontalScrollbarSize: 12,
							},
						}}
						onMount={handleEditorDidMount}
					/>
				</div>
			</div>
			<ConfirmDialog
				open={dialogState.open}
				title={dialogState.title}
				message={dialogState.message}
				onConfirm={handleConfirm}
				onCancel={handleCancel}
			/>
		</>
	);
}

export const EditorPanel = forwardRef<EditorRef>(EditorPanelComponent);
EditorPanel.displayName = "EditorPanel";
