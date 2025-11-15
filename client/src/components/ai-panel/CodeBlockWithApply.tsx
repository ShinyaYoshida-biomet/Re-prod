import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/core';
import { IconClipboard, IconCheck, IconLightbulb } from '@/components/shared';
import { GitHubStyleDiffView } from './GitHubStyleDiffView';
import { getCodeActionLabel } from '@/core/ai/codeBlockActions';
import type { CodeBlock, CodeRange } from '@shared/types';

interface Props {
  codeBlock: CodeBlock;
  onApply: (codeBlock: CodeBlock) => Promise<void>;
}

function sliceContent(content: string, range: CodeRange): string {
  const lines = content.split(/\r?\n/);
  const startIdx = Math.max(range.startLine - 1, 0);
  const endIdx = Math.min(range.endLine, lines.length);
  const selected = lines.slice(startIdx, endIdx);

  if (selected.length === 0) {
    return '';
  }

  const first = selected[0];
  const last = selected[selected.length - 1];

  selected[0] = first.slice(Math.max(range.startColumn - 1, 0));
  selected[selected.length - 1] = last.slice(0, Math.max(range.endColumn - 1, 0));

  return selected.join('\n');
}

export function CodeBlockWithApply({ codeBlock, onApply }: Props): JSX.Element {
  const [applied, setApplied] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<CodeBlock>(codeBlock);
  const editorContent = useStore((state) => state.editor.content);
  const editorFilepath = useStore((state) => state.editor.filepath);

  useEffect(() => {
    setCurrentBlock(codeBlock);
    setApplied(false);
  }, [codeBlock]);

  // Check if we can show a diff (need a baseline)
  const canShowDiff = useMemo(() => {
    const localSlice =
      currentBlock.targetRange && (!currentBlock.filepath || currentBlock.filepath === editorFilepath)
        ? sliceContent(editorContent, currentBlock.targetRange)
        : null;

    const baseline = currentBlock.originalCode ?? localSlice;
    return Boolean(baseline);
  }, [currentBlock, editorContent, editorFilepath]);

  const handleApply = async (): Promise<void> => {
    try {
    await onApply(currentBlock);
    setApplied(true);
    } catch (error) {
      console.error('Failed to apply code block', error);
    }
  };

  const handleCopy = (): void => {
    navigator.clipboard.writeText(codeBlock.code);
  };

  const handleRetry = (): void => {
    setCurrentBlock((prev) => ({
      ...prev,
      targetRange: undefined,
    }));
  };

  return (
      <div className="code-block-container">
      {codeBlock.explanation && (
        <div className="code-explanation">
          <IconLightbulb width={16} height={16} aria-hidden />
          <span>{codeBlock.explanation}</span>
        </div>
      )}

      <div className="code-block">
        <div className="code-header">
          <span className="code-language">R</span>
          <span className="code-target">
            {codeBlock.filepath ? `${codeBlock.filepath}` : 'Current file'} • {getCodeActionLabel(codeBlock)}
          </span>
        </div>

        {canShowDiff ? (
          <GitHubStyleDiffView codeBlock={currentBlock} onRetry={handleRetry} />
        ) : (
          <pre className="code-content">
            <code>{currentBlock.code}</code>
          </pre>
        )}

        <div className="code-actions">
          <button
            className="btn"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <>
              <IconClipboard width={16} height={16} aria-hidden />
              Copy
            </>
          </button>

          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={applied}
            title={applied ? 'Already applied' : 'Apply to editor'}
          >
            {applied ? (
              <>
                <IconCheck width={16} height={16} aria-hidden />
                Applied
              </>
            ) : (
              <>
                <IconCheck width={16} height={16} aria-hidden />
                Apply to Editor
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
