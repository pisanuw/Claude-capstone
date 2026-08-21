import { describe, expect, it } from 'vitest';
import { scoreRound } from '../src/core/score';
import type { PlantedDefect, Puzzle } from '../src/core/types';

function defect(line: number, id = `d${line}`): PlantedDefect {
  return {
    mutationId: id,
    category: 'logic',
    tier: 'novice',
    title: 't',
    explanation: 'e',
    fix: 'f',
    line,
  };
}

function puzzle(defectLines: number[], timeLimit = 100): Puzzle {
  return {
    seed: 1,
    templateId: 'x',
    language: 'javascript',
    title: 'x',
    tier: 'novice',
    timeLimit,
    code: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`),
    defects: defectLines.map((l) => defect(l)),
  };
}

describe('scoreRound', () => {
  it('perfect round: full points, time bonus, S grade', () => {
    const r = scoreRound(puzzle([3, 7]), [3, 7], 50);
    expect(r.found).toHaveLength(2);
    expect(r.missed).toHaveLength(0);
    expect(r.falsePositives).toEqual([]);
    expect(r.timeBonus).toBe(20); // 40 * 50/100
    expect(r.score).toBe(220);
    expect(r.grade).toBe('S');
  });

  it('no time bonus unless every defect is found', () => {
    const r = scoreRound(puzzle([3, 7]), [3], 100);
    expect(r.timeBonus).toBe(0);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('B');
  });

  it('false positives cost points and the S grade', () => {
    const r = scoreRound(puzzle([3]), [3, 4, 5], 0);
    expect(r.found).toHaveLength(1);
    expect(r.falsePositives).toEqual([4, 5]);
    expect(r.score).toBe(50);
    expect(r.grade).toBe('B');
  });

  it('score never goes below zero', () => {
    const r = scoreRound(puzzle([3]), [1, 2, 4, 5, 6, 7], 0);
    expect(r.score).toBe(0);
    expect(r.grade).toBe('D');
  });

  it('empty submission finds nothing', () => {
    const r = scoreRound(puzzle([3, 7, 9]), [], 10);
    expect(r.found).toHaveLength(0);
    expect(r.missed).toHaveLength(3);
    expect(r.score).toBe(0);
    expect(r.grade).toBe('D');
  });

  it('grades A and C at their thresholds', () => {
    // 2 defects found of 2, 1 FP, no time left: 200 - 25 = 175 -> ratio 0.875 -> A
    expect(scoreRound(puzzle([3, 7]), [3, 7, 5], 0).grade).toBe('A');
    // 1 of 3 found, 2 FP: 100 - 50 = 50 -> ratio 1/6 -> C
    expect(scoreRound(puzzle([3, 7, 9]), [3, 4, 5], 0).grade).toBe('C');
  });

  it('clamps secondsLeft into [0, timeLimit]', () => {
    expect(scoreRound(puzzle([3]), [3], 500).timeBonus).toBe(40);
    expect(scoreRound(puzzle([3]), [3], -5).timeBonus).toBe(0);
  });
});
