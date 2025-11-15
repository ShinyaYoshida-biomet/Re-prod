import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { ForwardedRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { IconPlay, IconPlayCircle, ConfirmDialog } from "@/components/shared";
import { useStore } from "@/core";
import { useEditorCells } from "@/hooks/useEditorCells";
import { useEditorDecorations } from "@/hooks/useEditorDecorations";
import { useEditorExecution } from "@/hooks/useEditorExecution";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { computeTargetRange, matchPatchChunk, findCodeInEditor } from "@/core/ai/contextMatcher";
import type { editor as MonacoEditor } from "monaco-editor";
import type { CodeBlock, CodeRange } from "@shared/types";
import type { EditorRef } from "./editorRef";

function EditorPanelComponent(_: unknown, ref: ForwardedRef<EditorRef>): JSX.Element {
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
  const editorMethodsRef = useRef<EditorRef | null>(null);
  const monacoEditorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();

  const cells = useEditorCells(editor.content, editor.filepath);
  const {
    executingCellIndex,
    handleRunAll,
    handleRunCurrentCell,
    handleRunCellAndMoveNext,
  } = useEditorExecution({ editorRef: monacoEditorRef, cells });

  useEditorDecorations(monacoEditorRef, cells, {
    showCellDecorations: settings.showCellDecorations,
    highlightExecutingCell: settings.highlightExecutingCell,
    executingCellIndex,
  });

  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined) {
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

    const clampLine = Math.min(Math.max(lineNumber, 1), model.getLineCount());
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
    (codeBlock: CodeBlock): void => {
      const monacoEditor = monacoEditorRef.current;
      if (!monacoEditor) {
        console.error("Editor not ready");
        return;
      }

      const model = monacoEditor.getModel();
      if (!model) {
        return;
      }

      const clampLine = (line: number): number =>
        Math.min(Math.max(line, 1), model.getLineCount());

      const clampColumn = (line: number, column?: number): number => {
        const maxColumn = model.getLineMaxColumn(line);
        const requested = column ?? 1;
        return Math.min(Math.max(requested, 1), maxColumn);
      };

      const editorContent = monacoEditor.getValue();
      const contextAlertMessage =
        "Unable to locate the suggested context in the current editor. Try running the suggestion again after scrolling the intended section into view.";
      let contextMatchingFailed = false;

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

        for (const change of codeBlock.simpleChanges) {
          const range = findCodeInEditor(snapshot, change.oldLines, change.beforeContext, change.afterContext);
          if (!range) {
            contextMatchingFailed = true;
            recordPatchMatchFailure('Unable to match contextual diff block', codeBlock.id);
            if (typeof window !== "undefined") {
              window.alert(contextAlertMessage);
            }
            return false;
          }

          const replacement = change.newLines.join("\n");
          plannedEdits.push({ range, text: replacement });
          snapshot = applySnapshotEdit(snapshot, range, replacement);
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

        const content = monacoEditor.getValue();
        for (const chunk of codeBlock.patchChunks) {
          const range = matchPatchChunk(content, chunk);
          if (!range) {
            console.warn("Unable to find context for patch chunk", chunk.context);
            recordPatchMatchFailure(
              `Unable to match patch chunk: ${chunk.context ?? 'missing context'}`,
              codeBlock.id,
            );
            return false;
          }

          applyRange(range, chunk.newLines.join("\n"));
        }

        recordPatchMatchSuccess();
        return true;
      };

      const applyRangeChange = (text: string, alertOnFail = true): boolean => {
        const range = resolveTargetRange();
        if (!range) {
          if (alertOnFail) {
            console.warn("Missing target range for AI apply action", codeBlock.action);
            recordPatchMatchFailure(
              `Missing target range for ${codeBlock.action}`,
              codeBlock.id,
            );
            if (typeof window !== "undefined") {
              window.alert(
                "Unable to locate the suggested context in the current editor. " +
                  "Try running the suggestion again after scrolling the intended section into view.",
              );
            }
          }
          return false;
        }

        applyRange(range, text);
        recordPatchMatchSuccess();
        return true;
      };

      switch (codeBlock.action) {
        case "replace-all": {
          if (applySimpleChanges()) {
            break;
          }

          const patchApplied = applyPatchChunks();
          if (patchApplied) {
            break;
          }

          const appliedRange = applyRangeChange(codeBlock.code, false);
          if (appliedRange) {
            break;
          }

          // Show confirmation dialog asynchronously
          const target = codeBlock.filepath ? `file ${codeBlock.filepath}` : "current editor";
          const confirmationMessage = contextMatchingFailed
            ? `Context matching failed, so this action will replace the entire ${target}. Proceed only if you understand the change.`
            : `This AI suggestion will replace the entire ${target}. Proceed only if you understand the change.`;
          showConfirm("Confirm Replace All", confirmationMessage).then((confirmed) => {
            if (confirmed) {
              monacoEditor.setValue(codeBlock.code);
              setEditorContent(codeBlock.code);
            }
          });
          break;
        }
        case "replace-range":
          if (applySimpleChanges()) {
            break;
          }
          if (!applyPatchChunks()) {
            applyRangeChange(codeBlock.code);
          }
          break;
        case "delete-range":
          if (applySimpleChanges()) {
            break;
          }
          if (!applyPatchChunks()) {
            applyRangeChange("");
          }
          break;
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
          }
          break;
        }
        case "create-file":
          console.info("create-file action will be handled by file service");
          break;
        default:
          console.warn("Unknown code block action", codeBlock.action);
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
    monacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        handleRunCurrentCell();
      },
    );

    // Shift + Enter: Run current cell and move to next
    monacoEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      handleRunCellAndMoveNext();
    });

    // Cmd/Ctrl + Shift + Enter: Run all
    monacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => {
        handleRunAll();
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
              onClick={handleRunCurrentCell}
              disabled={execution.isRunning}
              title="Run Current Cell (Cmd/Ctrl+Enter)"
            >
              <IconPlay width={16} height={16} aria-hidden />
              Run Selection
            </button>
            <button
              className="btn btn-primary"
              onClick={handleRunAll}
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
