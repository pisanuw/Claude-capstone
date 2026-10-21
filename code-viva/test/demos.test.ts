import { describe, expect, it } from 'vitest';
import { flagQueue, rows } from '../src/core/course';
import { DEMOS, demoById, demoSource, loadDemo } from '../src/core/demos';

describe('demo courses', () => {
  it('offers the original course plus ten more, with unique ids and students', () => {
    expect(DEMOS.length).toBeGreaterThanOrEqual(11);
    expect(new Set(DEMOS.map((d) => d.id)).size).toBe(DEMOS.length);
    const ids = DEMOS.flatMap((d) => d.students.map((s) => s.submission.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const d of DEMOS) {
    describe(d.id, () => {
      const c = loadDemo(d.id);
      const weak = d.students.find((s) => s.style === 'weak')!;
      const strong = d.students.find((s) => s.style === 'strong')!;

      it('generates 4 to 6 anchored questions for every student', () => {
        for (const s of d.students) {
          const qs = c.vivas[s.submission.id]!.questions;
          expect(qs.length).toBeGreaterThanOrEqual(4);
          expect(qs.length).toBeLessThanOrEqual(6);
          expect(qs.filter((q) => q.anchor).length).toBeGreaterThanOrEqual(3);
        }
      });

      it('asks the weak student about their commit and puts them first in the flag queue', () => {
        expect(c.vivas[weak.submission.id]!.questions.at(-1)!.kind).toBe('commit');
        expect(flagQueue(c)[0]!.id).toBe(weak.submission.id);
      });

      it('scores the strong student well with no flags, and leaves unanswered students for later', () => {
        const r = rows(c);
        const top = r.find((x) => x.id === strong.submission.id)!;
        expect(top.score!.percent).toBeGreaterThanOrEqual(0.8);
        expect(top.score!.flags).toEqual([]);
        expect(top.commitEvents).toBe(0);
        for (const s of d.students.filter((x) => x.style === null)) expect(r.find((x) => x.id === s.submission.id)!.status).toBe('not answered');
        for (const s of d.students.filter((x) => x.extraTime)) expect(c.vivas[s.submission.id]!.timeMultiplier).toBe(s.extraTime);
      });
    });
  }

  it('finds demos by id, falls back for unknown ids, and reports missing files', () => {
    expect(demoById('bst')!.languages).toContain('Java');
    expect(loadDemo('nope').settings.assignment).toBe('A4: Linked lists');
    expect(demoSource('bst/omar/BST.java')).toContain('class BST');
    expect(() => demoSource('bst/nobody.java')).toThrow('Missing demo file');
  });
});
