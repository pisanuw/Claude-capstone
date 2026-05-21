import { describe, it, expect } from 'vitest';
import {
  applyAnswer,
  ensureProblem,
  generateProblem,
  isLocked,
  newGame,
  WIN_STREAK,
  LOCKOUT_MS,
  type GameState,
} from '../src/game.js';

// Deterministic rng that walks through a fixed sequence.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('generateProblem', () => {
  it('produces factors within 10..999', () => {
    for (let i = 0; i < 200; i++) {
      const { a, b } = generateProblem();
      expect(a).toBeGreaterThanOrEqual(10);
      expect(a).toBeLessThanOrEqual(999);
      expect(b).toBeGreaterThanOrEqual(10);
      expect(b).toBeLessThanOrEqual(999);
    }
  });

  it('is deterministic with an injected rng', () => {
    const p = generateProblem(seqRng([0, 0])); // min of range
    expect(p).toEqual({ a: 10, b: 10 });
  });
});

describe('applyAnswer', () => {
  const base: GameState = { id: 'x', streak: 3, lockoutUntil: 0, problem: { a: 12, b: 12 } };

  it('increments streak and gives a new problem on a correct answer', () => {
    const r = applyAnswer(base, 144, 1000);
    expect(r.outcome).toBe('correct');
    expect(r.state.streak).toBe(4);
    expect(r.state.problem).not.toBeNull();
  });

  it('resets streak to 0 and reports the correct value on a wrong answer', () => {
    const r = applyAnswer(base, 145, 1000);
    expect(r.outcome).toBe('wrong');
    expect(r.state.streak).toBe(0);
    expect(r.correctValue).toBe(144);
  });

  it('declares a win and locks out for 24h at WIN_STREAK', () => {
    const nearWin: GameState = { ...base, streak: WIN_STREAK - 1, problem: { a: 2, b: 5 } };
    const r = applyAnswer(nearWin, 10, 5000);
    expect(r.outcome).toBe('won');
    expect(r.state.streak).toBe(WIN_STREAK);
    expect(r.state.lockoutUntil).toBe(5000 + LOCKOUT_MS);
    expect(r.state.problem).toBeNull();
  });

  it('refuses to play while locked', () => {
    const locked: GameState = { ...base, lockoutUntil: 9999 };
    const r = applyAnswer(locked, 144, 1000);
    expect(r.outcome).toBe('locked');
    expect(r.state.streak).toBe(3); // unchanged
  });

  it('treats a non-numeric answer as wrong', () => {
    const r = applyAnswer(base, NaN, 1000);
    expect(r.outcome).toBe('wrong');
  });
});

describe('isLocked / ensureProblem / newGame', () => {
  it('isLocked reflects the lockout window', () => {
    expect(isLocked({ id: 'a', streak: 0, lockoutUntil: 2000, problem: null }, 1000)).toBe(true);
    expect(isLocked({ id: 'a', streak: 0, lockoutUntil: 500, problem: null }, 1000)).toBe(false);
  });

  it('ensureProblem adds a problem when missing and not locked', () => {
    const s = ensureProblem({ id: 'a', streak: 0, lockoutUntil: 0, problem: null }, 1000);
    expect(s.problem).not.toBeNull();
  });

  it('ensureProblem clears the problem while locked', () => {
    const s = ensureProblem(
      { id: 'a', streak: 0, lockoutUntil: 9999, problem: { a: 1, b: 1 } },
      1000,
    );
    expect(s.problem).toBeNull();
  });

  it('newGame starts at streak 0 with a problem', () => {
    const g = newGame('id1');
    expect(g.streak).toBe(0);
    expect(g.lockoutUntil).toBe(0);
    expect(g.problem).not.toBeNull();
  });
});
