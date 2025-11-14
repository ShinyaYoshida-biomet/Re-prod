import { describe, expect, it } from 'vitest';
import { extractCodeBlocks } from '../codeBlockUtils';

describe('extractCodeBlocks', () => {
  it('parses structured JSON metadata blocks', () => {
    const structured = `
Here is the patch:

\`\`\`json
{
  "id": "fix-target",
  "filepath": "analysis.R",
  "action": "replace-range",
  "targetRange": {
    "startLine": 5,
    "startColumn": 1,
    "endLine": 7,
    "endColumn": 1
  },
  "code": "print('fixed')",
  "explanation": "Fixes edge case"
}
\`\`\`
`;

    const [block] = extractCodeBlocks(structured);

    expect(block).toMatchObject({
      id: 'fix-target',
      action: 'replace-range',
      filepath: 'analysis.R',
      code: "print('fixed')",
      explanation: 'Fixes edge case',
    });
    expect(block.targetRange).toEqual({
      startLine: 5,
      startColumn: 1,
      endLine: 7,
      endColumn: 1,
    });
  });

  it('falls back to replace-all for plain R code fences', () => {
    const script = `
\`\`\`r
cat('hello world')
\`\`\`
`;

    const [block] = extractCodeBlocks(script);

    expect(block.action).toBe('replace-all');
    expect(block.code.trim()).toBe("cat('hello world')");
  });
 
  it('extracts original/new snippets from diff-style code blocks', () => {
    const diffBlock = `
\`\`\`json
{
  "id": "diff-example",
  "action": "replace-range",
  "code": "@@\\n function run() {\\n-  old_value <- 1\\n+  new_value <- 2\\n }\\n@@",
  "explanation": "Update variable"
}
\`\`\`
`;

    const [block] = extractCodeBlocks(diffBlock);

    expect(block.code).toContain('new_value <- 2');
    expect(block.originalCode).toContain('old_value <- 1');
  });

  it('attaches simple changes to patch-based code blocks', () => {
    const response = [
      'numbers <- compute()',
      '- result <- slow_run()',
      '+ result <- fast_run()',
      'return(result)',
      '',
      '*** Begin Patch',
      '*** Update File: analysis.R',
      '@@',
      ' numbers <- compute()',
      '-result <- slow_run()',
      '+result <- fast_run()',
      ' return(result)',
      '*** End Patch',
    ].join('\n');

    const [block] = extractCodeBlocks(response);
    expect(block.patchChunks).toHaveLength(1);
    expect(block.simpleChanges).toHaveLength(1);
    expect(block.simpleChanges?.[0].oldLines).toContain(' result <- slow_run()');
  });
});
