import { dayNumberFromIso } from './dates';

/**
 * Current daily streak: consecutive practice days ending today, or ending
 * yesterday (today's practice hasn't happened yet but the streak is alive).
 */
export function computeStreak(days: string[], todayIso: string): number {
  if (days.length === 0) return 0;
  const today = dayNumberFromIso(todayIso);
  const set = new Set(days.map(dayNumberFromIso));
  let start: number;
  if (set.has(today)) start = today;
  else if (set.has(today - 1)) start = today - 1;
  else return 0;
  let streak = 0;
  for (let d = start; set.has(d); d -= 1) streak += 1;
  return streak;
}

/** Record a practice day, keeping the list sorted and unique. */
export function recordDay(days: string[], iso: string): string[] {
  if (days.includes(iso)) return days;
  return [...days, iso].sort();
}
