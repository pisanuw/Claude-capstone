/** Local-time ISO day (YYYY-MM-DD): daily challenges roll at local midnight. */
export function isoToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days since the epoch for an ISO day, for streak arithmetic. */
export function dayNumberFromIso(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/**
 * Current daily streak: consecutive challenge days ending today, or ending
 * yesterday (today's challenge not played yet but the streak is alive).
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
