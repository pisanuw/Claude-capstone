import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/data/templates';
import { CATEGORIES, TIERS } from '../src/core/types';

describe('template library invariants', () => {
  it('has unique template and mutation ids', () => {
    const templateIds = TEMPLATES.map((t) => t.id);
    expect(new Set(templateIds).size).toBe(templateIds.length);
    const mutationIds = TEMPLATES.flatMap((t) => t.mutations.map((m) => m.id));
    expect(new Set(mutationIds).size).toBe(mutationIds.length);
  });

  it('every mutation find matches exactly one code line, verbatim', () => {
    for (const t of TEMPLATES) {
      for (const m of t.mutations) {
        const matches = t.code.filter((line) => line === m.find);
        expect(matches, `${t.id}/${m.id}`).toHaveLength(1);
      }
    }
  });

  it('every mutation actually changes the line', () => {
    for (const t of TEMPLATES) {
      for (const m of t.mutations) {
        expect(m.replace, `${t.id}/${m.id}`).not.toBe(m.find);
      }
    }
  });

  it('every mutation has a valid category and tier plus explainer text', () => {
    for (const t of TEMPLATES) {
      expect(t.mutations.length).toBeGreaterThanOrEqual(4);
      for (const m of t.mutations) {
        expect(CATEGORIES).toContain(m.category);
        expect(TIERS).toContain(m.tier);
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.explanation.length).toBeGreaterThan(20);
        expect(m.fix.length).toBeGreaterThan(0);
      }
    }
  });

  it('the library covers every category and every tier', () => {
    const all = TEMPLATES.flatMap((t) => t.mutations);
    for (const c of CATEGORIES) {
      expect(all.some((m) => m.category === c), c).toBe(true);
    }
    for (const tier of TIERS) {
      expect(all.some((m) => m.tier === tier), tier).toBe(true);
    }
  });

  it('replacement lines keep the indentation of the line they replace', () => {
    const indent = (s: string): string => s.match(/^\s*/)![0];
    for (const t of TEMPLATES) {
      for (const m of t.mutations) {
        expect(indent(m.replace), `${t.id}/${m.id}`).toBe(indent(m.find));
      }
    }
  });
});
