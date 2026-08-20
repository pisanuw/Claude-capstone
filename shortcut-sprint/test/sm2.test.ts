import { describe, expect, it } from 'vitest';
import { MIN_EF, gradeAttempt, initialCard, isMature, review } from '../src/core/sm2';

describe('review (SM-2)', () => {
  it('schedules 1 then 6 days for the first two successes', () => {
    let card = initialCard(100);
    card = review(card, 5, 100);
    expect(card.reps).toBe(1);
    expect(card.intervalDays).toBe(1);
    expect(card.due).toBe(101);
    card = review(card, 5, 101);
    expect(card.reps).toBe(2);
    expect(card.intervalDays).toBe(6);
    expect(card.due).toBe(107);
  });

  it('grows the interval by the ease factor afterwards', () => {
    let card = initialCard(0);
    card = review(card, 5, 0); // 1d, ef 2.6
    card = review(card, 5, 1); // 6d, ef 2.7
    const efBefore = card.ef;
    card = review(card, 5, 7);
    expect(card.intervalDays).toBe(Math.round(6 * efBefore));
    expect(card.reps).toBe(3);
  });

  it('lowers ease on hesitant answers and clamps at 1.3', () => {
    let card = initialCard(0);
    for (let day = 0; day < 30; day += 1) {
      card = review(card, 3, day);
    }
    expect(card.ef).toBeCloseTo(MIN_EF, 5);
  });

  it('resets repetitions on failure but keeps ease and counts the lapse', () => {
    let card = initialCard(0);
    card = review(card, 5, 0);
    card = review(card, 5, 1);
    const ef = card.ef;
    card = review(card, 0, 7);
    expect(card.reps).toBe(0);
    expect(card.intervalDays).toBe(1);
    expect(card.due).toBe(8);
    expect(card.lapses).toBe(1);
    expect(card.ef).toBe(ef);
  });

  it('tracks seen and correct for accuracy stats', () => {
    let card = initialCard(0);
    card = review(card, 5, 0);
    card = review(card, 0, 1);
    card = review(card, 4, 2);
    expect(card.seen).toBe(3);
    expect(card.correct).toBe(2);
  });

  it('rejects out-of-range quality', () => {
    expect(() => review(initialCard(0), 6, 0)).toThrow(/out of range/);
    expect(() => review(initialCard(0), -1, 0)).toThrow(/out of range/);
    expect(() => review(initialCard(0), 2.5, 0)).toThrow(/out of range/);
  });
});

describe('gradeAttempt', () => {
  it('grades speed on a clean first try', () => {
    expect(gradeAttempt(true, false, 1200)).toBe(5);
    expect(gradeAttempt(true, false, 3500)).toBe(4);
    expect(gradeAttempt(true, false, 9000)).toBe(3);
  });

  it('grades retries and reveals as failures', () => {
    expect(gradeAttempt(false, false, 1000)).toBe(2);
    expect(gradeAttempt(false, true, 1000)).toBe(0);
    expect(gradeAttempt(true, true, 1000)).toBe(0);
  });
});

describe('isMature', () => {
  it('is true from a 21-day interval', () => {
    expect(isMature({ ...initialCard(0), intervalDays: 20 })).toBe(false);
    expect(isMature({ ...initialCard(0), intervalDays: 21 })).toBe(true);
  });
});
