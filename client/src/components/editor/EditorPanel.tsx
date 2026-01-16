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
import { ConfirmDialog, IconPlay, IconPlayCircle, useToast } from "@/components/shared";
import { useStore } from "@/core";
import { computeTargetRange, findCodeInEditor, matchPatchChunk } from "@/core/ai/contextMatcher";
import { commandRegistry } from "@/core/commands/registry";
import { useFileSystemStore } from "@/core/fileSystemStore";
import type { AppliedCodeChange } from "@/core/state/slices/editorSlice";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useEditorCells } from "@/hooks/useEditorCells";
import { useEditorDecorations } from "@/hooks/useEditorDecorations";
import { useEditorExecution } from "@/hooks/useEditorExecution";
import {
	acceptPendingEdit,
	rejectPendingEdit,
	updatePendingEdit,
} from "@/services/pendingEditService";
import type { CodeBlock, CodeRange } from "@/types";
import type { PendingEditReviewMap, PendingEditReviewStatus } from "@/types/pendingEdit";
import { clamp } from "@/utils/math";
import {
	applyPendingEditChanges,
	buildDiffChanges,
	buildDiffHunks,
	type DiffChange,
	type DiffHunk,
} from "@/utils/pendingEditDiff";
import { TabBar } from "./TabBar";
import { PendingEditDiffView } from "./PendingEditDiffView";
import type { EditorRef } from "./editorRef";

function EditorPanelComponent(_: unknown, ref: ForwardedRef<EditorRef>): JSX.Element {
	type PendingEditDiff = {
		changes: DiffChange[];
		hunks: DiffHunk[];
	};

	const getHunkHeaderLine = useCallback((hunk: DiffHunk): number => {
		return hunk.change.originalStartLine > 0
			? hunk.change.originalStartLine
			: hunk.change.modifiedStartLine;
	}, []);

	const toast = useToast();
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
	const recordPatchMatchFailure = useStore((state) => state.recordPatchMatchFailure);
	const recordPatchMatchSuccess = useStore((state) => state.recordPatchMatchSuccess);
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
	const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();
	const pendingEditWarningRef = useRef(false);
	const skipPendingNoticeRef = useRef(false);
	const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
	const [pendingNotice, setPendingNotice] = useState<{
		type: "warning" | "error";
		message: string;
	} | null>(null);
	const [showWhitespace, setShowWhitespace] = useState(false);
	const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
	const [activeHunkId, setActiveHunkId] = useState<string | null>(null);
	const pendingEditReviewMap = pendingEdit?.reviewedChanges ?? {};
	const [pendingEditDiff, setPendingEditDiff] = useState<PendingEditDiff | null>(null);
	const activeCursorPosition = activeBuffer?.cursorPosition;
	const reviewedContent = useMemo(() => {
		if (!pendingEdit || !pendingEditDiff) return null;
		return applyPendingEditChanges(
			pendingEdit.oldContent,
			pendingEditDiff.changes,
			pendingEditReviewMap,
		);
	}, [pendingEdit, pendingEditDiff, pendingEditReviewMap]);
	const pendingEditSummary = useMemo(() => {
		if (!pendingEditDiff) {
			return { total: 0, keep: 0, reject: 0, pending: 0 };
		}
		let keep = 0;
		let reject = 0;
		let pending = 0;
		for (const change of pendingEditDiff.changes) {
			const status = pendingEditReviewMap[change.id];
			if (status === "keep") {
				keep += 1;
			} else if (status === "reject") {
				reject += 1;
			} else {
				pending += 1;
			}
		}
		return { total: pendingEditDiff.changes.length, keep, reject, pending };
	}, [pendingEditDiff, pendingEditReviewMap]);
	const pendingHunks = useMemo(() => {
		if (!pendingEditDiff) return [];
		return pendingEditDiff.hunks.filter((hunk) => !pendingEditReviewMap[hunk.id]);
	}, [pendingEditDiff, pendingEditReviewMap]);

	useEffect(() => {
		if (!pendingEditDiff) {
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
	}, [activeHunkId, pendingEditDiff, pendingHunks]);

	useEffect(() => {
		if (!pendingEdit || !monacoInstance) {
			setPendingEditDiff(null);
			return;
		}
		if (typeof document === "undefined") {
			setPendingEditDiff(null);
			return;
		}

		setPendingEditDiff(null);

		const language = monacoEditorRef.current?.getModel()?.getLanguageId();
		const original = monacoInstance.editor.createModel(pendingEdit.oldContent, language);
		const modified = monacoInstance.editor.createModel(pendingEdit.newContent, language);
		const diffContainer = document.createElement("div");
		const diffEditor = monacoInstance.editor.createDiffEditor(diffContainer, {
			readOnly: true,
		});
		let disposed = false;

		const updateDiff = (): void => {
			if (disposed) return;
			const changes = diffEditor.getLineChanges();
			if (!changes) return;
			const diffChanges = buildDiffChanges(pendingEdit.oldContent, pendingEdit.newContent, changes);
			setPendingEditDiff({
				changes: diffChanges,
				hunks: buildDiffHunks(diffChanges),
			});
		};

		const subscription = diffEditor.onDidUpdateDiff(updateDiff);
		diffEditor.setModel({ original, modified });
		updateDiff();

		return () => {
			disposed = true;
			subscription.dispose();
			diffEditor.dispose();
			original.dispose();
			modified.dispose();
		};
	}, [monacoInstance, pendingEdit]);

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
		if (!pendingEdit || !pendingEditDiff) return;
		const nextMap: PendingEditReviewMap = { ...pendingEditReviewMap };
		let updated = false;
		for (const change of pendingEditDiff.changes) {
			if (!(change.id in nextMap)) {
				nextMap[change.id] = "keep";
				updated = true;
			}
		}
		if (updated) {
			setPendingEditReviewMap(pendingEdit.filePath, nextMap);
		}
	}, [pendingEdit, pendingEditDiff, pendingEditReviewMap, setPendingEditReviewMap]);

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
			if (!pendingEdit || !pendingEditDiff) return;
			updatePendingEditReview(pendingEdit.filePath, changeId, status);
			const nextReviewMap: PendingEditReviewMap = {
				...pendingEditReviewMap,
				[changeId]: status,
			};
			const currentIndex = pendingEditDiff.hunks.findIndex((hunk) => hunk.id === changeId);
			const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
			const nextPending =
				pendingEditDiff.hunks.slice(startIndex).find((hunk) => !nextReviewMap[hunk.id]) ??
				pendingEditDiff.hunks.find((hunk) => !nextReviewMap[hunk.id]);

			if (nextPending) {
				focusHunk(nextPending);
			}
		},
		[focusHunk, pendingEdit, pendingEditDiff, pendingEditReviewMap, updatePendingEditReview],
	);

	const handlePendingHunkNavigate = useCallback(
		(lineNumber: number, hunkId: string) => {
			setActiveHunkId(hunkId);
			navigateToLine(lineNumber);
		},
		[navigateToLine],
	);

	const handlePendingKeepAll = useCallback(() => {
		if (!pendingEdit || !pendingEditDiff) return;
		const nextMap: PendingEditReviewMap = {};
		for (const change of pendingEditDiff.changes) {
			nextMap[change.id] = "keep";
		}
		setPendingEditReviewMap(pendingEdit.filePath, nextMap);
	}, [pendingEdit, pendingEditDiff, setPendingEditReviewMap]);

	const handlePendingRejectAll = useCallback(() => {
		if (!pendingEdit || !pendingEditDiff) return;
		const nextMap: PendingEditReviewMap = {};
		for (const change of pendingEditDiff.changes) {
			nextMap[change.id] = "reject";
		}
		setPendingEditReviewMap(pendingEdit.filePath, nextMap);
	}, [pendingEdit, pendingEditDiff, setPendingEditReviewMap]);

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
				if (activeBufferId) {
					updateBuffer(activeBufferId, { content: monacoEditor.getValue(), isDirty: true });
				}
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
						if (activeBufferId) {
							updateBuffer(activeBufferId, { content: codeBlock.code, isDirty: true });
						}
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
						if (activeBufferId) {
							updateBuffer(activeBufferId, { content: codeBlock.code, isDirty: true });
						}
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
		[activeBufferId, updateBuffer, showConfirm, recordPatchMatchFailure, recordPatchMatchSuccess],
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
		setMonacoInstance(monaco);

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
						{pendingEditDiff ? (
							pendingEditDiff.hunks.length > 0 ? (
								<PendingEditDiffView
									hunks={pendingEditDiff.hunks}
									reviewMap={pendingEditReviewMap}
									onReviewChange={handlePendingReviewChange}
									onNavigateToLine={handlePendingHunkNavigate}
								/>
							) : (
								<div className="pending-edit-message warning">
									No pending changes detected in the diff view.
								</div>
							)
						) : (
							<div className="pending-edit-message warning">Preparing diff preview...</div>
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
