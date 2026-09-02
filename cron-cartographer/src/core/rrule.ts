import type { RRuleByDay, RRuleFreq, RRuleSchedule, WallTime } from './types.js';
import { weekdayOf } from './types.js';
import { naiveUtcMsToWall, wallToNaiveUtcMs } from './tz.js';

/**
 * A practical subset of RFC 5545 RRULE: FREQ, INTERVAL, BYDAY (with
 * ordinals for MONTHLY, e.g. 1MO and -1FR), BYMONTHDAY, BYMONTH, BYHOUR,
 * BYMINUTE, COUNT, UNTIL. There is no DTSTART in a pasted rule, so
 * expansion anchors at the start of the preview horizon; UNTIL is read as
 * a wall-clock cutoff in the schedule zone (a trailing Z is ignored).
 */

export class RRuleParseError extends Error {}

const FREQS: RRuleFreq[] = ['MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const BYDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseIntList(value: string, min: number, max: number, key: string): number[] {
  return value.split(',').map((part) => {
    if (!/^-?\d+$/.test(part)) throw new RRuleParseError(`invalid ${key} value "${part}"`);
    const n = Number(part);
    if (n < min || n > max) {
      throw new RRuleParseError(`${key} value ${n} is out of range ${min}..${max}`);
    }
    return n;
  });
}

function parseUntil(value: string): WallTime {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/.exec(value);
  if (!m) throw new RRuleParseError(`cannot parse UNTIL value "${value}"`);
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] !== undefined ? Number(m[4]) : 23,
    minute: m[5] !== undefined ? Number(m[5]) : 59,
  };
}

/** Parse an RRULE line ("RRULE:" prefix optional). */
export function parseRRule(input: string): RRuleSchedule {
  let text = input.trim();
  const prefixed = /^RRULE\s*:/i.exec(text);
  if (prefixed) text = text.slice(prefixed[0].length).trim();
  if (text.length === 0) throw new RRuleParseError('empty rule');
  const rule: RRuleSchedule = {
    kind: 'rrule',
    source: text.toUpperCase(),
    freq: 'DAILY',
    interval: 1,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    byHour: [],
    byMinute: [],
    count: null,
    until: null,
  };
  let sawFreq = false;
  for (const pair of text.split(';')) {
    if (pair.trim().length === 0) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) throw new RRuleParseError(`expected KEY=VALUE, got "${pair}"`);
    const key = pair.slice(0, eq).trim().toUpperCase();
    const value = pair.slice(eq + 1).trim().toUpperCase();
    switch (key) {
      case 'FREQ': {
        if (!FREQS.includes(value as RRuleFreq)) {
          throw new RRuleParseError(`unsupported FREQ "${value}"`);
        }
        rule.freq = value as RRuleFreq;
        sawFreq = true;
        break;
      }
      case 'INTERVAL': {
        if (!/^\d+$/.test(value) || Number(value) < 1) {
          throw new RRuleParseError(`invalid INTERVAL "${value}"`);
        }
        rule.interval = Number(value);
        break;
      }
      case 'BYDAY': {
        rule.byDay = value.split(',').map((tok): RRuleByDay => {
          const m = /^(-?\d)?([A-Z]{2})$/.exec(tok);
          if (!m || !(m[2] in BYDAY_CODES)) {
            throw new RRuleParseError(`invalid BYDAY token "${tok}"`);
          }
          const ordinal = m[1] !== undefined ? Number(m[1]) : 0;
          if (m[1] !== undefined && (ordinal === 0 || ordinal > 5 || ordinal < -5)) {
            throw new RRuleParseError(`BYDAY ordinal out of range in "${tok}"`);
          }
          return { weekday: BYDAY_CODES[m[2]], ordinal };
        });
        break;
      }
      case 'BYMONTHDAY':
        rule.byMonthDay = parseIntList(value, 1, 31, 'BYMONTHDAY');
        break;
      case 'BYMONTH':
        rule.byMonth = parseIntList(value, 1, 12, 'BYMONTH');
        break;
      case 'BYHOUR':
        rule.byHour = parseIntList(value, 0, 23, 'BYHOUR').sort((a, b) => a - b);
        break;
      case 'BYMINUTE':
        rule.byMinute = parseIntList(value, 0, 59, 'BYMINUTE').sort((a, b) => a - b);
        break;
      case 'COUNT': {
        if (!/^\d+$/.test(value) || Number(value) < 1) {
          throw new RRuleParseError(`invalid COUNT "${value}"`);
        }
        rule.count = Number(value);
        break;
      }
      case 'UNTIL':
        rule.until = parseUntil(value);
        break;
      case 'WKST':
        break; // accepted and ignored: we do not use week-start-dependent expansion
      default:
        throw new RRuleParseError(`unsupported RRULE part "${key}"`);
    }
  }
  if (!sawFreq) throw new RRuleParseError('RRULE needs a FREQ part');
  return rule;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days of `year-month` matching one BYDAY token (handles ordinals). */
function byDayDatesInMonth(year: number, month: number, tok: RRuleByDay): number[] {
  const n = daysInMonth(year, month);
  const all: number[] = [];
  for (let d = 1; d <= n; d++) {
    if (weekdayOf(year, month, d) === tok.weekday) all.push(d);
  }
  if (tok.ordinal === 0) return all;
  const idx = tok.ordinal > 0 ? tok.ordinal - 1 : all.length + tok.ordinal;
  return idx >= 0 && idx < all.length ? [all[idx]] : [];
}

function timesForDay(rule: RRuleSchedule): Array<{ hour: number; minute: number }> {
  const hours = rule.byHour.length > 0 ? rule.byHour : [0];
  const minutes = rule.byMinute.length > 0 ? rule.byMinute : [0];
  const out: Array<{ hour: number; minute: number }> = [];
  for (const hour of hours) for (const minute of minutes) out.push({ hour, minute });
  return out;
}

const MS_PER_DAY = 24 * 3600 * 1000;

/**
 * Expand the rule into wall-time occurrences within [anchor, horizonEnd),
 * anchored at `anchor` (the start of the preview horizon). Occurrences are
 * naive wall times in the schedule zone; the caller converts to instants.
 */
export function expandRRule(rule: RRuleSchedule, anchor: WallTime, horizonDays: number): WallTime[] {
  const out: WallTime[] = [];
  const untilMs = rule.until !== null ? wallToNaiveUtcMs(rule.until) : Infinity;
  const anchorDate: WallTime = { ...anchor, hour: 0, minute: 0 };
  const anchorMs = wallToNaiveUtcMs(anchor);
  const maxCount = rule.count ?? Infinity;

  const push = (w: WallTime): boolean => {
    const ms = wallToNaiveUtcMs(w);
    if (ms < anchorMs || ms > untilMs) return out.length < maxCount;
    if (out.length >= maxCount) return false;
    out.push(w);
    return out.length < maxCount;
  };

  if (rule.freq === 'MINUTELY' || rule.freq === 'HOURLY') {
    const stepMs = rule.interval * (rule.freq === 'MINUTELY' ? 60000 : 3600000);
    const endMs = wallToNaiveUtcMs(anchorDate) + horizonDays * MS_PER_DAY;
    for (let ms = anchorMs; ms < endMs; ms += stepMs) {
      const w = naiveUtcMsToWall(ms);
      if (rule.byHour.length > 0 && !rule.byHour.includes(w.hour)) continue;
      if (rule.byMinute.length > 0 && !rule.byMinute.includes(w.minute)) continue;
      if (rule.byDay.length > 0 && !rule.byDay.some((t) => t.weekday === weekdayOf(w.year, w.month, w.day))) continue;
      if (!push(w)) break;
    }
    return out;
  }

  const times = timesForDay(rule);
  const startDayMs = wallToNaiveUtcMs(anchorDate);
  for (let dayIndex = 0; dayIndex < horizonDays; dayIndex++) {
    const w = naiveUtcMsToWall(startDayMs + dayIndex * MS_PER_DAY);
    const dow = weekdayOf(w.year, w.month, w.day);
    let matches = false;
    switch (rule.freq) {
      case 'DAILY':
        matches = dayIndex % rule.interval === 0;
        break;
      case 'WEEKLY': {
        // Weeks count from the anchor's week (weeks start on Monday).
        const anchorDow = weekdayOf(anchorDate.year, anchorDate.month, anchorDate.day);
        const anchorWeekStart = -((anchorDow + 6) % 7);
        const week = Math.floor((dayIndex - anchorWeekStart) / 7);
        const wanted = rule.byDay.length > 0 ? rule.byDay.map((t) => t.weekday) : [anchorDow];
        matches = week % rule.interval === 0 && wanted.includes(dow);
        break;
      }
      case 'MONTHLY': {
        const monthIndex =
          (w.year - anchorDate.year) * 12 + (w.month - anchorDate.month);
        if (monthIndex % rule.interval !== 0) break;
        if (rule.byDay.length > 0) {
          matches = rule.byDay.some((tok) => byDayDatesInMonth(w.year, w.month, tok).includes(w.day));
        } else if (rule.byMonthDay.length > 0) {
          matches = rule.byMonthDay.includes(w.day);
        } else {
          matches = w.day === anchorDate.day;
        }
        break;
      }
      case 'YEARLY': {
        if ((w.year - anchorDate.year) % rule.interval !== 0) break;
        const monthOk =
          rule.byMonth.length > 0 ? rule.byMonth.includes(w.month) : w.month === anchorDate.month;
        if (!monthOk) break;
        if (rule.byDay.length > 0) {
          matches = rule.byDay.some((tok) => byDayDatesInMonth(w.year, w.month, tok).includes(w.day));
        } else if (rule.byMonthDay.length > 0) {
          matches = rule.byMonthDay.includes(w.day);
        } else {
          matches = w.day === anchorDate.day;
        }
        break;
      }
    }
    if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
      if (matches && rule.byMonth.length > 0 && !rule.byMonth.includes(w.month)) matches = false;
    }
    if (rule.freq === 'DAILY' || rule.freq === 'WEEKLY') {
      if (matches && rule.byMonth.length > 0 && !rule.byMonth.includes(w.month)) matches = false;
      if (matches && rule.byMonthDay.length > 0 && !rule.byMonthDay.includes(w.day)) matches = false;
      if (matches && rule.freq === 'DAILY' && rule.byDay.length > 0) {
        matches = rule.byDay.some((t) => t.weekday === dow);
      }
    }
    if (!matches) continue;
    let keepGoing = true;
    for (const t of times) {
      keepGoing = push({ ...w, hour: t.hour, minute: t.minute });
      if (!keepGoing) break;
    }
    if (!keepGoing) break;
  }
  return out;
}
