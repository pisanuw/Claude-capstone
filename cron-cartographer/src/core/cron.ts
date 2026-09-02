import type { CronField, CronFieldItem, CronSchedule, WallTime } from './types.js';
import { weekdayOf } from './types.js';

/**
 * A five-field cron parser (minute hour day-of-month month day-of-week)
 * with the extensions people actually paste: lists, ranges, steps, month
 * and weekday names, @shortcuts, 7-as-Sunday, and wrap-around ranges like
 * FRI-MON. GitHub Actions `schedule:` uses exactly this syntax.
 */

export class CronParseError extends Error {}

const SHORTCUTS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];
export const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
  namesBase?: number;
}

const FIELD_SPECS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTH_NAMES, namesBase: 1 },
  { name: 'day-of-week', min: 0, max: 7, names: DOW_NAMES, namesBase: 0 },
];

function parseAtom(atom: string, spec: FieldSpec): number {
  if (/^\d+$/.test(atom)) {
    const n = Number(atom);
    if (n < spec.min || n > spec.max) {
      throw new CronParseError(
        `${spec.name} value ${n} is out of range ${spec.min}-${spec.max}`,
      );
    }
    return n;
  }
  if (spec.names) {
    const idx = spec.names.indexOf(atom.toUpperCase());
    if (idx >= 0) return idx + (spec.namesBase ?? 0);
  }
  throw new CronParseError(`cannot parse "${atom}" in the ${spec.name} field`);
}

function parseItem(item: string, spec: FieldSpec): CronFieldItem {
  let body = item;
  let step = 1;
  const slash = item.indexOf('/');
  if (slash >= 0) {
    body = item.slice(0, slash);
    const stepStr = item.slice(slash + 1);
    if (!/^\d+$/.test(stepStr) || Number(stepStr) < 1) {
      throw new CronParseError(`invalid step "/${stepStr}" in the ${spec.name} field`);
    }
    step = Number(stepStr);
  }
  if (body === '*') return { kind: 'all', step };
  const dash = body.indexOf('-');
  if (dash > 0) {
    const from = parseAtom(body.slice(0, dash), spec);
    const to = parseAtom(body.slice(dash + 1), spec);
    return { kind: 'range', from, to, step, wrapped: from > to };
  }
  const value = parseAtom(body, spec);
  // Vixie cron treats "5/15" as "5-max/15".
  if (slash >= 0) return { kind: 'range', from: value, to: spec.max, step, wrapped: false };
  return { kind: 'value', value };
}

function itemValues(item: CronFieldItem, spec: FieldSpec): number[] {
  const out: number[] = [];
  if (item.kind === 'all') {
    for (let v = spec.min; v <= spec.max; v += item.step) out.push(v);
    return out;
  }
  if (item.kind === 'value') return [item.value];
  if (!item.wrapped) {
    for (let v = item.from; v <= item.to; v += item.step) out.push(v);
    return out;
  }
  // Wrap-around range, e.g. FRI-MON or 22-2: walk through the end and around.
  const span = spec.max - spec.min + 1;
  for (let i = 0; i <= (item.to - item.from + span) % span; i += item.step) {
    out.push(spec.min + ((item.from - spec.min + i) % span));
  }
  return out;
}

function parseField(field: string, spec: FieldSpec): CronField {
  if (field.length === 0) throw new CronParseError(`empty ${spec.name} field`);
  const items = field.split(',').map((part) => {
    if (part.length === 0) {
      throw new CronParseError(`empty list item in the ${spec.name} field`);
    }
    return parseItem(part, spec);
  });
  const values = new Set<number>();
  for (const item of items) for (const v of itemValues(item, spec)) values.add(v);
  const sorted = [...values].sort((a, b) => a - b);
  // The vixie rule: a field is "restricted" for the dom/dow union unless it
  // is written with a leading "*" (so "*/2" is unrestricted, "0-6" is not).
  const restricted = !field.startsWith('*');
  return { values: sorted, items, restricted };
}

/** Parse a five-field cron expression or an @shortcut. */
export function parseCron(expression: string): CronSchedule {
  let text = expression.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  if (lower.startsWith('@')) {
    const expanded = SHORTCUTS[lower];
    if (!expanded) {
      throw new CronParseError(
        `unknown shortcut "${text}" (known: ${Object.keys(SHORTCUTS).join(', ')})`,
      );
    }
    text = expanded;
  }
  const fields = text.split(' ');
  if (fields.length === 6) {
    throw new CronParseError(
      'six fields found: seconds-resolution cron is not supported, use the five-field form (minute hour day-of-month month day-of-week)',
    );
  }
  if (fields.length !== 5) {
    throw new CronParseError(
      `expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
    );
  }
  const [minute, hour, dayOfMonth, month, dayOfWeekRaw] = fields.map((f, i) =>
    parseField(f, FIELD_SPECS[i]),
  );
  // Normalize 7 (also Sunday) onto 0.
  const dowValues = [...new Set(dayOfWeekRaw.values.map((v) => v % 7))].sort((a, b) => a - b);
  const dayOfWeek: CronField = { ...dayOfWeekRaw, values: dowValues };
  return { kind: 'cron', source: text, minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Does the schedule's date part match this calendar day?
 *
 * Standard cron semantics: when BOTH day-of-month and day-of-week are
 * restricted, a day matches if EITHER does; otherwise both must match
 * (an unrestricted field matches every day).
 */
export function matchesDay(s: CronSchedule, year: number, month: number, day: number): boolean {
  if (!s.month.values.includes(month)) return false;
  const domMatch = s.dayOfMonth.values.includes(day);
  const dowMatch = s.dayOfWeek.values.includes(weekdayOf(year, month, day));
  if (s.dayOfMonth.restricted && s.dayOfWeek.restricted) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

/** Does the schedule fire at this exact wall time? */
export function matchesWall(s: CronSchedule, w: WallTime): boolean {
  return (
    s.minute.values.includes(w.minute) &&
    s.hour.values.includes(w.hour) &&
    matchesDay(s, w.year, w.month, w.day)
  );
}

/**
 * Pull cron expressions out of a pasted GitHub Actions `on.schedule` YAML
 * snippet. Returns the expressions in order, or [] if none are present.
 */
export function extractGithubActionsCrons(text: string): string[] {
  const out: string[] = [];
  const re = /-?\s*cron\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\n#]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const expr = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (expr.length > 0) out.push(expr);
  }
  return out;
}
