import { describe, it, expect } from 'vitest';
import {
  applyAnswer,
  ensureProblem,
  generateFactorProblem,
  generateProblem,
  isPrime,
  isLocked,
  newGame,
  parseFactorAnswer,
  primeFactors,
  setMode,
  WIN_STREAK,
  LOCKOUT_MS,
  type GameState,
} from '../src/game.js';

// Deterministic rng that walks through a fixed sequence.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// seqRng values that produce a valid factor problem on first try:
// count=3, primes=[11,13,17], n=11*13*17=2431
const FACTOR_RNG_VALUES = [0.25, 0.16, 0.2, 0.24];

describe('isPrime', () => {
  it('identifies primes', () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(3)).toBe(true);
    expect(isPrime(13)).toBe(true);
    expect(isPrime(97)).toBe(true);
  });

  it('rejects composites and edge cases', () => {
    expect(isPrime(1)).toBe(false);
    expect(isPrime(0)).toBe(false);
    expect(isPrime(4)).toBe(false);
    expect(isPrime(100)).toBe(false);
  });
});

describe('primeFactors', () => {
  it('returns sorted prime factorization', () => {
    expect(primeFactors(12)).toEqual([2, 2, 3]);
    expect(primeFactors(30)).toEqual([2, 3, 5]);
    expect(primeFactors(1024)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(primeFactors(7)).toEqual([7]);
  });
});

describe('parseFactorAnswer', () => {
  it('parses * separator', () => {
    expect(parseFactorAnswer('2*3*5')).toEqual([2, 3, 5]);
  });

  it('parses × separator', () => {
    expect(parseFactorAnswer('2 × 3 × 5')).toEqual([2, 3, 5]);
  });

  it('parses x separator', () => {
    expect(parseFactorAnswer('2x3x5')).toEqual([2, 3, 5]);
  });

  it('parses space-separated tokens', () => {
    expect(parseFactorAnswer('2 3 5')).toEqual([2, 3, 5]);
  });

  it('sorts the factors ascending', () => {
    expect(parseFactorAnswer('5*3*2')).toEqual([2, 3, 5]);
  });

  it('returns null for empty input', () => {
    expect(parseFactorAnswer('')).toBeNull();
    expect(parseFactorAnswer('   ')).toBeNull();
  });

  it('returns null when any token is not an integer >= 2', () => {
    expect(parseFactorAnswer('2*1*3')).toBeNull();
    expect(parseFactorAnswer('2*abc')).toBeNull();
  });
});

describe('generateProblem', () => {
  it('produces factors within 10..999', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem();
      expect(p.type).toBe('mult');
      if (p.type === 'mult') {
        expect(p.a).toBeGreaterThanOrEqual(10);
        expect(p.a).toBeLessThanOrEqual(999);
        expect(p.b).toBeGreaterThanOrEqual(10);
        expect(p.b).toBeLessThanOrEqual(999);
      }
    }
  });

  it('is deterministic with an injected rng', () => {
    const p = generateProblem(seqRng([0, 0]));
    expect(p).toEqual({ type: 'mult', a: 10, b: 10 });
  });
});

describe('generateFactorProblem', () => {
  it('produces a composite number in [1 000, 1 000 000]', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateFactorProblem();
      expect(p.type).toBe('factor');
      if (p.type === 'factor') {
        expect(p.n).toBeGreaterThanOrEqual(1_000);
        expect(p.n).toBeLessThanOrEqual(1_000_000);
        expect(primeFactors(p.n).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('is deterministic with an injected rng', () => {
    const p = generateFactorProblem(seqRng(FACTOR_RNG_VALUES));
    expect(p).toEqual({ type: 'factor', n: 2431 }); // 11 * 13 * 17
  });
});

describe('applyAnswer – mult mode', () => {
  const base: GameState = {
    v: 2,
    id: 'x',
    streak: 3,
    lockoutUntil: 0,
    mode: 'mult',
    problem: { type: 'mult', a: 12, b: 12 },
  };

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
    expect(r.correctFactors).toBeUndefined();
  });

  it('declares a win and locks out for 24h at WIN_STREAK', () => {
    const nearWin: GameState = {
      ...base,
      streak: WIN_STREAK - 1,
      problem: { type: 'mult', a: 2, b: 5 },
    };
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
    const r = applyAnswer(base, 'abc', 1000);
    expect(r.outcome).toBe('wrong');
  });
});

describe('applyAnswer – factor mode', () => {
  const base: GameState = {
    v: 2,
    id: 'x',
    streak: 0,
    lockoutUntil: 0,
    mode: 'factor',
    problem: { type: 'factor', n: 30 }, // 30 = 2 * 3 * 5
  };

  it('accepts correct prime factorization', () => {
    const r = applyAnswer(base, '2*3*5', 1000, seqRng(FACTOR_RNG_VALUES));
    expect(r.outcome).toBe('correct');
    expect(r.state.streak).toBe(1);
  });

  it('accepts factorization in any order', () => {
    const r = applyAnswer(base, '5*3*2', 1000, seqRng(FACTOR_RNG_VALUES));
    expect(r.outcome).toBe('correct');
  });

  it('accepts × and space separators', () => {
    const r = applyAnswer(base, '2 × 3 × 5', 1000, seqRng(FACTOR_RNG_VALUES));
    expect(r.outcome).toBe('correct');
  });

  it('rejects a wrong factorization and reveals correct factors', () => {
    const r = applyAnswer(base, '2*3', 1000, seqRng(FACTOR_RNG_VALUES)); // missing 5
    expect(r.outcome).toBe('wrong');
    expect(r.state.streak).toBe(0);
    expect(r.correctValue).toBe(30);
    expect(r.correctFactors).toEqual([2, 3, 5]);
  });

  it('rejects a composite factor (4 is not prime)', () => {
    const r = applyAnswer(base, '4*5', 1000, seqRng(FACTOR_RNG_VALUES)); // 4 is not prime
    expect(r.outcome).toBe('wrong');
    expect(r.correctFactors).toEqual([2, 3, 5]);
  });

  it('rejects an empty answer', () => {
    const r = applyAnswer(base, '', 1000, seqRng(FACTOR_RNG_VALUES));
    expect(r.outcome).toBe('wrong');
  });

  it('locks out after WIN_STREAK correct answers', () => {
    const nearWin: GameState = {
      ...base,
      streak: WIN_STREAK - 1,
      problem: { type: 'factor', n: 30 },
    };
    const r = applyAnswer(nearWin, '2*3*5', 5000, seqRng(FACTOR_RNG_VALUES));
    expect(r.outcome).toBe('won');
    expect(r.state.streak).toBe(WIN_STREAK);
    expect(r.state.lockoutUntil).toBe(5000 + LOCKOUT_MS);
    expect(r.state.problem).toBeNull();
  });

  it('refuses to play while locked', () => {
    const locked: GameState = { ...base, lockoutUntil: 9999 };
    const r = applyAnswer(locked, '2*3*5', 1000);
    expect(r.outcome).toBe('locked');
  });
});

describe('isLocked / ensureProblem / newGame / setMode', () => {
  it('isLocked reflects the lockout window', () => {
    const s: GameState = { v: 2, id: 'a', streak: 0, lockoutUntil: 2000, problem: null, mode: 'mult' };
    expect(isLocked(s, 1000)).toBe(true);
    expect(isLocked({ ...s, lockoutUntil: 500 }, 1000)).toBe(false);
  });

  it('ensureProblem adds a mult problem when missing and not locked', () => {
    const s: GameState = { v: 2, id: 'a', streak: 0, lockoutUntil: 0, problem: null, mode: 'mult' };
    const next = ensureProblem(s, 1000);
    expect(next.problem).not.toBeNull();
    expect(next.problem?.type).toBe('mult');
  });

  it('ensureProblem adds a factor problem in factor mode', () => {
    const s: GameState = {
      v: 2, id: 'a', streak: 0, lockoutUntil: 0, problem: null, mode: 'factor',
    };
    const next = ensureProblem(s, 1000, seqRng(FACTOR_RNG_VALUES));
    expect(next.problem?.type).toBe('factor');
  });

  it('ensureProblem clears the problem while locked', () => {
    const s: GameState = {
      v: 2, id: 'a', streak: 0, lockoutUntil: 9999,
      problem: { type: 'mult', a: 1, b: 1 }, mode: 'mult',
    };
    expect(ensureProblem(s, 1000).problem).toBeNull();
  });

  it('newGame starts at streak 0 with a problem in default mult mode', () => {
    const g = newGame('id1');
    expect(g.streak).toBe(0);
    expect(g.lockoutUntil).toBe(0);
    expect(g.mode).toBe('mult');
    expect(g.problem?.type).toBe('mult');
    expect(g.v).toBe(2);
  });

  it('newGame in factor mode starts with a factor problem', () => {
    const g = newGame('id1', 'factor', seqRng(FACTOR_RNG_VALUES));
    expect(g.mode).toBe('factor');
    expect(g.problem?.type).toBe('factor');
  });

  it('setMode changes mode and generates a new problem', () => {
    const s: GameState = {
      v: 2, id: 'a', streak: 0, lockoutUntil: 0,
      problem: { type: 'mult', a: 10, b: 10 }, mode: 'mult',
    };
    const next = setMode(s, 'factor', seqRng(FACTOR_RNG_VALUES));
    expect(next.mode).toBe('factor');
    expect(next.problem?.type).toBe('factor');
  });
});
