import { describe, expect, it } from 'vitest';
import { diffWords, tokenize } from '../src/core/diff.js';

function reconstruct(ops: { kind: string; text: string }[], side: 'before' | 'after'): string {
  return ops
    .filter((op) => op.kind === 'equal' || (side === 'before' ? op.kind === 'delete' : op.kind === 'insert'))
    .map((op) => op.text)
    .join('');
}

describe('tokenize', () => {
  it('splits into words and whitespace runs that rejoin exactly', () => {
    const text = 'hello   world\nagain';
    expect(tokenize(text).join('')).toBe(text);
  });
});

describe('diffWords', () => {
  it('reports no diff for identical text', () => {
    const ops = diffWords('same text here', 'same text here');
    expect(ops.every((op) => op.kind === 'equal')).toBe(true);
  });

  it('marks removed words as delete and kept words as equal', () => {
    const ops = diffWords('the quick brown fox', 'the brown fox');
    expect(ops.some((op) => op.kind === 'delete' && op.text.includes('quick'))).toBe(true);
  });

  it('marks added words as insert', () => {
    const ops = diffWords('the fox', 'the quick fox');
    expect(ops.some((op) => op.kind === 'insert' && op.text.includes('quick'))).toBe(true);
  });

  it('reconstructs both original and revised text from the op list', () => {
    const before = 'the quick brown fox jumps';
    const after = 'the brown fox leaps';
    const ops = diffWords(before, after);
    expect(reconstruct(ops, 'before')).toBe(before);
    expect(reconstruct(ops, 'after')).toBe(after);
  });

  it('handles empty inputs', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'new text').some((op) => op.kind === 'insert')).toBe(true);
    expect(diffWords('old text', '').some((op) => op.kind === 'delete')).toBe(true);
  });

  it('falls back to a line-level diff for inputs too large for the word-level table', () => {
    const bigBefore = Array.from({ length: 2500 }, (_, i) => `word${i}`).join(' ');
    const bigAfter = `${bigBefore} extra`;
    const ops = diffWords(bigBefore, bigAfter);
    expect(reconstruct(ops, 'before')).toBe(bigBefore);
    expect(reconstruct(ops, 'after')).toBe(bigAfter);
  });
});
