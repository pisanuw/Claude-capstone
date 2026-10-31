/**
 * Fix-the-bug exercises. Each one ships buggy starter code, a reference fix
 * and hidden tests that replay a leap second through a simulated clock.
 * Student code is plain JavaScript compiled with `new Function`; the UI runs
 * it inside a Web Worker with a time limit.
 */
import { readClock } from './clocks';
import { HISTORICAL_TABLE, type LeapEntry, findLeap, withExtraLeap } from './leaps';

/** What student code may read. Milliseconds, like Date.now() and performance.now(). */
export interface SimClock {
  /** Wall clock (a POSIX step clock), like Date.now(). */
  wallMs(): number;
  /** Monotonic clock, like performance.now() or process.hrtime. */
  monotonicMs(): number;
}

export interface Harness {
  clock: SimClock;
  /** Advance true time by `ms`. */
  advance(ms: number): void;
}

const POSITIVE = findLeap(HISTORICAL_TABLE, '2016-12-31') as LeapEntry;
const NEG_TABLE = withExtraLeap({ date: '2029-12-31', sign: -1 });
const NEGATIVE = findLeap(NEG_TABLE, '2029-12-31') as LeapEntry;

/**
 * A harness whose true time starts `msBeforeLeap` before the leap second.
 * `sign` picks the 2016-12-31 inserted second or a hypothetical removed one.
 */
export function makeHarness(msBeforeLeap: number, sign: 1 | -1 = 1): Harness {
  const leap = sign === 1 ? POSITIVE : NEGATIVE;
  const table = sign === 1 ? HISTORICAL_TABLE : NEG_TABLE;
  const leapStart = sign === 1 ? leap.nextMidnight + leap.before : leap.taiAt;
  const startTai = leapStart - msBeforeLeap / 1000;
  // Keep elapsed true time as a millisecond count so monotonic readings are exact.
  let elapsedMs = 0;
  const bootMs = 1_234_500;
  return {
    clock: {
      wallMs: () => Math.round(readClock('step', startTai + elapsedMs / 1000, leap, table) * 1000),
      monotonicMs: () => bootMs + elapsedMs,
    },
    advance(ms: number) {
      elapsedMs += ms;
    },
  };
}

export interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface Exercise {
  id: string;
  title: string;
  fnName: string;
  prompt: string;
  starter: string;
  solution: string;
  hint: string;
  /** Run the hidden tests against the compiled function. */
  run(fn: unknown): TestResult[];
}

function check(name: string, pass: boolean, detail: string): TestResult {
  return { name, pass, detail };
}

function safe(name: string, body: () => TestResult): TestResult {
  try {
    return body();
  } catch (err) {
    return check(name, false, `threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

type DeadlineFn = (clock: SimClock, ms: number) => () => boolean;
type LimiterFn = (clock: SimClock, rate: number, burst: number) => () => boolean;
type ElapsedFn = (a: string, b: string, leaps: string[]) => number;
type MergeFn = (lines: string[]) => string[];

/** Run a deadline and report the true ms at which it first said "expired". */
function firstExpiry(make: DeadlineFn, h: Harness, deadlineMs: number, stepMs: number, maxMs: number): number | null {
  const expired = make(h.clock, deadlineMs);
  for (let t = 0; t <= maxMs; t += stepMs) {
    if (expired()) return t;
    h.advance(stepMs);
  }
  return null;
}

const deadline: Exercise = {
  id: 'deadline',
  title: 'A timeout that waits an extra second',
  fnName: 'makeDeadline',
  prompt:
    'makeDeadline(clock, ms) returns a function that reports whether ms milliseconds have passed since the deadline was created. It is used for request timeouts. Across a leap second the wall clock steps back (or forward), and the timeout fires a second late (or early). Make it measure real elapsed time.',
  starter: `function makeDeadline(clock, ms) {
  const start = clock.wallMs();
  return () => clock.wallMs() - start >= ms;
}`,
  solution: `function makeDeadline(clock, ms) {
  const start = clock.monotonicMs();
  return () => clock.monotonicMs() - start >= ms;
}`,
  hint: 'clock.wallMs() is a date clock; clock.monotonicMs() only ever moves forward at the rate of real time.',
  run(fn) {
    const make = fn as DeadlineFn;
    return [
      safe('Ordinary day: a 500 ms deadline fires after 500 ms', () => {
        const at = firstExpiry(make, makeHarness(5_000_000), 500, 50, 3000);
        return check('Ordinary day: a 500 ms deadline fires after 500 ms', at === 500, `fired at ${at ?? 'never'} ms`);
      }),
      safe('Inserted leap second: a 1500 ms deadline set 200 ms before 23:59:60 fires at 1500 ms', () => {
        const at = firstExpiry(make, makeHarness(200, 1), 1500, 50, 4000);
        return check('Inserted leap second: a 1500 ms deadline set 200 ms before 23:59:60 fires at 1500 ms', at === 1500, `fired at ${at ?? 'never'} ms of real time`);
      }),
      safe('Removed leap second: a 1500 ms deadline set 200 ms before the gap fires at 1500 ms', () => {
        const at = firstExpiry(make, makeHarness(200, -1), 1500, 50, 4000);
        return check('Removed leap second: a 1500 ms deadline set 200 ms before the gap fires at 1500 ms', at === 1500, `fired at ${at ?? 'never'} ms of real time`);
      }),
    ];
  },
};

/** Fire requests every `gapMs` for `count` requests and count how many were allowed. */
function allowedCount(allow: () => boolean, h: Harness, gapMs: number, count: number): number {
  let ok = 0;
  for (let i = 0; i < count; i++) {
    if (allow()) ok += 1;
    h.advance(gapMs);
  }
  return ok;
}

const limiter: Exercise = {
  id: 'limiter',
  title: 'A rate limiter that locks users out at midnight',
  fnName: 'makeLimiter',
  prompt:
    'makeLimiter(clock, ratePerSec, burst) is a token bucket: it allows up to burst requests at once and refills ratePerSec tokens per second. A client sending 5 requests per second to a 10-per-second limiter should never be refused, but when the wall clock steps back the refill goes negative and the client is locked out. Fix it without making the limiter more generous.',
  starter: `function makeLimiter(clock, ratePerSec, burst) {
  let tokens = burst;
  let last = clock.wallMs();
  return () => {
    const now = clock.wallMs();
    tokens = Math.min(burst, tokens + (now - last) / 1000 * ratePerSec);
    last = now;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
}`,
  solution: `function makeLimiter(clock, ratePerSec, burst) {
  let tokens = burst;
  let last = clock.monotonicMs();
  return () => {
    const now = clock.monotonicMs();
    tokens = Math.min(burst, tokens + (now - last) / 1000 * ratePerSec);
    last = now;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
}`,
  hint: 'A negative elapsed time should never remove tokens. Which clock cannot go backwards?',
  run(fn) {
    const make = fn as LimiterFn;
    return [
      safe('Steady 5 req/s across 23:59:60 is never refused', () => {
        const h = makeHarness(2000, 1);
        const ok = allowedCount(make(h.clock, 10, 2), h, 200, 20);
        return check('Steady 5 req/s across 23:59:60 is never refused', ok === 20, `${ok} of 20 allowed`);
      }),
      safe('Steady 5 req/s across a removed second is never refused', () => {
        const h = makeHarness(2000, -1);
        const ok = allowedCount(make(h.clock, 10, 2), h, 200, 20);
        return check('Steady 5 req/s across a removed second is never refused', ok === 20, `${ok} of 20 allowed`);
      }),
      safe('Still a limiter: 10 instant requests with burst 2 allow exactly 2', () => {
        const h = makeHarness(5_000_000);
        const ok = allowedCount(make(h.clock, 10, 2), h, 0, 10);
        return check('Still a limiter: 10 instant requests with burst 2 allow exactly 2', ok === 2, `${ok} of 10 allowed`);
      }),
      safe('A removed second does not hand out a free burst', () => {
        // 30 req/s against a 10 req/s limiter, burst 3: over 2 s of real time
        // the honest answer is 3 + 10·2 = 23 at most (±1 for edge timing).
        const h = makeHarness(1000, -1);
        const allow = make(h.clock, 10, 3);
        const ok = allowedCount(allow, h, 1000 / 30, 60);
        return check('A removed second does not hand out a free burst', ok <= 24, `${ok} of 60 allowed (limit about 23)`);
      }),
    ];
  },
};

const LEAPS_FOR_EXERCISE = HISTORICAL_TABLE.map((e) => e.date);

const elapsed: Exercise = {
  id: 'elapsed',
  title: 'Billing seconds across a leap second',
  fnName: 'elapsedSeconds',
  prompt:
    'elapsedSeconds(start, end, leaps) returns the true SI seconds between two UTC timestamps such as "2016-12-31T23:59:60.500Z". leaps is the list of dates (YYYY-MM-DD) whose last minute had an inserted 61st second. Date.parse cannot read :60 and does not count leap seconds. Make it right.',
  starter: `function elapsedSeconds(start, end, leaps) {
  return (Date.parse(end) - Date.parse(start)) / 1000;
}`,
  solution: `function elapsedSeconds(start, end, leaps) {
  // "POSIX seconds + leap seconds already inserted" is a continuous count.
  function toSi(label) {
    const m = /^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(\\.\\d+)?Z$/.exec(label);
    if (!m) throw new Error('bad timestamp ' + label);
    const date = m[1];
    const whole = Number(m[4]);
    const frac = m[5] ? Number(m[5]) : 0;
    if (whole === 60) {
      // 23:59:60.x is one second after 23:59:59; only earlier leaps have been counted.
      const posix = Date.parse(date + 'T' + m[2] + ':' + m[3] + ':59Z') / 1000 + 1 + frac;
      return posix + leaps.filter((d) => d < date).length;
    }
    const posix = Date.parse(date + 'T' + m[2] + ':' + m[3] + ':' + m[4] + 'Z') / 1000 + frac;
    return posix + leaps.filter((d) => Date.parse(d + 'T00:00:00Z') / 1000 + 86400 <= posix).length;
  }
  return toSi(end) - toSi(start);
}`,
  hint: 'Turn each label into "seconds since some epoch, counting every leap second already inserted"; handle :60 as one second after :59.',
  run(fn) {
    const f = fn as ElapsedFn;
    const cases: [string, string, number][] = [
      ['2016-12-31T23:59:59Z', '2017-01-01T00:00:00Z', 2],
      ['2016-12-31T23:59:60Z', '2017-01-01T00:00:00Z', 1],
      ['2016-12-31T23:59:59Z', '2016-12-31T23:59:60.500Z', 1.5],
      ['2016-01-01T00:00:00Z', '2017-01-01T00:00:00Z', 31622401],
      ['2017-03-01T00:00:00Z', '2017-03-01T00:01:00Z', 60],
      ['2012-06-30T12:00:00Z', '2015-07-01T12:00:00Z', 94694402],
    ];
    return cases.map(([a, b, want]) =>
      safe(`${a} → ${b} is ${want} s`, () => {
        const got = f(a, b, [...LEAPS_FOR_EXERCISE]);
        return check(`${a} → ${b} is ${want} s`, Math.abs(got - want) < 1e-6, `returned ${got}`);
      }),
    );
  },
};

const merge: Exercise = {
  id: 'merge',
  title: 'Merging logs that contain 23:59:60',
  fnName: 'mergeLogs',
  prompt:
    'mergeLogs(lines) sorts log lines from several hosts into time order. Each line starts with a UTC timestamp in the same fixed format, for example "2016-12-31T23:59:60.250Z web-2 GET /". Hosts that log leap seconds correctly write :60, which Date.parse turns into NaN, and the sort scrambles the night. Lines with equal timestamps must keep their input order.',
  starter: `function mergeLogs(lines) {
  return [...lines].sort((a, b) => Date.parse(a.slice(0, 24)) - Date.parse(b.slice(0, 24)));
}`,
  solution: `function mergeLogs(lines) {
  // Fixed-width ISO-8601 UTC timestamps sort correctly as strings,
  // including 23:59:60, which falls between 23:59:59 and the next midnight.
  return [...lines].sort((a, b) => (a.slice(0, 24) < b.slice(0, 24) ? -1 : a.slice(0, 24) > b.slice(0, 24) ? 1 : 0));
}`,
  hint: 'You may not need to parse at all. How do fixed-width ISO timestamps compare as strings?',
  run(fn) {
    const f = fn as MergeFn;
    const input = [
      '2017-01-01T00:00:00.100Z db-1 commit 7',
      '2016-12-31T23:59:59.900Z web-1 GET /a',
      '2016-12-31T23:59:60.250Z web-2 GET /b',
      '2016-12-31T23:59:60.250Z web-1 GET /c',
      '2016-12-31T23:59:58.000Z db-1 commit 6',
      '2016-12-31T23:59:60.999Z db-1 commit 6b',
    ];
    const want = [input[4], input[1], input[2], input[3], input[5], input[0]];
    return [
      safe('Orders lines across 23:59:60', () => {
        const got = f([...input]);
        const pass = JSON.stringify(got) === JSON.stringify(want);
        return check('Orders lines across 23:59:60', pass, pass ? 'in order' : `got:\n${(got ?? []).join('\n')}`);
      }),
      safe('Does not modify its input', () => {
        const copy = [...input];
        f(copy);
        return check('Does not modify its input', JSON.stringify(copy) === JSON.stringify(input), 'input array checked after the call');
      }),
      safe('Ordinary lines stay ordered', () => {
        const plain = ['2017-03-01T10:00:02.000Z a', '2017-03-01T10:00:01.000Z b', '2017-03-01T09:59:59.000Z c'];
        const got = f([...plain]);
        return check('Ordinary lines stay ordered', JSON.stringify(got) === JSON.stringify([plain[2], plain[1], plain[0]]), (got ?? []).join(' | '));
      }),
    ];
  },
};

export const EXERCISES: readonly Exercise[] = [deadline, limiter, elapsed, merge];

/** Compile student source into the named function. Throws on syntax errors. */
export function compile(source: string, fnName: string): unknown {
  const factory = new Function(`"use strict";\n${source}\n;return typeof ${fnName} === 'function' ? ${fnName} : undefined;`);
  const fn = factory();
  if (typeof fn !== 'function') throw new Error(`Define a function named ${fnName}`);
  return fn;
}

export function runExercise(ex: Exercise, source: string): TestResult[] {
  let fn: unknown;
  try {
    fn = compile(source, ex.fnName);
  } catch (err) {
    return [check('Compiles', false, err instanceof Error ? err.message : String(err))];
  }
  return ex.run(fn);
}

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}
