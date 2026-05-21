/**
 * Pure multiplication-streak game logic. No I/O, no clock except values passed
 * in, so every transition is deterministic and unit-testable.
 */

export const WIN_STREAK = 10;
export const LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface Problem {
  a: number;
  b: number;
}

/** The full per-player state we keep (in a signed cookie). */
export interface GameState {
  /** Stable per-browser id. */
  id: string;
  streak: number;
  /** Epoch ms until which the player is locked out (0 = not locked). */
  lockoutUntil: number;
  /** The current unanswered problem, or null when locked/won. */
  problem: Problem | null;
}

export type AnswerOutcome = 'correct' | 'wrong' | 'won' | 'locked';

export interface AnswerResult {
  outcome: AnswerOutcome;
  state: GameState;
  /** The correct product, for feedback after a wrong answer. */
  correctValue: number;
}

/** Random integer in [min, max], inclusive. rng defaults to Math.random. */
function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Generate a 2-3 digit by 2-3 digit multiplication problem (factors 10-999).
 * rng is injectable for deterministic tests.
 */
export function generateProblem(rng: () => number = Math.random): Problem {
  return { a: randInt(10, 999, rng), b: randInt(10, 999, rng) };
}

/** True when the player is currently locked out. */
export function isLocked(state: GameState, now: number): boolean {
  return state.lockoutUntil > now;
}

/** Create a fresh game state for a new player id. */
export function newGame(id: string, rng: () => number = Math.random): GameState {
  return { id, streak: 0, lockoutUntil: 0, problem: generateProblem(rng) };
}

/**
 * Ensure the state has a current problem to show (unless locked). Used by the
 * read path so a player always has something to answer.
 */
export function ensureProblem(state: GameState, now: number, rng: () => number = Math.random): GameState {
  if (isLocked(state, now)) return { ...state, problem: null };
  if (state.problem) return state;
  return { ...state, problem: generateProblem(rng) };
}

/**
 * Apply an answer to the current problem and produce the next state.
 *  - correct: streak + 1, new problem (or win at WIN_STREAK)
 *  - wrong:   streak reset to 0, new problem
 *  - won:     streak hit WIN_STREAK, lock out for 24h, no problem
 *  - locked:  player was already locked; nothing changes
 */
export function applyAnswer(
  state: GameState,
  rawAnswer: number,
  now: number,
  rng: () => number = Math.random,
): AnswerResult {
  if (isLocked(state, now)) {
    return { outcome: 'locked', state: { ...state, problem: null }, correctValue: NaN };
  }
  const problem = state.problem ?? generateProblem(rng);
  const correctValue = problem.a * problem.b;
  const isCorrect = Number.isFinite(rawAnswer) && rawAnswer === correctValue;

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
}
