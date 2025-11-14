import { describe, expect, it } from 'vitest';
import { findCodeInEditor } from '../contextMatcher';

const sampleContent = [
  'alpha <- 1',
  'beta <- 2',
  'target <- beta * 2',
  'gamma <- beta + 1',
  'delta <- 3',
  'epsilon <- 4',
  'target <- alpha + delta',
  'zeta <- target',
].join('\n');

describe('findCodeInEditor', () => {
  it('locates exact old snippet', () => {
    const range = findCodeInEditor(
      sampleContent,
      ['target <- beta * 2', 'gamma <- beta + 1'],
      ['beta <- 2'],
      ['delta <- 3'],
    );

    expect(range).toMatchObject({ startLine: 3, endLine: 4 });
  });

  it('uses before context to disambiguate matches', () => {
    const range = findCodeInEditor(
      sampleContent,
      ['target <- alpha + delta'],
      ['delta <- 3', 'epsilon <- 4'],
      [],
    );

    expect(range).toMatchObject({ startLine: 7, endLine: 7 });
  });

  it('falls back to after context when needed', () => {
    const content = ['foo()', 'bar()', 'foo()', 'keep()', 'bar()', 'done()'].join('\n');
    const range = findCodeInEditor(content, ['foo()'], [], ['done()']);

    expect(range).toMatchObject({ startLine: 3, endLine: 3 });
  });

  it('returns insertion range when only context exists', () => {
    const content = ['first()', 'second()', 'third()'].join('\n');
    const range = findCodeInEditor(content, [], ['first()'], ['third()']);

    expect(range).toMatchObject({ startLine: 2, endLine: 2 });
  });

  it('returns null when nothing matches', () => {
    expect(findCodeInEditor(sampleContent, ['missing <- 0'], [], [])).toBeNull();
  });
});
