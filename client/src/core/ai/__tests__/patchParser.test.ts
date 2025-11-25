import { describe, expect, it } from 'vitest';
import { parsePatchFormat } from '../patchParser';

describe('parsePatchFormat', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: analysis.R',
    '@@',
    '- summary(mtcars)',
    '+ summary(iris)',
    '*** End Patch',
  ].join('\n');

  it('parses patch hunks', () => {
    const [hunk] = parsePatchFormat(patch);

    expect(hunk.filepath).toBe('analysis.R');
    expect(hunk.type).toBe('update');
    expect(hunk.chunks).toHaveLength(1);
  });

  it('resets regex state across calls', () => {
    const first = parsePatchFormat(patch);
    const second = parsePatchFormat(patch);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
