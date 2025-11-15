import { useMemo } from 'react';
import { diffLines as diffLinesFunc, Change } from 'diff';
import { useStore } from '@/core';
import type { CodeBlock, CodeRange } from '@shared/types';

interface Props {
  codeBlock: CodeBlock;
  onRetry?: () => void;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  oldNumber?: number;
  newNumber?: number;
  content: string;
  prefix: string;
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

function generateDiffLines(oldText: string, newText: string): DiffLine[] {
  const changes: Change[] = diffLinesFunc(oldText, newText);
  const resultLines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  changes.forEach((change) => {
    const lines = change.value.split(/\r?\n/);
    // Remove last empty line if exists (from split)
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }

    lines.forEach((line) => {
      if (change.added) {
        resultLines.push({
          type: 'add',
          newNumber: newLineNum++,
          content: line,
          prefix: '+',
        });
      } else if (change.removed) {
        resultLines.push({
          type: 'remove',
          oldNumber: oldLineNum++,
          content: line,
          prefix: '-',
        });
      } else {
        resultLines.push({
          type: 'context',
          oldNumber: oldLineNum++,
          newNumber: newLineNum++,
          content: line,
          prefix: ' ',
        });
      }
    });
  });

  return resultLines;
}

export function GitHubStyleDiffView({ codeBlock, onRetry }: Props): JSX.Element | null {
  const editorContent = useStore((state) => state.editor.content);
  const editorFilepath = useStore((state) => state.editor.filepath);

  const { baseline, isStale, diffLines } = useMemo(() => {
    const localSlice =
      codeBlock.targetRange && (!codeBlock.filepath || codeBlock.filepath === editorFilepath)
        ? sliceContent(editorContent, codeBlock.targetRange)
        : null;

    const original = codeBlock.originalCode ?? localSlice ?? '';
    const stale = Boolean(codeBlock.originalCode && localSlice && codeBlock.originalCode !== localSlice);
    const modified = codeBlock.code || '';

    const lines = generateDiffLines(original, modified);

    return {
      baseline: original,
      isStale: stale,
      diffLines: lines,
    };
  }, [codeBlock, editorContent, editorFilepath]);

  // If no baseline, we can't show a diff (this is a create-file or insert action)
  if (!baseline) {
    return null;
  }

  const filepath = codeBlock.filepath || 'Current file';
  const startLine = codeBlock.targetRange?.startLine || 1;
  const endLine = codeBlock.targetRange?.endLine || diffLines.length;

  return (
    <div className="github-diff-container" data-testid="github-diff-view">
      {isStale && (
        <div className="github-diff-warning" role="alert" data-testid="github-diff-warning">
          <span className="warning-icon" aria-hidden="true">⚠️</span>
          <span className="warning-text">
            Editor content changed since this suggestion was generated.
          </span>
          {onRetry && (
            <button
              type="button"
              className="btn btn-link"
              onClick={onRetry}
              data-testid="github-diff-retry"
            >
              Retry context match
            </button>
          )}
        </div>
      )}

      <div className="github-diff-header">
        <span className="diff-filepath">{filepath}</span>
        <span className="diff-range">Lines {startLine}-{endLine}</span>
      </div>

      <div
        className="github-diff-body"
        role="region"
        aria-label="Code differences"
      >
        {diffLines.map((line, index) => (
          <div
            key={index}
            className={`diff-line diff-line-${line.type}`}
            role="row"
            aria-label={`${line.type === 'add' ? 'Added' : line.type === 'remove' ? 'Removed' : 'Context'} line`}
          >
            <span className="line-number line-number-old" aria-label={line.oldNumber ? `Old line ${line.oldNumber}` : ''}>
              {line.oldNumber || ''}
            </span>
            <span className="line-number line-number-new" aria-label={line.newNumber ? `New line ${line.newNumber}` : ''}>
              {line.newNumber || ''}
            </span>
            <span className="line-prefix" aria-hidden="true">
              {line.prefix}
            </span>
            <code className="line-content">{line.content}</code>
          </div>
        ))}
      </div>

      <div className="github-diff-stats">
        {diffLines.filter((l) => l.type === 'add').length} additions,{' '}
        {diffLines.filter((l) => l.type === 'remove').length} deletions
      </div>
    </div>
  );
}
