/**
 * The library test bench: recorded outputs (src/data/bench.json, produced by
 * scripts/record-bench.mjs) plus a leap-second-aware "truth" computed here and
 * a hand-written note for every runtime's result.
 */
import data from '../data/bench.json';
import {
  HISTORICAL_TABLE,
  elapsedBetween,
  formatPosix,
  formatTai,
  parseLabel,
  parseToTai,
  posixStep,
  validateLabel,
  withExtraLeap,
} from './leaps';

export type Runtime = 'date' | 'temporal' | 'python' | 'postgres';
export const RUNTIMES: readonly Runtime[] = ['date', 'temporal', 'python', 'postgres'];
export const RUNTIME_LABEL: Record<Runtime, string> = {
  date: 'JS Date',
  temporal: 'Temporal',
  python: 'Python',
  postgres: 'Postgres',
};

export interface RecordedResult {
  ok: boolean;
  output: string;
}

export interface BenchCase {
  id: string;
  title: string;
  input: string;
  snippets: Record<Runtime, string>;
  results: Partial<Record<Runtime, RecordedResult>>;
}

export interface BenchData {
  recordedOn: string;
  runtimes: Record<Runtime, string>;
  cases: BenchCase[];
}

export const BENCH: BenchData = data as unknown as BenchData;

const NEG_TABLE = withExtraLeap({ date: '2029-12-31', sign: -1 });

/** A leap-second-aware answer for each case, from this app's own time library. */
export function truthFor(id: string): string {
  switch (id) {
    case 'parse-leap': {
      const tai = parseToTai('2016-12-31T23:59:60Z');
      return `A real instant: ${formatTai(tai, HISTORICAL_TABLE)} UTC = ${formatPosix(tai, 0)} TAI. It is 1 s after 23:59:59 and 1 s before midnight.`;
    }
    case 'parse-leap-frac': {
      const tai = parseToTai('2016-12-31T23:59:60.500Z');
      return `A real instant, ${formatPosix(tai, 1)} TAI, half-way through the 61st second.`;
    }
    case 'unix-of-leap': {
      const tai = parseToTai('2016-12-31T23:59:60Z');
      return `POSIX time has no value of its own for it. A stepping kernel reports ${posixStep(tai, HISTORICAL_TABLE)} (23:59:59) a second time; 1483228800 is midnight.`;
    }
    case 'fake-leap':
      return validateLabel(parseLabel('2017-06-30T23:59:60Z'), HISTORICAL_TABLE) ?? '';
    case 'duration-across':
    case 'duration-year': {
      const c = BENCH.cases.find((x) => x.id === id) as BenchCase;
      const [from, to] = c.input.split(' → ');
      return `${elapsedBetween(from, to)} SI seconds (the leap second counts).`;
    }
    case 'add-day': {
      const tai = parseToTai('2016-12-31T12:00:00Z') + 86400;
      return `86,400 SI seconds later the UTC clock reads ${formatTai(tai, HISTORICAL_TABLE, 0)}Z, because one of those seconds was 23:59:60.`;
    }
    case 'neg-label':
      return validateLabel(parseLabel('2029-12-31T23:59:59Z'), NEG_TABLE) ?? '';
    case 'neg-duration':
      return `${elapsedBetween('2029-12-31T23:59:58Z', '2030-01-01T00:00:00Z', NEG_TABLE)} SI second: 23:59:58 is followed directly by midnight.`;
    case 'sort-strings':
      return '2016-12-31T23:59:59Z, 2016-12-31T23:59:60Z, 2017-01-01T00:00:00Z (which is also plain string order for this fixed-width format).';
    default:
      return '';
  }
}

/** Why each runtime produced what it did. Keyed `${caseId}:${runtime}`. */
export const NOTES: Record<string, string> = {
  'parse-leap:date':
    'ECMAScript Date has no leap seconds and its date-time string format allows seconds 00–59 only, so the string is rejected: the Date is Invalid and toISOString() throws.',
  'parse-leap:temporal':
    'Temporal accepts :60 in input and clamps it to :59 (the spec says to treat a leap second as the second before it), so 23:59:59 and 23:59:60 become the same instant.',
  'parse-leap:python':
    "datetime can't represent second 60; fromisoformat raises rather than guess.",
  'parse-leap:postgres':
    'Postgres accepts 23:59:60 and rolls it over to the next minute, so the leap second and midnight become the same timestamp.',
  'parse-leap-frac:date': 'Rejected for the same reason: seconds must be below 60.',
  'parse-leap-frac:temporal': 'Clamped to 23:59:59.5: a reading taken during the leap second is moved back a whole second and now collides with the real 23:59:59.5.',
  'parse-leap-frac:python':
    'time.strptime would accept %S = 60, but datetime.strptime then builds a datetime, which only allows 0–59.',
  'parse-leap-frac:postgres':
    'The rollover only covers exactly :60. Any fraction inside the leap second is out of range and the cast fails, so a log line stamped 23:59:60.5 cannot be loaded.',
  'unix-of-leap:date': 'Date.UTC normalizes 60 seconds into the next minute: you get midnight, 1483228800.',
  'unix-of-leap:temporal': 'Because :60 is clamped to :59, the epoch value is 1483228799, the same as the second before.',
  'unix-of-leap:python': 'time.strptime allows 60 (its range is 0–61), and calendar.timegm does plain arithmetic, landing on midnight.',
  'unix-of-leap:postgres': 'The rolled-over timestamp is midnight, 1483228800.',
  'fake-leap:date': 'Rejected, but only because Date rejects every :60, not because it knows 2017-06-30 had no leap second.',
  'fake-leap:temporal': 'Clamped to 23:59:59 like a real leap second. No library here knows the leap-second table.',
  'fake-leap:python': 'strptime and timegm accept it and return midnight; there is no check that the leap second existed.',
  'fake-leap:postgres': 'Accepted and rolled to midnight, same as the real one.',
  'duration-across:date': 'Date arithmetic treats every day as 86,400 s, so the leap second is missing: 1 instead of 2.',
  'duration-across:temporal': 'Temporal.Instant counts POSIX-style seconds (it is defined on the Unix epoch without leap seconds), so it also says 1.',
  'duration-across:python': 'Aware datetimes subtract as if UTC had no leap seconds: 1.0.',
  'duration-across:postgres': 'timestamptz subtraction ignores leap seconds: 1 second.',
  'duration-year:date': '366 × 86,400. The leap second at the end of 2016 is not counted.',
  'duration-year:temporal': 'Same POSIX count: 31,622,400.',
  'duration-year:python': 'Same POSIX count.',
  'duration-year:postgres': 'Same POSIX count.',
  'add-day:date': 'Adding 86,400 s lands on 12:00:00 exactly, which is really 86,401 SI seconds later. For most code this is the answer you want; for a physical timer it is 1 s off.',
  'add-day:temporal': 'Same: Instant arithmetic is in POSIX seconds.',
  'add-day:python': 'timedelta arithmetic on aware datetimes is POSIX arithmetic.',
  'add-day:postgres': 'interval arithmetic ignores leap seconds.',
  'neg-label:date': 'Every library accepts it: none of them knows about leap seconds at all, positive or negative.',
  'neg-label:temporal': 'Accepted. A hypothetical negative leap second would be invisible to Temporal too.',
  'neg-label:python': 'Accepted.',
  'neg-label:postgres': 'Accepted.',
  'neg-duration:date': '2 instead of 1: the removed second is still counted.',
  'neg-duration:temporal': '2 instead of 1.',
  'neg-duration:python': '2.0 instead of 1.',
  'neg-duration:postgres': '2 instead of 1.',
  'sort-strings:date':
    'Date.parse returns NaN for :60, and a comparator returning NaN makes the sort order undefined. Here the list came back unsorted.',
  'sort-strings:temporal':
    '23:59:60 and 23:59:59 get the same key; the sort is stable, so they stay in input order, which puts the leap second first.',
  'sort-strings:python': '23:59:60 and midnight get the same key; the stable sort keeps midnight (listed first) ahead of the leap second.',
  'sort-strings:postgres': 'Same collision as Python: :60 rolls to midnight and the two tie, so the leap second sorts after midnight.',
};

export function noteFor(id: string, runtime: Runtime): string {
  return NOTES[`${id}:${runtime}`] ?? '';
}

/** Results that match the leap-second-aware answer. Everything else either failed loudly or was silently wrong. */
const RIGHT = new Set(['unix-of-leap:temporal']);

export type Verdict = 'right' | 'loud' | 'silent' | 'missing';

/**
 * right: agrees with the truth. loud: raised an error (you find out).
 * silent: returned a plausible wrong answer (you do not).
 */
export function verdict(c: BenchCase, runtime: Runtime): Verdict {
  const r = c.results[runtime];
  if (!r) return 'missing';
  if (!r.ok) return 'loud';
  return RIGHT.has(`${c.id}:${runtime}`) ? 'right' : 'silent';
}
