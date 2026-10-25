import { describe, expect, it } from 'vitest';
import { generate, rng, TEMPLATES, toMarkdown, toQti, type Template } from '../src/core/exercises';
import { myers } from '../src/core/myers';
import { patience } from '../src/core/patience';
import { tokenize } from '../src/core/script';
import { hunks, unifiedText } from '../src/core/unified';

const all = TEMPLATES.map((t) => t.id);

describe('exercise generator', () => {
  it('is deterministic for a seed', () => {
    expect(generate(all, 8, 42)).toEqual(generate(all, 8, 42));
    expect(generate(all, 8, 42)).not.toEqual(generate(all, 8, 43));
    expect(generate([], 5, 1)).toEqual([]);
  });

  it('answers match the reference implementations', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const q of generate(all, 4, seed)) {
        const a = tokenize(q.a, q.mode);
        const b = tokenize(q.b, q.mode);
        const res = myers(a, b);
        if (q.template === 'distance') expect(q.answer).toBe(res.d);
        if (q.template === 'v-array') {
          const [, d, k] = /step d = (\d+), what is V\[(-?\d+)\]/.exec(q.prompt) as RegExpExecArray;
          const entry = res.steps[Number(d)]?.v.find((e) => e.k === Number(k));
          expect(q.answer).toBe(entry?.x);
          expect(Number(d)).toBeLessThan(res.d);
        }
        if (q.template === 'patience') {
          expect(q.options?.[q.answer]).toBe(unifiedText(patience(a, b), a, b));
          expect(q.options?.[1 - q.answer]).toBe(unifiedText(res.script, a, b));
        }
        if (q.template === 'hunks') {
          const ctx = Number((/-U(\d)/.exec(q.prompt) as RegExpExecArray)[1]);
          expect(q.answer).toBe(hunks(res.script, a, b, ctx).length);
        }
      }
    }
  });

  it('cycles through the selected templates', () => {
    const qs = generate(['distance', 'hunks'] as Template[], 4, 9);
    expect(qs.map((q) => q.template)).toEqual(['distance', 'hunks', 'distance', 'hunks']);
  });

  it('rng stays in [0, 1)', () => {
    const r = rng(5);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('exports', () => {
  const qs = generate(all, 4, 3);

  it('writes Markdown with an answer key', () => {
    const md = toMarkdown(qs);
    expect(md).toMatch(/^# Diff exercises/);
    expect(md).toContain('# Answer key');
    expect(md.match(/^## \d\./gm)).toHaveLength(4);
    expect(md).toContain('(a)');
  });

  it('writes well-formed QTI 1.2 with escaped code', () => {
    const xml = toQti(qs);
    expect(xml).toContain('<questestinterop');
    expect((xml.match(/<item /g) ?? []).length).toBe(4);
    expect(xml).toContain('numerical_question');
    expect(xml).toContain('multiple_choice_question');
    // Raw "<" from code must never appear unescaped inside mattext.
    for (const m of xml.matchAll(/<mattext[^>]*>([\s\S]*?)<\/mattext>/g)) expect(m[1]).not.toMatch(/</);
  });
});
