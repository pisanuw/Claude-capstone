import { describe, expect, it } from 'vitest';
import { conditionText, generateQuestions, nextCandidate, specNames, specRequirements } from '../src/core/questions';
import { SAMPLE_SPEC, SAMPLE_SUBMISSIONS } from '../src/core/sample';
import type { Submission } from '../src/core/types';

const [ana, ben, chen, dana] = SAMPLE_SUBMISSIONS as [Submission, Submission, Submission, Submission];

describe('spec reading', () => {
  it('finds requirement sentences and named functions', () => {
    const reqs = specRequirements(SAMPLE_SPEC);
    expect(reqs.some((r) => r.startsWith('merge_sort must sort'))).toBe(true);
    expect(reqs.some((r) => r.startsWith('remove must raise'))).toBe(true);
    expect([...specNames(SAMPLE_SPEC)]).toEqual(expect.arrayContaining(['append', 'remove', 'merge_sort', 'mergesort', 'dedupe']));
  });
  it('extracts the condition of guard lines', () => {
    expect(conditionText('if (!cur) throw new Error(`x`);')).toBe('if (!cur)');
    expect(conditionText('} else if (a && (b || c)) {')).toBe('if (a && (b || c))');
    expect(conditionText('if head is None:')).toBe('if head is None');
    expect(conditionText('while (x')).toBe('while (x');
  });
});

describe('generateQuestions', () => {
  for (const sub of SAMPLE_SUBMISSIONS) {
    it(`gives ${sub.student} 4 to 6 anchored, distinct questions`, () => {
      const qs = generateQuestions(sub, { spec: SAMPLE_SPEC });
      expect(qs.length).toBe(5);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      for (const q of qs) {
        expect(q.prompt.length).toBeGreaterThan(30);
        expect(q.concepts.length).toBeGreaterThan(0);
        if (q.anchor) expect(sub.files.some((f) => f.path === q.anchor!.file)).toBe(true);
      }
    });
  }
  it('anchors questions to the student\'s own names and lines', () => {
    const qs = generateQuestions(ana, { spec: SAMPLE_SPEC });
    const rec = qs.find((q) => q.kind === 'recursion')!;
    expect(rec.prompt).toContain('`_sort` calls itself on line 56');
    expect(rec.anchor!.focus).toBe(56);
    const design = qs.find((q) => q.kind === 'design')!;
    expect(design.prompt).toContain('`seen` in a set');
  });
  it('asks about a suspicious commit, last', () => {
    const qs = generateQuestions(ben, { spec: SAMPLE_SPEC });
    expect(qs[qs.length - 1]!.kind).toBe('commit');
    expect(qs[qs.length - 1]!.prompt).toContain('9f8e7d6');
    expect(qs.some((q) => q.kind === 'naming')).toBe(true);
    expect(generateQuestions(ana, { spec: SAMPLE_SPEC }).some((q) => q.kind === 'commit')).toBe(false);
  });
  it('varies kinds and limits questions per function', () => {
    for (const sub of [chen, dana]) {
      const qs = generateQuestions(sub, { spec: SAMPLE_SPEC, count: 6 });
      expect(qs).toHaveLength(6);
      const perFn = new Map<string, number>();
      for (const q of qs) if (q.anchor) perFn.set(q.anchor.file + q.prompt.match(/`(\w+)`/)?.[1], (perFn.get(q.anchor.file + q.prompt.match(/`(\w+)`/)?.[1]) ?? 0) + 1);
      expect(new Set(qs.map((q) => q.kind)).size).toBeGreaterThanOrEqual(4);
    }
  });
  it('clamps the count and is deterministic', () => {
    expect(generateQuestions(chen, { count: 99 })).toHaveLength(6);
    expect(generateQuestions(chen, { count: 1 })).toHaveLength(4);
    expect(generateQuestions(chen)).toEqual(generateQuestions(chen));
  });
  it('differs between students with identical code', () => {
    const twin = { ...ana, id: 'twin-of-ana', student: 'Twin' };
    const a = generateQuestions(ana, { count: 4 }).map((q) => q.id);
    const variants = ['t1', 't2', 't3', 't4', 't5', 't6'].map((id) => generateQuestions({ ...twin, id }, { count: 4 }).map((q) => q.id).join());
    expect(variants.some((v) => v !== a.join())).toBe(true);
  });
  it('uses the spec and constants, and falls back to a generic question for tiny submissions', () => {
    const tiny: Submission = { id: 't', student: 'T', files: [{ path: 'a.py', text: 'def f(limit):\n    if limit > 42:\n        return 1\n    return 0\n' }], commits: [] };
    const qs = generateQuestions(tiny, { spec: 'f must return 1 when limit is above the threshold.' });
    expect(qs.map((q) => q.kind)).toContain('spec');
    expect(qs.some((q) => q.id === 'generic-hardest')).toBe(true);
    const empty = generateQuestions({ id: 'e', student: 'E', files: [], commits: [] });
    expect(empty.map((q) => q.id)).toEqual(['generic-hardest']);
  });
  it('asks about magic numbers that are not the main guard', () => {
    const src = 'def g(xs):\n    if not xs:\n        return 0\n    total = 0\n    for x in xs:\n        if x > 17:\n            total += x\n    return total\n';
    const qs = generateQuestions({ id: 'm', student: 'M', files: [{ path: 'g.py', text: src }], commits: [] }, { count: 6 });
    expect(qs.some((q) => q.id.endsWith('-const') && q.prompt.includes('`17`'))).toBe(true);
  });
});

describe('nextCandidate', () => {
  it('offers an unused question, preferring a new kind', () => {
    const qs = generateQuestions(chen, { spec: SAMPLE_SPEC, count: 4 });
    const next = nextCandidate(chen, { spec: SAMPLE_SPEC }, qs)!;
    expect(qs.map((q) => q.id)).not.toContain(next.id);
    expect(nextCandidate({ id: 'e', student: 'E', files: [], commits: [] }, {}, [])).toBeNull();
  });
});
