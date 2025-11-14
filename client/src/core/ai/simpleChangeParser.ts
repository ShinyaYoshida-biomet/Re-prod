import type { SimpleCodeChange } from '@shared/types';

const CODE_FENCE_REGEX = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;

const sanitizeLine = (line: string): string => line.replace(/\r$/, '');

const normalizeBlock = (value: string): string[] => {
  const lines = value
    .split(/\r?\n/)
    .map(sanitizeLine)
    .map((line) => line.replace(/^```.*$/, '').trimEnd());

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }
  return lines;
};

const parseDiffBlock = (block: string): SimpleCodeChange | null => {
  const lines = normalizeBlock(block);
  const diffLineIndexes = lines
    .map((line, index) => ({ index, line }))
    .filter(({ line }) => line.startsWith('-') || line.startsWith('+'));

  if (!diffLineIndexes.length) {
    return null;
  }

  const hasAdditions = diffLineIndexes.some(({ line }) => line.startsWith('+'));
  const hasRemovals = diffLineIndexes.some(({ line }) => line.startsWith('-'));

  if (!hasAdditions || !hasRemovals) {
    return null;
  }

  const firstDiff = diffLineIndexes[0].index;
  const lastDiff = diffLineIndexes[diffLineIndexes.length - 1].index;

  const beforeContext = lines.slice(0, firstDiff).filter((line) => line.trim().length > 0);
  const afterContext = lines.slice(lastDiff + 1).filter((line) => line.trim().length > 0);

  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (let idx = firstDiff; idx <= lastDiff; idx++) {
    const line = lines[idx];
    if (line.startsWith('-')) {
      oldLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith('+')) {
      newLines.push(line.slice(1));
    }
  }

  if (!oldLines.length && !newLines.length) {
    return null;
  }

  return {
    beforeContext,
    afterContext,
    oldLines,
    newLines,
  };
};

const gatherSegments = (text: string, ranges: Array<{ start: number; end: number }>): string[] => {
  if (!ranges.length) {
    return [text];
  }

  const segments: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) {
      segments.push(text.slice(cursor, range.start));
    }
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments.filter((segment) => segment.trim().length > 0);
};

export function parseSimpleChanges(text: string): SimpleCodeChange[] {
  const changes: SimpleCodeChange[] = [];
  const fenceRanges: Array<{ start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE_REGEX.exec(text)) !== null) {
    const [fullMatch, body] = match;
    const range = { start: match.index, end: match.index + fullMatch.length };
    fenceRanges.push(range);

    const change = parseDiffBlock(body);
    if (change) {
      changes.push(change);
    }
  }

  const remainingSegments = gatherSegments(text, fenceRanges);
  for (const segment of remainingSegments) {
    const chunks = segment.split(/\n{2,}/);
    for (const chunk of chunks) {
      if (!chunk.trim().length) {
        continue;
      }
      const change = parseDiffBlock(chunk);
      if (change) {
        changes.push(change);
      }
    }
  }

  return changes;
}
