import { describe, expect, it } from 'vitest';
import { applyPatch } from 'diff';
import { ALGOS, compareAll, run } from '../src/core/compare';
import { EXAMPLES, exampleById } from '../src/core/examples';
import { myers } from '../src/core/myers';
import { tokenize } from '../src/core/script';
import { decodeState, encodeState } from '../src/core/share';
import { hunks, inlineText, segments, unifiedText } from '../src/core/unified';
import { rng } from '../src/core/exercises';

const lines = (s: string) => tokenize(s, 'line');

describe('unified diff', () => {
  it('writes GNU-style hunk headers', () => {
    const a = lines('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n');
    const b = lines('1\n2\n3\n4\nfive\n6\n7\n8\n9\n10\n');
    const hs = hunks(myers(a, b).script, a, b, 3);
    expect(hs).toHaveLength(1);
    expect(hs[0]?.header).toBe('@@ -2,7 +2,7 @@');
    expect(hs[0]?.lines).toEqual([' 2', ' 3', ' 4', '-5', '+five', ' 6', ' 7', ' 8']);
  });

  it('reports a zero-length side as the line before the change', () => {
    const b = lines('x\ny\n');
    expect(hunks(myers([], b).script, [], b)[0]?.header).toBe('@@ -0,0 +1,2 @@');
    const a = lines('1\n2\n3\n');
    const b2 = lines('1\n2\n3\nnew\n');
    expect(hunks(myers(a, b2).script, a, b2, 0)[0]?.header).toBe('@@ -3,0 +4 @@');
  });

  it('merges changes whose context overlaps and splits distant ones', () => {
    const a = lines(Array.from({ length: 20 }, (_, i) => `${i}`).join('\n'));
    const near = a.slice();
    near[3] = 'x';
    near[8] = 'y';
    expect(hunks(myers(a, near).script, a, near, 3)).toHaveLength(1);
    expect(hunks(myers(a, near).script, a, near, 1)).toHaveLength(2);
    expect(hunks(myers(a, a).script, a, a)).toEqual([]);
    expect(unifiedText(myers(a, a).script, a, a)).toBe('');
  });

  it('produces patches the diff package can apply, for every algorithm and example', () => {
    for (const e of EXAMPLES.filter((x) => x.mode === 'line')) {
      const a = lines(e.a);
      const b = lines(e.b);
      for (const { id } of ALGOS) {
        for (const ctx of [0, 1, 3]) {
          const patch = unifiedText(run(id, a, b), a, b, ctx);
          expect(applyPatch(e.a, patch), `${e.id} ${id} U${ctx}`).toBe(e.b);
        }
      }
    }
  });

  it('applies on random line edits too', () => {
    const r = rng(7);
    for (let t = 0; t < 100; t++) {
      const a = Array.from({ length: 1 + Math.floor(r() * 15) }, () => 'abcde'[Math.floor(r() * 5)] as string);
      const b = Array.from({ length: 1 + Math.floor(r() * 15) }, () => 'abcde'[Math.floor(r() * 5)] as string);
      const at = a.join('\n') + '\n';
      const bt = b.join('\n') + '\n';
      for (const { id } of ALGOS) expect(applyPatch(at, unifiedText(run(id, a, b), a, b, 2))).toBe(bt);
    }
  });

  it('renders character diffs inline', () => {
    const a = tokenize('kitten', 'char');
    const b = tokenize('sitting', 'char');
    const s = myers(a, b).script;
    expect(inlineText(s, a, b)).toBe('[-k-]{+s+}itt[-e-]{+i+}n{+g+}');
    expect(segments(s, a, b)[0]).toEqual({ type: 'del', text: 'k' });
  });
});

describe('compareAll', () => {
  it('finds the minimum and marks where algorithms disagree with Myers', () => {
    const e = exampleById('moved');
    if (!e) throw new Error('missing example');
    const res = compareAll(lines(e.a), lines(e.b));
    const by = Object.fromEntries(res.map((x) => [x.algo, x]));
    expect(by.myers?.excess).toBe(0);
    expect(by.lcs?.excess).toBe(0);
    expect(by.myers?.differsFromMyers).toBe(false);
    expect(by.lcs?.differsFromMyers).toBe(true);
    expect(by.lcs?.hunkDiffers).toEqual([true]);
    expect(by.myers?.hunkDiffers.every((x) => !x)).toBe(true);
  });

  it('shows histogram can be non-minimal', () => {
    const res = compareAll(tokenize('ABCABBA', 'char'), tokenize('CBABAC', 'char'));
    expect(res.find((x) => x.algo === 'histogram')?.excess).toBeGreaterThan(0);
  });
});

describe('examples', () => {
  it('each curated example matches its note', () => {
    for (const e of EXAMPLES) {
      expect(e.a.length + e.b.length).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(20);
    }
    expect(myers(tokenize('kitten', 'char'), tokenize('sitting', 'char')).d).toBe(5);
    const list = exampleById('list');
    expect(list && myers(lines(list.a), lines(list.b)).d).toBe(2);
    const braces = exampleById('braces');
    if (!braces) throw new Error('missing');
    const c = compareAll(lines(braces.a), lines(braces.b));
    expect(c.every((x) => x.d === 4)).toBe(true);
    expect(c.find((x) => x.algo === 'histogram')?.differsFromMyers).toBe(true);
    expect(c.find((x) => x.algo === 'patience')?.differsFromMyers).toBe(false);
    expect(exampleById('nope')).toBeUndefined();
  });
});

describe('share links', () => {
  it('round-trips both texts and the mode, including unicode', () => {
    const s = { a: 'naïve\nline 2\n', b: '😀 + more', mode: 'char' as const };
    expect(decodeState(encodeState(s))).toEqual(s);
    expect(decodeState(encodeState({ a: '', b: 'x', mode: 'line' }))).toEqual({ a: '', b: 'x', mode: 'line' });
  });

  it('rejects missing or corrupt fragments', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#a=abc')).toBeNull();
    expect(decodeState('#a=%%%&b=@@@')).toBeNull();
  });
});
