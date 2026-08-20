/**
 * SM-2 spaced repetition (Wozniak 1990), on local day numbers.
 *
 * Quality scale: 5 instant recall, 4 correct with hesitation, 3 correct but
 * slow, 2 wrong then recalled, 0 revealed. Below 3 resets repetitions.
 */
import type { CardState } from './types';

export const MIN_EF = 1.3;

export function initialCard(today: number): CardState {
  return { ef: 2.5, reps: 0, intervalDays: 0, due: today, lapses: 0, seen: 0, correct: 0 };
}

export function review(card: CardState, quality: number, today: number): CardState {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error(`quality out of range: ${quality}`);
  }
  const next: CardState = { ...card, seen: card.seen + 1 };
  if (quality >= 3) {
    next.correct = card.correct + 1;
    next.reps = card.reps + 1;
    if (next.reps === 1) next.intervalDays = 1;
    else if (next.reps === 2) next.intervalDays = 6;
    else next.intervalDays = Math.round(card.intervalDays * card.ef);
    next.ef = Math.max(MIN_EF, card.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  } else {
    next.reps = 0;
    next.intervalDays = 1;
    next.lapses = card.lapses + 1;
    // SM-2 leaves EF unchanged on failure.
  }
  next.due = today + next.intervalDays;
  return next;
}

/**
 * Map a practice attempt to an SM-2 quality grade.
 * @param firstTry the correct combo was entered with no wrong attempt
 * @param revealed the player gave up and the answer was shown
 * @param elapsedMs time from prompt to correct entry
 */
export function gradeAttempt(firstTry: boolean, revealed: boolean, elapsedMs: number): number {
  if (revealed) return 0;
  if (!firstTry) return 2;
  if (elapsedMs <= 2000) return 5;
  if (elapsedMs <= 5000) return 4;
  return 3;
}

/** A card is "mature" once its interval has reached 21 days. */
export function isMature(card: CardState): boolean {
  return card.intervalDays >= 21;
}
