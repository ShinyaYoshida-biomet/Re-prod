import type { editor as MonacoEditor } from "monaco-editor";
import type { RefObject } from "react";
import { useCallback } from "react";
import { useToast } from "@/components/shared";
import { useStore } from "@/core";
import { computeTargetRange, findCodeInEditor, matchPatchChunk } from "@/core/ai/contextMatcher";
import type { AppliedCodeChange } from "@/core/state/slices/editorSlice";
import type { CodeBlock, CodeRange } from "@/types";
import { clamp } from "@/utils/math";
import { useConfirmDialog } from "./useConfirmDialog";

export function usePendingEditApplicator(
	monacoEditorRef: RefObject<MonacoEditor.IStandaloneCodeEditor | null>,
) {
	const toast = useToast();
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const activeBufferId = activeBuffer?.id ?? null;
	const updateBuffer = useStore((state) => state.updateBuffer);
	const recordPatchMatchFailure = useStore((state) => state.recordPatchMatchFailure);
	const recordPatchMatchSuccess = useStore((state) => state.recordPatchMatchSuccess);
	const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();

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
		[
			monacoEditorRef,
			activeBufferId,
			updateBuffer,
			showConfirm,
			recordPatchMatchFailure,
			recordPatchMatchSuccess,
			toast,
		],
	);

	return { applyCodeChange, dialogState, handleConfirm, handleCancel };
}
