import Editor, { DiffEditor, type Monaco } from "@monaco-editor/react";
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
import { ConfirmDialog, IconPlay, IconPlayCircle } from "@/components/shared";
import { useStore } from "@/core";
import { commandRegistry } from "@/core/commands/registry";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import { useEditorCells } from "@/hooks/useEditorCells";
import { usePendingEditApplicator } from "@/hooks/usePendingEditApplicator";
import { useEditorDecorations } from "@/hooks/useEditorDecorations";
import { useEditorExecution } from "@/hooks/useEditorExecution";
import {
	acceptPendingEdit,
	rejectPendingEdit,
	updatePendingEdit,
} from "@/services/pendingEditService";
import type { DiffHunk } from "@/types/generated";
import type { PendingEditReviewMap, PendingEditReviewStatus } from "@/types/pendingEdit";
import { clamp } from "@/utils/math";
import { applyPendingEditChanges } from "@/utils/pendingEditDiff";
import { TabBar } from "./TabBar";
import { PendingEditDiffView } from "./PendingEditDiffView";
import type { EditorRef } from "./editorRef";

function EditorPanelComponent(_: unknown, ref: ForwardedRef<EditorRef>): JSX.Element {
	const getHunkHeaderLine = useCallback(
		(hunk: { change: { originalStartLine: number; modifiedStartLine: number } }): number => {
			return hunk.change.originalStartLine > 0
				? hunk.change.originalStartLine
				: hunk.change.modifiedStartLine;
		},
		[],
	);

	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const execution = useStore((state) => state.execution);
	const settings = useStore((state) => state.settings);
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);
	const updateBuffer = useStore((state) => state.updateBuffer);
	const setApplyCodeChange = useStore((state) => state.setApplyCodeChange);
	const setRunCurrentCell = useStore((state) => state.setRunCurrentCell);
	const setRunAll = useStore((state) => state.setRunAll);
	const setMonacoEditor = useStore((state) => state.setMonacoEditor);
	const setEditorRef = useStore((state) => state.setEditorRef);
	const activeBufferId = activeBuffer?.id ?? null;
	const editorContent = activeBuffer?.content ?? "";
	const editorFilepath = activeBuffer?.filepath ?? "";
	const normalizedEditorPath = useMemo(
		() => normalizeWorkspaceRelativePath(editorFilepath, workspaceRoot, { keepRootEmpty: true }),
		[editorFilepath, workspaceRoot],
	);
	const pendingEdit = useStore((state) => state.pendingEdits[normalizedEditorPath]);
	const clearPendingEdit = useStore((state) => state.clearPendingEdit);
	const updatePendingEditReview = useStore((state) => state.updatePendingEditReview);
	const setPendingEditReviewMap = useStore((state) => state.setPendingEditReviewMap);
	const editorMethodsRef = useRef<EditorRef | null>(null);
	const monacoEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
	const activeBufferIdRef = useRef<string | null>(activeBufferId);
	const { applyCodeChange, dialogState, handleConfirm, handleCancel } =
		usePendingEditApplicator(monacoEditorRef);
	const pendingEditWarningRef = useRef(false);
	const skipPendingNoticeRef = useRef(false);
	const [pendingNotice, setPendingNotice] = useState<{
		type: "warning" | "error";
		message: string;
	} | null>(null);
	const [showWhitespace, setShowWhitespace] = useState(false);
	const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
	const [activeHunkId, setActiveHunkId] = useState<string | null>(null);
	const pendingEditReviewMap = pendingEdit?.reviewedChanges ?? {};
	const pendingEditChanges = pendingEdit?.changes ?? [];
	const pendingEditHunks = pendingEdit?.hunks ?? [];
	const activeCursorPosition = activeBuffer?.cursorPosition;
	const reviewedContent = useMemo(() => {
		if (!pendingEdit) return null;
		return applyPendingEditChanges(
			pendingEdit.oldContent,
			pendingEditChanges,
			pendingEditReviewMap,
		);
	}, [pendingEdit, pendingEditChanges, pendingEditReviewMap]);
	const pendingEditSummary = useMemo(() => {
		if (!pendingEdit) {
			return { total: 0, keep: 0, reject: 0, pending: 0 };
		}
		let keep = 0;
		let reject = 0;
		let pending = 0;
		for (const change of pendingEditChanges) {
			const status = pendingEditReviewMap[change.id];
			if (status === "keep") {
				keep += 1;
			} else if (status === "reject") {
				reject += 1;
			} else {
				pending += 1;
			}
		}
		return { total: pendingEditChanges.length, keep, reject, pending };
	}, [pendingEdit, pendingEditChanges, pendingEditReviewMap]);
	const pendingHunks = useMemo(() => {
		return pendingEditHunks.filter((hunk) => !pendingEditReviewMap[hunk.id]);
	}, [pendingEditHunks, pendingEditReviewMap]);

	useEffect(() => {
		if (!pendingEdit) {
			setActiveHunkId(null);
			return;
		}
		if (pendingHunks.length === 0) {
			setActiveHunkId(null);
			return;
		}
		if (!activeHunkId || !pendingHunks.some((hunk) => hunk.id === activeHunkId)) {
			setActiveHunkId(pendingHunks[0].id);
		}
	}, [activeHunkId, pendingEdit, pendingHunks]);

	const cells = useEditorCells(editorContent, editorFilepath);
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
		activeBufferIdRef.current = activeBufferId;
	}, [activeBufferId]);

	useEffect(() => {
		if (!activeCursorPosition) return;
		const monacoEditor = monacoEditorRef.current;
		if (!monacoEditor) return;
		const { line, column } = activeCursorPosition;
		monacoEditor.setPosition({ lineNumber: line, column });
		monacoEditor.revealLineInCenter(line);
	}, [activeBufferId, activeCursorPosition]);

	useEffect(() => {
		if (!pendingEdit) return;
		if (reviewedContent === null) return;
		if (editorContent === reviewedContent) return;
		skipPendingNoticeRef.current = true;
		if (activeBufferId) {
			updateBuffer(activeBufferId, { content: reviewedContent, isDirty: true });
		}
	}, [activeBufferId, editorContent, pendingEdit, reviewedContent, updateBuffer]);

	useEffect(() => {
		if (!pendingEdit) return;
		const nextMap: PendingEditReviewMap = { ...pendingEditReviewMap };
		let updated = false;
		for (const change of pendingEditChanges) {
			if (!(change.id in nextMap)) {
				nextMap[change.id] = "keep";
				updated = true;
			}
		}
		if (updated) {
			setPendingEditReviewMap(pendingEdit.filePath, nextMap);
		}
	}, [pendingEdit, pendingEditChanges, pendingEditReviewMap, setPendingEditReviewMap]);

	const handlePendingAccept = useCallback(async () => {
		if (!pendingEdit) return;
		const resolvedContent = reviewedContent ?? pendingEdit.newContent;
		if (editorContent !== resolvedContent) {
			setPendingNotice({
				type: "warning",
				message: "Editor content changed since the pending edit review.",
			});
			return;
		}
		try {
			if (pendingEdit.source.type === "acp" && resolvedContent !== pendingEdit.newContent) {
				await updatePendingEdit(pendingEdit, resolvedContent);
			}
			await acceptPendingEdit(pendingEdit);
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
	}, [clearPendingEdit, editorContent, pendingEdit, reviewedContent, updatePendingEdit]);

	const handlePendingReject = useCallback(async () => {
		if (!pendingEdit) return;
		try {
			await rejectPendingEdit(pendingEdit);
			if (activeBufferId) {
				updateBuffer(activeBufferId, { content: pendingEdit.oldContent, isDirty: true });
			}
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
	}, [activeBufferId, clearPendingEdit, pendingEdit, updateBuffer]);

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

	const focusHunk = useCallback(
		(hunk: DiffHunk): void => {
			setActiveHunkId(hunk.id);
			const targetLine = getHunkHeaderLine(hunk);
			if (typeof requestAnimationFrame === "function") {
				requestAnimationFrame(() => navigateToLine(targetLine));
			} else {
				navigateToLine(targetLine);
			}
		},
		[getHunkHeaderLine, navigateToLine],
	);

	const handlePrevHunk = useCallback(() => {
		if (!pendingHunks.length) return;
		const currentIndex = pendingHunks.findIndex((hunk) => hunk.id === activeHunkId);
		const previousIndex = currentIndex > 0 ? currentIndex - 1 : 0;
		focusHunk(pendingHunks[previousIndex]);
	}, [activeHunkId, focusHunk, pendingHunks]);

	const handleNextHunk = useCallback(() => {
		if (!pendingHunks.length) return;
		const currentIndex = pendingHunks.findIndex((hunk) => hunk.id === activeHunkId);
		const nextIndex =
			currentIndex >= 0 && currentIndex < pendingHunks.length - 1
				? currentIndex + 1
				: pendingHunks.length - 1;
		focusHunk(pendingHunks[nextIndex]);
	}, [activeHunkId, focusHunk, pendingHunks]);

	const handlePendingReviewChange = useCallback(
		(changeId: string, status: PendingEditReviewStatus) => {
			if (!pendingEdit) return;
			updatePendingEditReview(pendingEdit.filePath, changeId, status);
			const nextReviewMap: PendingEditReviewMap = {
				...pendingEditReviewMap,
				[changeId]: status,
			};
			const currentIndex = pendingEditHunks.findIndex((hunk) => hunk.id === changeId);
			const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
			const nextPending =
				pendingEditHunks.slice(startIndex).find((hunk) => !nextReviewMap[hunk.id]) ??
				pendingEditHunks.find((hunk) => !nextReviewMap[hunk.id]);

			if (nextPending) {
				focusHunk(nextPending);
			}
		},
		[focusHunk, pendingEdit, pendingEditHunks, pendingEditReviewMap, updatePendingEditReview],
	);

	const handlePendingHunkNavigate = useCallback(
		(lineNumber: number, hunkId: string) => {
			setActiveHunkId(hunkId);
			navigateToLine(lineNumber);
		},
		[navigateToLine],
	);

	const handlePendingKeepAll = useCallback(() => {
		if (!pendingEdit) return;
		const nextMap: PendingEditReviewMap = {};
		for (const change of pendingEditChanges) {
			nextMap[change.id] = "keep";
		}
		setPendingEditReviewMap(pendingEdit.filePath, nextMap);
	}, [pendingEdit, pendingEditChanges, setPendingEditReviewMap]);

	const handlePendingRejectAll = useCallback(() => {
		if (!pendingEdit) return;
		const nextMap: PendingEditReviewMap = {};
		for (const change of pendingEditChanges) {
			nextMap[change.id] = "reject";
		}
		setPendingEditReviewMap(pendingEdit.filePath, nextMap);
	}, [pendingEdit, pendingEditChanges, setPendingEditReviewMap]);

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
			if (pendingEdit && skipPendingNoticeRef.current) {
				skipPendingNoticeRef.current = false;
				if (activeBufferId) {
					updateBuffer(activeBufferId, { content: value, isDirty: true });
				}
				return;
			}
			if (pendingEdit && !pendingEditWarningRef.current) {
				if (!pendingNotice || pendingNotice.type !== "error") {
					setPendingNotice({
						type: "warning",
						message: "Resolve the pending edit before making additional changes.",
					});
				}
				pendingEditWarningRef.current = true;
			}
			if (activeBufferId) {
				updateBuffer(activeBufferId, { content: value, isDirty: true });
			}
		}
	};

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
			const currentBufferId = activeBufferIdRef.current;
			if (currentBufferId) {
				updateBuffer(currentBufferId, {
					cursorPosition: {
						line: e.position.lineNumber,
						column: e.position.column,
					},
				});
			}
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
				<div className="panel-header editor-panel-header">
					<TabBar />
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
					<div className="pending-edit-review">
						<div className="pending-edit-review-toolbar">
							<div className="pending-edit-review-summary">
								Pending edit ({pendingEdit.source.type === "acp" ? "ACP" : "API Key"})
							</div>
							<div className="pending-edit-review-meta">
								{pendingEditSummary.total} hunks · {pendingEditSummary.keep} keep ·{" "}
								{pendingEditSummary.reject} reject · {pendingEditSummary.pending} pending
							</div>
							<div className="pending-edit-review-controls">
								<button
									className="btn"
									onClick={handlePrevHunk}
									type="button"
									disabled={!pendingHunks.length}
								>
									Prev Hunk
								</button>
								<button
									className="btn"
									onClick={handleNextHunk}
									type="button"
									disabled={!pendingHunks.length}
								>
									Next Hunk
								</button>
								<button
									className={`btn ${showWhitespace ? "btn-primary" : ""}`}
									onClick={() => setShowWhitespace((prev) => !prev)}
									type="button"
								>
									Show Whitespace
								</button>
								<button
									className={`btn ${ignoreWhitespace ? "btn-primary" : ""}`}
									onClick={() => setIgnoreWhitespace((prev) => !prev)}
									type="button"
								>
									Ignore Whitespace
								</button>
							</div>
							{pendingNotice && (
								<div className={`pending-edit-message ${pendingNotice.type}`}>
									{pendingNotice.message}
								</div>
							)}
							<div className="pending-edit-review-actions">
								<button className="btn" onClick={handlePendingKeepAll} type="button">
									Keep All
								</button>
								<button className="btn" onClick={handlePendingRejectAll} type="button">
									Reject All
								</button>
								<button className="btn btn-primary" onClick={handlePendingAccept} type="button">
									Apply (Enter)
								</button>
								<button className="btn" onClick={handlePendingReject} type="button">
									Discard (Esc)
								</button>
							</div>
						</div>
						{pendingEditHunks.length > 0 ? (
							<PendingEditDiffView
								hunks={pendingEditHunks}
								reviewMap={pendingEditReviewMap}
								onReviewChange={handlePendingReviewChange}
								onNavigateToLine={handlePendingHunkNavigate}
							/>
						) : (
							<div className="pending-edit-message warning">
								No pending changes detected in the diff view.
							</div>
						)}
					</div>
				)}
				<div className="panel-content">
					{pendingEdit ? (
						<div className="editor-split">
							<div className="editor-pane">
								<Editor
									height="100%"
									defaultLanguage="r"
									theme="vs"
									value={editorContent}
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
										readOnly: true,
										scrollbar: {
											useShadows: false,
											verticalScrollbarSize: 12,
											horizontalScrollbarSize: 12,
										},
									}}
									onMount={handleEditorDidMount}
								/>
							</div>
							<div className="editor-pane diff-pane">
								<DiffEditor
									height="100%"
									original={pendingEdit.oldContent}
									modified={pendingEdit.newContent}
									theme="vs"
									language="r"
									options={{
										readOnly: true,
										renderSideBySide: true,
										renderWhitespace: showWhitespace ? "all" : "selection",
										ignoreTrimWhitespace: ignoreWhitespace,
										minimap: { enabled: false },
										scrollBeyondLastLine: false,
										automaticLayout: true,
										lineNumbers: "on",
										glyphMargin: false,
										folding: false,
										lineDecorationsWidth: 18,
										lineNumbersMinChars: 3,
									}}
								/>
							</div>
						</div>
					) : (
						<Editor
							height="100%"
							defaultLanguage="r"
							theme="vs"
							value={editorContent}
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
								readOnly: false,
								scrollbar: {
									useShadows: false,
									verticalScrollbarSize: 12,
									horizontalScrollbarSize: 12,
								},
							}}
							onMount={handleEditorDidMount}
						/>
					)}
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
