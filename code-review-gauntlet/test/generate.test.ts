import { describe, expect, it } from 'vitest';
import { dailyPuzzle, eligibleTemplates, generatePuzzle, TIME_LIMITS } from '../src/core/generate';
import { TEMPLATES } from '../src/data/templates';
import { TIERS, type Tier } from '../src/core/types';

const ALLOWED: Record<Tier, Tier[]> = {
  novice: ['novice'],
  intermediate: ['novice', 'intermediate'],
  expert: ['novice', 'intermediate', 'expert'],
};

describe('generatePuzzle', () => {
  it('is deterministic for a given seed and tier', () => {
    for (const tier of TIERS) {
      expect(generatePuzzle(12345, tier)).toEqual(generatePuzzle(12345, tier));
    }
  });

  it('different seeds eventually produce different puzzles', () => {
    const a = generatePuzzle(1, 'intermediate');
    const distinct = Array.from({ length: 20 }, (_, i) => generatePuzzle(i + 2, 'intermediate')).some(
      (p) => p.templateId !== a.templateId || p.defects[0]?.mutationId !== a.defects[0]?.mutationId,
    );
    expect(distinct).toBe(true);
  });

  it('every tier has eligible templates', () => {
    for (const tier of TIERS) {
      expect(eligibleTemplates(tier).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('holds all invariants across a seed sweep', () => {
    for (const tier of TIERS) {
      for (let seed = 0; seed < 300; seed += 1) {
        const p = generatePuzzle(seed, tier);
        const template = TEMPLATES.find((t) => t.id === p.templateId)!;

        // Defect count per tier, and at least one defect of the exact tier.
        expect(p.defects.length).toBeGreaterThanOrEqual(1);
        expect(p.defects.length).toBeLessThanOrEqual(tier === 'novice' ? 2 : 3);
        expect(p.defects.some((d) => d.tier === tier)).toBe(true);
        for (const d of p.defects) expect(ALLOWED[tier]).toContain(d.tier);

        // No two defects share a line; defects sorted by line.
        const lines = p.defects.map((d) => d.line);
        expect(new Set(lines).size).toBe(lines.length);
        expect([...lines].sort((a, b) => a - b)).toEqual(lines);

        // The mutated code differs from the clean template exactly at defect lines.
        expect(p.code.length).toBe(template.code.length);
        for (let i = 0; i < p.code.length; i += 1) {
          if (lines.includes(i + 1)) {
            expect(p.code[i]).not.toBe(template.code[i]);
          } else {
            expect(p.code[i]).toBe(template.code[i]);
          }
        }

        // Each planted line matches its mutation's replacement text.
        for (const d of p.defects) {
          const m = template.mutations.find((x) => x.id === d.mutationId)!;
          expect(p.code[d.line - 1]).toBe(m.replace);
        }

        expect(p.timeLimit).toBe(TIME_LIMITS[tier]);
      }
    }
  });

  it('throws when no template fits the tier', () => {
    expect(() => generatePuzzle(1, 'expert', [])).toThrow();
  });
});

describe('dailyPuzzle', () => {
  it('is deterministic per day', () => {
    expect(dailyPuzzle('2026-08-21')).toEqual(dailyPuzzle('2026-08-21'));
  });

  it('varies across days', () => {
    const days = ['2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25'];
    const seeds = days.map((d) => dailyPuzzle(d).seed);
    expect(new Set(seeds).size).toBe(days.length);
  });

  it('uses a valid tier and consistent time limit', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      const p = dailyPuzzle(day);
      expect(TIERS).toContain(p.tier);
      expect(p.timeLimit).toBe(TIME_LIMITS[p.tier]);
    }
  });
});
