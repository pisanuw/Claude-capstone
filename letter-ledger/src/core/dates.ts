/** Calendar-day helpers. Days are `YYYY-MM-DD` strings in the user's own calendar, compared at UTC midnight so DST never shifts a count. */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDay(s: string): boolean {
  const m = DAY.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

function utc(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  return new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Today in the local time zone of `now`. */
export function today(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Dec 1, 2026". */
export function prettyDay(day: string): string {
  if (!isDay(day)) return day;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "in 3 days", "today", "2 days ago". */
export function relative(from: string, to: string): string {
  const n = daysBetween(from, to);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

const SEASONS: [RegExp, number][] = [
  [/^(wi|win|winter)$/i, 1],
  [/^(sp|spr|spring)$/i, 2],
  [/^(su|sum|summer)$/i, 3],
  [/^(fa|fall|au|aut|autumn)$/i, 4],
];

/** Sort key for terms like "Fall 2025", "Wi26", "2026 Spring" or "2025"; null if no year is found. */
export function termKey(term: string): number | null {
  const parts = term.trim().match(/[A-Za-z]+|\d+/g) ?? [];
  let year: number | null = null;
  let season = 0;
  for (const p of parts) {
    if (/^\d{4}$/.test(p)) year = +p;
    else if (/^\d{2}$/.test(p)) year = 2000 + +p;
    else {
      const hit = SEASONS.find(([re]) => re.test(p));
      if (hit) season = hit[1];
    }
  }
  return year === null ? null : year * 10 + season;
}
