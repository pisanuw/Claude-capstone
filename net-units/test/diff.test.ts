import { describe, expect, it } from 'vitest';
import { diffLines, splitLines } from '../src/core/diff';

const ops = (a: string, b: string) => diffLines(a, b).map((d) => `${d.op[0]}${d.oldLine}:${d.newLine} ${d.text}`);

describe('diffLines', () => {
  it('splits lines and drops one trailing newline', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('a\r\nb\n')).toEqual(['a', 'b']);
  });

  it('reports deletions before additions for a changed line', () => {
    expect(ops('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual(['e1:1 a', 'd2:0 b', 'a0:2 B', 'e3:3 c', 'a0:4 d']);
  });

  it('ignores trailing whitespace', () => {
    expect(ops('x  \ny', 'x\ny').every((s) => s.startsWith('e'))).toBe(true);
  });

  it('handles empty sides', () => {
    expect(ops('', 'p\nq')).toEqual(['a0:1 p', 'a0:2 q']);
    expect(ops('p', '')).toEqual(['d1:0 p']);
  });

  it('finds the longest common subsequence in the middle', () => {
    expect(ops('h\n1\n2\n3\nt', 'h\n2\n9\n3\nt')).toEqual(['e1:1 h', 'd2:0 1', 'e3:2 2', 'a0:3 9', 'e4:4 3', 'e5:5 t']);
  });
});
