import type { CodeRange } from '@shared/types';
import type { PatchChunk } from '@shared/types';

const normalizeLine = (line: string): string => line.trim();
const normalizeSnippet = (lines: string[]): string[] =>
  lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export function seekSequence(
  content: string,
  snippetLines: string[],
  startFromLine = 0,
): number | null {
  if (snippetLines.length === 0) {
    return null;
  }

  const contentLines = content.split(/\r?\n/);

  for (let idx = startFromLine; idx <= contentLines.length - snippetLines.length; idx++) {
    let match = true;
    for (let offset = 0; offset < snippetLines.length; offset++) {
      if (normalizeLine(contentLines[idx + offset]) !== normalizeLine(snippetLines[offset])) {
        match = false;
        break;
      }
    }
    if (match) {
      return idx + 1;
    }
  }

  return null;
}

export function computeTargetRange(
  content: string,
  snippet: string,
): CodeRange | null {
  const snippetLines = snippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!snippetLines.length) {
    return null;
  }

  const startLine = seekSequence(content, snippetLines);
  if (startLine === null) {
    return null;
  }

  return {
    startLine,
    startColumn: 1,
    endLine: startLine + snippetLines.length - 1,
    endColumn: 999,
  };
}

export function matchPatchChunk(content: string, chunk: PatchChunk): CodeRange | null {
  const snippet = chunk.oldLines.join('\n');
  const baseRange = computeTargetRange(content, snippet);
  if (baseRange) {
    return baseRange;
  }

  // Try matching with context header if available
  if (chunk.context) {
    const contextLines = chunk.context.replace(/^@@.*@@/, '').trim();
    const contextRange = computeTargetRange(content, contextLines);
    if (contextRange) {
      return contextRange;
    }
  }

  // Only fallback to single-line match if oldLines has just one line
  // This prevents matching wrong locations when multiple lines should match together
  if (chunk.oldLines.length === 1) {
    const singleLine = chunk.oldLines[0];
    if (singleLine.trim().length > 0) {
      const fallbackRange = computeTargetRange(content, singleLine);
      if (fallbackRange) {
        return fallbackRange;
      }
    }
  }

  return null;
}

const makeRangeFromMatch = (startLine: number, lineCount: number): CodeRange => ({
  startLine,
  startColumn: 1,
  endLine: startLine + Math.max(lineCount - 1, 0),
  endColumn: 999,
});

const sliceContentUntilLine = (content: string, line: number): string => {
  if (line <= 0) {
    return content;
  }
  return content
    .split(/\r?\n/)
    .slice(0, line)
    .join('\n');
};

export function findCodeInEditor(
  content: string,
  oldLines: string[],
  beforeContext: string[] = [],
  afterContext: string[] = [],
): CodeRange | null {
  const normalizedOld = normalizeSnippet(oldLines);
  const normalizedBefore = normalizeSnippet(beforeContext);
  const normalizedAfter = normalizeSnippet(afterContext);

  if (normalizedOld.length) {
    const direct = seekSequence(content, normalizedOld);
    const hasContext = normalizedBefore.length > 0 || normalizedAfter.length > 0;
    if (direct !== null) {
      if (!hasContext) {
        return makeRangeFromMatch(direct, normalizedOld.length);
      }

      const secondaryMatch = seekSequence(content, normalizedOld, direct);
      if (secondaryMatch === null) {
        return makeRangeFromMatch(direct, normalizedOld.length);
      }
    }

    if (normalizedBefore.length) {
      const beforeAnchor = seekSequence(content, normalizedBefore);
      if (beforeAnchor !== null) {
        const searchStart = beforeAnchor + normalizedBefore.length - 1;
        const anchored = seekSequence(content, normalizedOld, Math.max(searchStart, 0));
        if (anchored !== null) {
          return makeRangeFromMatch(anchored, normalizedOld.length);
        }
      }
    }

    if (normalizedAfter.length) {
      const afterAnchor = seekSequence(content, normalizedAfter);
      if (afterAnchor !== null) {
        const limitedContent = sliceContentUntilLine(content, Math.max(afterAnchor - 1, 0));
        const limitedLines = limitedContent.split(/\r?\n/).map((line) => normalizeLine(line));
        for (let idx = limitedLines.length - normalizedOld.length; idx >= 0; idx--) {
          let match = true;
          for (let offset = 0; offset < normalizedOld.length; offset++) {
            if (limitedLines[idx + offset] !== normalizedOld[offset]) {
              match = false;
              break;
            }
          }
          if (match) {
            return makeRangeFromMatch(idx + 1, normalizedOld.length);
          }
        }
      }
    }

    if (direct !== null) {
      return makeRangeFromMatch(direct, normalizedOld.length);
    }

    return null;
  }

  const beforeAnchor = normalizedBefore.length ? seekSequence(content, normalizedBefore) : null;
  const afterAnchor = normalizedAfter.length ? seekSequence(content, normalizedAfter) : null;

  if (beforeAnchor !== null && afterAnchor !== null) {
    const startLine = beforeAnchor + normalizedBefore.length;
    const endLine = Math.max(startLine, afterAnchor - 1);
    return {
      startLine,
      startColumn: 1,
      endLine,
      endColumn: 1,
    };
  }

  if (beforeAnchor !== null) {
    const line = beforeAnchor + normalizedBefore.length;
    return {
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: 1,
    };
  }

  if (afterAnchor !== null) {
    const line = Math.max(afterAnchor - 1, 1);
    return {
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: 1,
    };
  }

  return null;
}
