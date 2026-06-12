/**
 * Pure multiplication/factoring-streak game logic. No I/O, no clock except
 * values passed in, so every transition is deterministic and unit-testable.
 */

export const WIN_STREAK = 10;
export const LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export type Mode = 'mult' | 'factor';

export type Problem =
  | { type: 'mult'; a: number; b: number }
  | { type: 'factor'; n: number };

/** The full per-player state we keep (in a signed cookie). */
export interface GameState {
  /** Cookie schema version. Must equal 2; absent or mismatched cookies are discarded. */
  v?: number;
  /** Stable per-browser id. */
  id: string;
  streak: number;
  /** Epoch ms until which the player is locked out (0 = not locked). */
  lockoutUntil: number;
  /** The current unanswered problem, or null when locked/won. */
  problem: Problem | null;
  /** Whether the player is solving multiplications or factoring composites. */
  mode: Mode;
}

export type AnswerOutcome = 'correct' | 'wrong' | 'won' | 'locked';

export interface AnswerResult {
  outcome: AnswerOutcome;
  state: GameState;
  /** For mult wrong: the correct product. For factor wrong: the number n. */
  correctValue: number;
  /** For factor wrong: sorted prime factorization of n. */
  correctFactors?: number[];
}

// ---- Pure helpers ----

function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** True if n is prime. */
export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/** Returns the sorted prime factorization of n (e.g. 12 → [2, 2, 3]). */
export function primeFactors(n: number): number[] {
  const factors: number[] = [];
  let d = 2;
  while (d * d <= n) {
    while (n % d === 0) {
      factors.push(d);
      n = Math.floor(n / d);
    }
    d++;
  }
  if (n > 1) factors.push(n);
  return factors;
}

/**
 * Parse a factorization answer such as "2*2*3", "2 × 2 × 3", or "2 2 3"
 * into a sorted array of integers. Returns null if the input is invalid.
 */
export function parseFactorAnswer(raw: string): number[] | null {
  const tokens = raw
    .trim()
    .split(/[*x×\s]+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const nums = tokens.map((t) => parseInt(t, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 2)) return null;
  return nums.sort((a, b) => a - b);
}

// Small primes used to build composite numbers in [1 000, 1 000 000].
const SMALL_PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
  53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
];

// ---- Problem generators ----

/**
 * Generate a 2–3 digit × 2–3 digit multiplication problem (factors 10–999).
 * rng is injectable for deterministic tests.
 */
export function generateProblem(rng: () => number = Math.random): Problem {
  return { type: 'mult', a: randInt(10, 999, rng), b: randInt(10, 999, rng) };
}

/**
 * Generate a composite number in [1 000, 1 000 000] built from SMALL_PRIMES,
 * suitable for a prime-factorization challenge.
 */
export function generateFactorProblem(rng: () => number = Math.random): Problem {
  while (true) {
    let n = 1;
    const count = Math.floor(rng() * 4) + 2; // 2–5 prime factors
    for (let i = 0; i < count; i++) {
      n *= SMALL_PRIMES[Math.floor(rng() * SMALL_PRIMES.length)];
      if (n > 1_000_000) {
        n = 0;
        break;
      }
    }
    if (n >= 1_000 && n <= 1_000_000) return { type: 'factor', n };
  }
}

function generateProblemForMode(mode: Mode, rng: () => number = Math.random): Problem {
  return mode === 'factor' ? generateFactorProblem(rng) : generateProblem(rng);
}

// ---- State transitions ----

/** True when the player is currently locked out. */
export function isLocked(state: GameState, now: number): boolean {
  return state.lockoutUntil > now;
}

/** Create a fresh game state for a new player. */
export function newGame(
  id: string,
  mode: Mode = 'mult',
  rng: () => number = Math.random,
): GameState {
  return {
    v: 2,
    id,
    streak: 0,
    lockoutUntil: 0,
    mode,
    problem: generateProblemForMode(mode, rng),
  };
}

/**
 * Ensure the state has a current problem to show (unless locked). Used by
 * the read path so a player always has something to answer.
 */
export function ensureProblem(
  state: GameState,
  now: number,
  rng: () => number = Math.random,
): GameState {
  if (isLocked(state, now)) return { ...state, problem: null };
  if (state.problem) return state;
  return { ...state, problem: generateProblemForMode(state.mode, rng) };
}

/**
 * Switch mode (only valid when streak = 0 and not locked).
 * Immediately generates a fresh problem for the new mode.
 */
export function setMode(
  state: GameState,
  mode: Mode,
  rng: () => number = Math.random,
): GameState {
  return { ...state, mode, problem: generateProblemForMode(mode, rng) };
}

/**
 * Apply an answer to the current problem and produce the next state.
 *  - correct: streak + 1, new problem (or win at WIN_STREAK)
 *  - wrong:   streak reset to 0, new problem
 *  - won:     streak hit WIN_STREAK, lock out for 24 h, no problem
 *  - locked:  player was already locked; nothing changes
 */
export function applyAnswer(
  state: GameState,
  rawAnswer: number | string,
  now: number,
  rng: () => number = Math.random,
): AnswerResult {
  if (isLocked(state, now)) {
    return { outcome: 'locked', state: { ...state, problem: null }, correctValue: NaN };
  }

  const problem = state.problem ?? generateProblemForMode(state.mode, rng);

  if (problem.type === 'mult') {
    const correctValue = problem.a * problem.b;
    const answer = Number(rawAnswer);
    const isCorrect = Number.isFinite(answer) && answer === correctValue;

    if (!isCorrect) {
      return {
        outcome: 'wrong',
        state: { ...state, streak: 0, problem: generateProblem(rng) },
        correctValue,
      };
    }
    const streak = state.streak + 1;
    if (streak >= WIN_STREAK) {
      return {
        outcome: 'won',
        state: { ...state, streak, lockoutUntil: now + LOCKOUT_MS, problem: null },
        correctValue,
      };
    }
    return {
      outcome: 'correct',
      state: { ...state, streak, problem: generateProblem(rng) },
      correctValue,
    };
  } else {
    // factor mode
    const n = problem.n;
    const correctFactors = primeFactors(n);
    const submitted = parseFactorAnswer(String(rawAnswer));
    const isCorrect =
      submitted !== null &&
      submitted.every(isPrime) &&
      submitted.length === correctFactors.length &&
      submitted.every((v, i) => v === correctFactors[i]);

    if (!isCorrect) {
      return {
        outcome: 'wrong',
        state: { ...state, streak: 0, problem: generateFactorProblem(rng) },
        correctValue: n,
        correctFactors,
      };
    }
    const streak = state.streak + 1;
    if (streak >= WIN_STREAK) {
      return {
        outcome: 'won',
        state: { ...state, streak, lockoutUntil: now + LOCKOUT_MS, problem: null },
        correctValue: n,
      };
    }
    return {
      outcome: 'correct',
      state: { ...state, streak, problem: generateFactorProblem(rng) },
      correctValue: n,
    };
  }
}
