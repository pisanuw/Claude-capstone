/** Local-date helpers. Day numbers are whole days since the Unix epoch, local time. */

const MS_PER_DAY = 86_400_000;

/** Day number for a Date, in that Date's local timezone. */
export function dayNumber(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / MS_PER_DAY);
}

/** "YYYY-MM-DD" in local time. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Day number for a "YYYY-MM-DD" string (timezone-independent). */
export function dayNumberFromIso(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`bad date: ${iso}`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}
