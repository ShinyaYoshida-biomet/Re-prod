import type { CodeBlock, CodeChangeAction, CodeRange, SimpleCodeChange } from '@shared/types';
import { parsePatchFormat } from './patchParser';
import type { PatchHunk } from './patchParser';
import { parseSimpleChanges } from './simpleChangeParser';

const R_CODE_BLOCK_REGEX = /```(?:r|R)\n([\s\S]*?)\n```/g;
const JSON_BLOCK_REGEX = /```json\n([\s\S]*?)\n```/g;

const codeChangeActions: CodeChangeAction[] = [
  'replace-all',
  'replace-range',
  'insert-at-cursor',
  'create-file',
  'delete-range',
];

const makeCodeRange = (raw?: Partial<CodeRange>): CodeRange | undefined => {
  if (!raw) {
    return undefined;
  }

  const range: CodeRange = {
    startLine: Number(raw.startLine) || 0,
    startColumn: Number(raw.startColumn) || 1,
    endLine: Number(raw.endLine) || 0,
    endColumn: Number(raw.endColumn) || 1,
  };

  if (!range.startLine || !range.endLine) {
    return undefined;
  }

  return range;
};

const parsePatchSnippet = (value: string): { originalCode: string; newCode: string } | null => {
  const lines = value.split(/\r?\n/);
  const hasDiffMarkers = lines.some((line) => line.startsWith('+') || line.startsWith('-'));
  if (!hasDiffMarkers) {
    return null;
  }

  const originalLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('-')) {
      originalLines.push(line.slice(1));
      continue;
    }

    if (line.startsWith('+')) {
      newLines.push(line.slice(1));
      continue;
    }

    if (line.startsWith(' ')) {
      const context = line.slice(1);
      originalLines.push(context);
      newLines.push(context);
      continue;
    }

    originalLines.push(line);
    newLines.push(line);
  }

  if (!originalLines.length && !newLines.length) {
    return null;
  }

  return {
    originalCode: originalLines.join('\n').trimEnd(),
    newCode: newLines.join('\n').trimEnd(),
  };
};

const formatPatchText = (hunk: PatchHunk): string => {
  const header = `*** Begin Patch\n*** ${hunk.type === 'add' ? 'Add' : hunk.type === 'delete' ? 'Delete' : 'Update'} File: ${hunk.filepath}\n`;
  const body = hunk.chunks
    .map((chunk) => {
      const context = chunk.context ? `${chunk.context}\n` : '';
      const oldLines = chunk.oldLines.map((line) => `-${line}`).join('\n');
      const newLines = chunk.newLines.map((line) => `+${line}`).join('\n');
      return `${context}${oldLines}\n${newLines}`;
    })
    .join('\n\n');

  return `${header}${body}\n*** End Patch`;
};

const buildCodeBlockFromPatch = (hunk: PatchHunk): CodeBlock | null => {
  const newCode = hunk.chunks.flatMap((chunk) => chunk.newLines).join('\n').trimEnd();
  const originalCode = hunk.chunks.flatMap((chunk) => chunk.oldLines).join('\n').trimEnd();

  if (!newCode) {
    return null;
  }

  const action: CodeChangeAction =
    hunk.type === 'add' ? 'create-file' : hunk.type === 'delete' ? 'delete-range' : 'replace-range';

  const codeBlock: CodeBlock = {
    id: `patch-${Date.now()}-${hunk.filepath}`,
    code: newCode,
    language: 'r',
    action,
    filepath: hunk.filepath,
    patchChunks: hunk.chunks,
    patchText: formatPatchText(hunk),
  };

  if (originalCode) {
    codeBlock.originalCode = originalCode;
  }

  return codeBlock;
};

const normalizeCodeBlock = (raw: Record<string, unknown>): CodeBlock | null => {
  const action = typeof raw.action === 'string' && codeChangeActions.includes(raw.action as CodeChangeAction)
    ? (raw.action as CodeChangeAction)
    : 'replace-all';

  const code = typeof raw.code === 'string' ? raw.code : '';
  if (!code) {
    return null;
  }

  const codeBlock: CodeBlock = {
    id: typeof raw.id === 'string' ? raw.id : `code-${Date.now()}-json`,
    code,
    language: 'r',
    action,
    filepath: typeof raw.filepath === 'string' ? raw.filepath : undefined,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : undefined,
    checksum: typeof raw.checksum === 'string' ? raw.checksum : undefined,
    originalCode: typeof raw.originalCode === 'string' ? raw.originalCode : undefined,
  };

  const targetRange = makeCodeRange(raw.targetRange as Partial<CodeRange>);
  if (targetRange) {
    codeBlock.targetRange = targetRange;
  }

  const diff = parsePatchSnippet(code);
  if (diff) {
    if (!codeBlock.originalCode && diff.originalCode) {
      codeBlock.originalCode = diff.originalCode;
    }
    codeBlock.code = diff.newCode;
  }

  return codeBlock;
};

const parseJsonBlocks = (text: string): { blocks: CodeBlock[]; ranges: Array<{ start: number; end: number }> } => {
  const jsonRanges: Array<{ start: number; end: number }> = [];
  const parsedBlocks: CodeBlock[] = [];

  let match: RegExpExecArray | null;
  while ((match = JSON_BLOCK_REGEX.exec(text)) !== null) {
    const rawJson = match[1];
    const start = match.index;
    const end = match.index + match[0].length;
    jsonRanges.push({ start, end });

    try {
      const parsed = JSON.parse(rawJson);

      if (Array.isArray(parsed)) {
        parsed.forEach((entry: unknown) => {
          if (entry && typeof entry === 'object') {
            const block = normalizeCodeBlock(entry as Record<string, unknown>);
            if (block) {
              parsedBlocks.push(block);
            }
          }
        });
      } else if (parsed && typeof parsed === 'object') {
        if ('codeBlocks' in parsed && Array.isArray((parsed as { codeBlocks: unknown[] }).codeBlocks)) {
          (parsed as { codeBlocks: unknown[] }).codeBlocks.forEach((entry: unknown) => {
            if (entry && typeof entry === 'object') {
              const block = normalizeCodeBlock(entry as Record<string, unknown>);
              if (block) {
                parsedBlocks.push(block);
              }
            }
          });
        } else {
          const block = normalizeCodeBlock(parsed as Record<string, unknown>);
          if (block) {
            parsedBlocks.push(block);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse JSON code block metadata', error);
    }
  }

  return { blocks: parsedBlocks, ranges: jsonRanges };
};

const attachSimpleChanges = (blocks: CodeBlock[], simpleChanges: SimpleCodeChange[]): void => {
  if (!simpleChanges.length || !blocks.length) {
    return;
  }

  let cursor = 0;
  for (const block of blocks) {
    const budget = Math.max(block.patchChunks?.length ?? 1, 1);
    const assigned: SimpleCodeChange[] = [];
    for (let idx = 0; idx < budget && cursor < simpleChanges.length; idx += 1, cursor += 1) {
      assigned.push(simpleChanges[cursor]);
    }
    if (assigned.length) {
      block.simpleChanges = assigned;
    }
    if (cursor >= simpleChanges.length) {
      break;
    }
  }
};

export function extractCodeBlocks(text: string): CodeBlock[] {
  const simpleChanges = parseSimpleChanges(text);
  const patchHunks = parsePatchFormat(text);
  if (patchHunks.length > 0) {
    const patchBlocks = patchHunks
      .map(buildCodeBlockFromPatch)
      .filter((block): block is CodeBlock => block !== null);
    attachSimpleChanges(patchBlocks, simpleChanges);
    return patchBlocks;
  }

  if (text.includes('*** Begin Patch')) {
    console.warn('Patch detected but structured parser could not decode it.');
  }

  const codeBlocks: CodeBlock[] = [];
  const { blocks: jsonBlocks, ranges: jsonRanges } = parseJsonBlocks(text);
  codeBlocks.push(...jsonBlocks);

  let match: RegExpExecArray | null;
  while ((match = R_CODE_BLOCK_REGEX.exec(text)) !== null) {
    const start = match.index;
    const overlapsJson = jsonRanges.some(({ start: jsonStart, end: jsonEnd }) =>
      start >= jsonStart && start < jsonEnd,
    );

    if (overlapsJson) {
      continue;
    }

    codeBlocks.push({
      id: `code-${Date.now()}-${start}`,
      code: match[1],
      language: 'r',
      action: 'replace-all',
    });
  }

  attachSimpleChanges(codeBlocks, simpleChanges);
  return codeBlocks;
}
