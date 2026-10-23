import { describe, expect, it } from 'vitest';
import { runSource } from '../src/core/interp';
import { PRESETS } from '../src/core/presets';
import { generate, rng, toMarkdown, toQti, xmlEscape } from '../src/core/quiz';
import { enumerate, isPossible } from '../src/core/schedule';
import { decodeState, encodeState } from '../src/core/share';
import { layoutTree } from '../src/core/tree';

describe('quiz generator', () => {
  const qs = generate(2026, 10);

  it('is deterministic for a seed and varies across seeds', () => {
    expect(generate(2026, 10)).toEqual(qs);
    expect(generate(7, 10).map((q) => q.code)).not.toEqual(qs.map((q) => q.code));
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.kind)).size).toBe(2);
  });

  it('every answer is verified by the enumerator', () => {
    for (const seed of [1, 2, 3, 2026]) {
      for (const q of generate(seed, 8)) {
        const run = runSource(q.code, { mode: q.mode });
        if (q.kind === 'count') {
          const token = /"(.+)"/.exec(q.prompt)?.[1] as string;
          for (const out of enumerate(run).outputs) expect(out.split(token).length - 1).toBe(q.answer);
        } else {
          expect(q.options?.some((o) => o.correct)).toBe(true);
          expect(q.options?.some((o) => !o.correct)).toBe(true);
          for (const o of q.options ?? []) expect(isPossible(run, o.text)).toBe(o.correct);
        }
      }
    }
  });

  it('exports Markdown with answers', () => {
    const md = toMarkdown(qs);
    expect(md).toMatch(/^# Fork Count questions/);
    expect(md.match(/## Question/g)).toHaveLength(10);
    expect(md.match(/\*\*Answer:\*\*/g)).toHaveLength(10);
    expect(md).toContain('```c');
  });

  it('exports QTI 1.2 with one item per question, escaped', () => {
    const xml = toQti(qs, 'T & Q');
    expect(xml).toMatch(/^<\?xml version="1.0"/);
    expect(xml).toContain('title="T &amp; Q"');
    expect(xml.match(/<item /g)).toHaveLength(10);
    expect(xml).toContain('numerical_question');
    expect(xml).toContain('multiple_answers_question');
    expect(xml).not.toMatch(/<pre>#include/);
    expect(xml).toContain('&lt;pre&gt;#include &amp;lt;stdio.h&amp;gt;');
    expect(xmlEscape('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('rng stays in [0, 1) and handles seed 0', () => {
    const r = rng(0);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('presets', () => {
  it('every preset runs and the notes match the results', () => {
    const got = Object.fromEntries(
      PRESETS.map((p) => {
        const r = runSource(p.code, { mode: p.mode });
        return [p.id, { procs: r.procs.length, outputs: enumerate(r).outputs }];
      }),
    );
    expect(got.loop3?.procs).toBe(8);
    expect(got.buffer?.outputs).toEqual(['hello world\nhello world\n']);
    expect(got.pipe?.outputs).toEqual(['0\n1\n0\n1\n0\n1\n0\n1\n']);
    expect(got.wait?.outputs).toEqual(['start\nchild\nparent\n']);
    expect(got.logic?.procs).toBe(5);
    expect(got.loopi?.outputs).toHaveLength(3);
    expect(got.memory?.outputs).toHaveLength(2);
    expect(got.exit?.outputs).toEqual(['AB\n']);
    expect(got.exec?.outputs).toEqual(['hi\nbefore done\n']);
    expect(got.waitpid?.outputs).toEqual(['A\nB\nparent\n', 'B\nA\nparent\n', 'B\nparent\nA\n']);
    expect(got.status?.outputs).toEqual(['child exited with 3\n']);
    expect(got.write?.outputs).toEqual(['BAC\nAC\n']);
    expect(got.orphan?.outputs).toHaveLength(2);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

describe('share', () => {
  it('round-trips code and mode, including non-ASCII', () => {
    const code = 'printf("héllo → %d\\n", 1);';
    expect(decodeState(encodeState(code, 'full'))).toEqual({ code, mode: 'full' });
  });
  it('falls back on bad input', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#c=!!!')).toBeNull();
    expect(decodeState('#m=weird&c=eA')).toEqual({ code: 'x', mode: 'line' });
  });
});

describe('layoutTree', () => {
  it('centres parents over their children', () => {
    const r = runSource('fork(); fork();', { mode: 'line' });
    const lay = layoutTree(r.procs);
    expect(lay.width).toBe(2);
    expect(lay.depth).toBe(3);
    const root = lay.nodes[0];
    expect(root?.depth).toBe(0);
    expect(root?.x).toBeGreaterThan(0);
    expect(lay.nodes.every((n) => n.x >= 0 && n.x < 2)).toBe(true);
    expect(layoutTree([])).toEqual({ nodes: [], width: 0, depth: 1 });
  });
});
