import { describe, expect, it } from 'vitest';
import { buildMenu, cribPlacements, describeLoop, loopToLetters } from '../src/core/crib';
import { chr, encipher } from '../src/core/enigma';

describe('crib placements', () => {
  it('rejects positions where a letter would encipher to itself', () => {
    const ps = cribPlacements('ABCDEF', 'BCD');
    expect(ps.map((p) => p.valid)).toEqual([true, false, true, true]);
    expect(ps[1].clashes).toEqual([0, 1, 2]);
  });

  it('handles empty and oversized cribs', () => {
    expect(cribPlacements('ABC', '')).toEqual([]);
    expect(cribPlacements('ABC', 'ABCD')).toEqual([]);
  });

  it('always allows the true position', () => {
    const cfg = { rotors: ['III', 'I', 'IV'] as const, reflector: 'C' as const, rings: 'AAA', positions: 'ABC', plugboard: 'QW ER' };
    const pt = 'XXXWETTERVORHERSAGEXXX';
    const ct = encipher({ ...cfg, rotors: [...cfg.rotors] }, pt);
    const ps = cribPlacements(ct, 'WETTERVORHERSAGE');
    expect(ps[3].valid).toBe(true);
  });
});

describe('menu', () => {
  it('builds edges, degrees and components', () => {
    // crib ABCA under cipher BCAD: A-B(0), B-C(1), C-A(2), A-D(3)
    const m = buildMenu('BCAD', 'ABCA', 0);
    expect(m.edges).toEqual([
      { a: 0, b: 1, i: 0 },
      { a: 1, b: 2, i: 1 },
      { a: 2, b: 0, i: 2 },
      { a: 0, b: 3, i: 3 },
    ]);
    expect(m.letters).toEqual([0, 1, 2, 3]);
    expect(m.degree.slice(0, 4)).toEqual([3, 2, 2, 1]);
    expect(m.components).toEqual([[0, 1, 2, 3]]);
    expect(m.loopCount).toBe(1);
    expect(m.testLetter).toBe(0);
    expect(m.loops.length).toBe(1);
    expect(m.loopLetters[0].length).toBe(3);
    expect(new Set(m.loopLetters[0])).toEqual(new Set([0, 1, 2]));
  });

  it('finds a two-edge loop when the same pair repeats', () => {
    const m = buildMenu('BXB', 'AYA', 0);
    expect(m.loopCount).toBe(1);
    expect(m.loops[0].length).toBe(2);
    expect(m.loopLetters[0]).toEqual(expect.arrayContaining([0, 1]));
  });

  it('every loop is a closed walk whose consecutive edges share the step letter', () => {
    const cfg = { rotors: ['II', 'IV', 'I'] as [ 'II', 'IV', 'I'], reflector: 'B' as const, rings: 'AAA', positions: 'KQZ', plugboard: 'AB CD EF GH IJ KL' };
    const ct = encipher(cfg, 'WETTERVORHERSAGEBISKAYA');
    const m = buildMenu(ct, 'WETTERVORHERSAGE', 0);
    expect(m.loopCount).toBeGreaterThan(0);
    m.loops.forEach((loop, li) => {
      const letters = m.loopLetters[li];
      expect(letters.length).toBe(loop.length);
      loop.forEach((e, j) => {
        const from = letters[j];
        const to = letters[(j + 1) % letters.length];
        expect([e.a, e.b].sort()).toEqual([from, to].sort());
      });
    });
    expect(m.loops.length).toBe(m.loopCount);
  });

  it('separates components and counts loops per the cycle rank', () => {
    // A-B(0), C-D(1): two components, no loops
    const m = buildMenu('BD', 'AC', 0);
    expect(m.components.length).toBe(2);
    expect(m.loopCount).toBe(0);
    expect(m.loops).toEqual([]);
  });

  it('respects the offset', () => {
    const m = buildMenu('XXBC', 'AB', 2);
    expect(m.edges).toEqual([
      { a: 0, b: 1, i: 0 },
      { a: 1, b: 2, i: 1 },
    ]);
    expect(m.cipher).toBe('BC');
    expect(m.offset).toBe(2);
  });

  it('prefers a test letter that sits on loops when degrees tie', () => {
    // Loop A-B-C plus a pendant chain D-E-F-D? Build: crib ABCADE vs cipher BCADEF:
    // A-B, B-C, C-A, A-D, D-E, E-F. Degrees: A3 B2 C2 D2 E2 F1. A wins by degree.
    const m = buildMenu('BCADEF', 'ABCADE', 0);
    expect(chr(m.testLetter)).toBe('A');
  });

  it('describes loops by walking their edges', () => {
    expect(loopToLetters([])).toEqual([]);
    expect(loopToLetters([{ a: 0, b: 1, i: 0 }])).toEqual([0, 1]);
    const walk = loopToLetters([
      { a: 0, b: 1, i: 0 },
      { a: 1, b: 2, i: 1 },
      { a: 2, b: 0, i: 2 },
    ]);
    expect(walk).toEqual([0, 1, 2]);
    expect(describeLoop(walk)).toBe('A – B – C – A');
  });
});
