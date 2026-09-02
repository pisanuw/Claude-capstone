import type { CronField, CronFieldItem, CronSchedule, RRuleSchedule } from './types.js';
import { pad2 } from './types.js';

/** Plain-English description of a parsed schedule, built rule by rule. */

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function ordinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : abs % 10 === 1
        ? 'st'
        : abs % 10 === 2
          ? 'nd'
          : abs % 10 === 3
            ? 'rd'
            : 'th';
  return `${abs}${suffix}`;
}

function describeItems(
  items: CronFieldItem[],
  unit: string,
  nameOf: (v: number) => string,
): string {
  const parts = items.map((item) => {
    if (item.kind === 'all') {
      return item.step === 1 ? `every ${unit}` : `every ${ordinal(item.step)} ${unit}`;
    }
    if (item.kind === 'value') return nameOf(item.value);
    const span = `${nameOf(item.from)} through ${nameOf(item.to)}`;
    return item.step === 1 ? span : `every ${ordinal(item.step)} ${unit} from ${span}`;
  });
  return joinList(parts);
}

function isSingle(f: CronField): boolean {
  return f.items.length === 1 && f.items[0].kind === 'value';
}

function timePhrase(s: CronSchedule): string {
  const minutes = s.minute.values;
  const hours = s.hour.values;
  // Small crossproducts read best as clock times: "At 04:15 and 16:15".
  const allValues = (f: CronField): boolean => f.items.every((i) => i.kind === 'value');
  if (allValues(s.minute) && allValues(s.hour) && minutes.length * hours.length <= 4) {
    const times: string[] = [];
    for (const h of hours) for (const m of minutes) times.push(`${pad2(h)}:${pad2(m)}`);
    return `At ${joinList(times.sort())}`;
  }
  const minutePart = describeItems(s.minute.items, 'minute', (v) => String(v));
  const hourAll = s.hour.items.length === 1 && s.hour.items[0].kind === 'all';
  if (hourAll && (s.hour.items[0] as { step: number }).step === 1) {
    if (s.minute.items.length === 1 && s.minute.items[0].kind === 'all') {
      const step = s.minute.items[0].step;
      return step === 1 ? 'Every minute' : `Every ${ordinal(step)} minute`;
    }
    if (isSingle(s.minute)) return `At minute ${minutes[0]} past every hour`;
    return `At minute ${minutePart} past every hour`;
  }
  const hourPart = describeItems(s.hour.items, 'hour', (v) => String(v));
  const minuteLead =
    s.minute.items.length === 1 && s.minute.items[0].kind === 'all'
      ? s.minute.items[0].step === 1
        ? 'Every minute'
        : `Every ${ordinal(s.minute.items[0].step)} minute`
      : `At minute ${minutePart}`;
  return `${minuteLead} past hour ${hourPart}`;
}

/** e.g. "At 04:15 on Monday through Friday" for "15 4 * * 1-5". */
export function describeCron(s: CronSchedule): string {
  const parts: string[] = [timePhrase(s)];
  const domRestricted = s.dayOfMonth.restricted;
  const dowRestricted = s.dayOfWeek.restricted;
  if (domRestricted) {
    parts.push(
      `on day-of-month ${describeItems(s.dayOfMonth.items, 'day', (v) => String(v))}`,
    );
  }
  if (dowRestricted) {
    const dowBody = describeItems(s.dayOfWeek.items, 'day', (v) => DOW_FULL[v % 7]);
    parts.push(domRestricted ? `or on ${dowBody}` : `on ${dowBody}`);
  }
  if (s.month.restricted) {
    parts.push(`in ${describeItems(s.month.items, 'month', (v) => MONTH_FULL[v - 1])}`);
  }
  return parts.join(' ');
}

/** e.g. "Every 2 weeks on Monday and Friday at 09:00, until 2026-12-31". */
export function describeRRule(r: RRuleSchedule): string {
  const unitByFreq: Record<string, string> = {
    MINUTELY: 'minute',
    HOURLY: 'hour',
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
  };
  const unit = unitByFreq[r.freq];
  let text = r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  if (r.byDay.length > 0) {
    const days = r.byDay.map((d) => {
      if (d.ordinal === 0) return DOW_FULL[d.weekday];
      if (d.ordinal === -1) return `the last ${DOW_FULL[d.weekday]}`;
      if (d.ordinal < 0) return `the ${ordinal(d.ordinal)}-to-last ${DOW_FULL[d.weekday]}`;
      return `the ${ordinal(d.ordinal)} ${DOW_FULL[d.weekday]}`;
    });
    text += ` on ${joinList(days)}`;
  }
  if (r.byMonthDay.length > 0) {
    text += ` on the ${joinList(r.byMonthDay.map(ordinal))}`;
  }
  if (r.byMonth.length > 0) {
    text += ` in ${joinList(r.byMonth.map((m) => MONTH_FULL[m - 1]))}`;
  }
  if (r.byHour.length > 0 || r.byMinute.length > 0) {
    const hours = r.byHour.length > 0 ? r.byHour : [0];
    const minutes = r.byMinute.length > 0 ? r.byMinute : [0];
    if (hours.length * minutes.length <= 4) {
      const times: string[] = [];
      for (const h of hours) for (const m of minutes) times.push(`${pad2(h)}:${pad2(m)}`);
      text += ` at ${joinList(times.sort())}`;
    } else {
      text += ` at minute ${joinList(minutes.map(String))} past hour ${joinList(hours.map(String))}`;
    }
  }
  if (r.count !== null) text += `, ${r.count} times`;
  if (r.until !== null) {
    text += `, until ${r.until.year}-${pad2(r.until.month)}-${pad2(r.until.day)}`;
  }
  return text;
}
