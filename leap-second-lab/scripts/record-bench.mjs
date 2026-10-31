#!/usr/bin/env node
/**
 * Record what real time libraries do with leap-second edge cases and write
 * src/data/bench.json. The site shows these recorded outputs; nothing runs
 * these runtimes in the browser.
 *
 *   npm run bench            # Node Date + Temporal polyfill + Python (+ Postgres if reachable)
 *   PSQL="psql -h /var/run/postgresql -U postgres" npm run bench
 *
 * Postgres is reached with the command in $PSQL (default: `psql -X -A -t`).
 * If it fails, previously recorded Postgres results are kept.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Temporal } from '@js-temporal/polyfill';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'src', 'data', 'bench.json');
const require = createRequire(import.meta.url);

/**
 * Each case gives one snippet per runtime. JS snippets are function bodies
 * that return a value; Python snippets are expressions evaluated after the
 * imports below; SQL snippets are a single SELECT expression.
 */
export const CASES = [
  {
    id: 'parse-leap',
    title: 'Parse the 2016 leap second',
    input: '2016-12-31T23:59:60Z',
    snippets: {
      date: "return new Date('2016-12-31T23:59:60Z').toISOString()",
      temporal: "return Temporal.Instant.from('2016-12-31T23:59:60Z').toString()",
      python: "datetime.fromisoformat('2016-12-31T23:59:60+00:00').isoformat()",
      postgres: "'2016-12-31 23:59:60+00'::timestamptz",
    },
  },
  {
    id: 'parse-leap-frac',
    title: 'Half a second into the leap second',
    input: '2016-12-31T23:59:60.500Z',
    snippets: {
      date: "return new Date('2016-12-31T23:59:60.500Z').toISOString()",
      temporal: "return Temporal.Instant.from('2016-12-31T23:59:60.500Z').toString()",
      python: "datetime.strptime('2016-12-31T23:59:60.500', '%Y-%m-%dT%H:%M:%S.%f').isoformat()",
      postgres: "'2016-12-31 23:59:60.5+00'::timestamptz",
    },
  },
  {
    id: 'unix-of-leap',
    title: 'Unix seconds for 23:59:60',
    input: '2016-12-31T23:59:60Z',
    snippets: {
      date: "return Date.UTC(2016, 11, 31, 23, 59, 60) / 1000",
      temporal: "return Temporal.Instant.from('2016-12-31T23:59:60Z').epochSeconds",
      python: "calendar.timegm(time.strptime('2016-12-31 23:59:60', '%Y-%m-%d %H:%M:%S'))",
      postgres: "extract(epoch from '2016-12-31 23:59:60+00'::timestamptz)",
    },
  },
  {
    id: 'fake-leap',
    title: 'A :60 that never happened',
    input: '2017-06-30T23:59:60Z',
    snippets: {
      date: "return new Date('2017-06-30T23:59:60Z').toISOString()",
      temporal: "return Temporal.Instant.from('2017-06-30T23:59:60Z').toString()",
      python: "calendar.timegm(time.strptime('2017-06-30 23:59:60', '%Y-%m-%d %H:%M:%S'))",
      postgres: "'2017-06-30 23:59:60+00'::timestamptz",
    },
  },
  {
    id: 'duration-across',
    title: 'Seconds from 23:59:59 to midnight',
    input: '2016-12-31T23:59:59Z → 2017-01-01T00:00:00Z',
    truth: { from: '2016-12-31T23:59:59Z', to: '2017-01-01T00:00:00Z' },
    snippets: {
      date: "return (Date.parse('2017-01-01T00:00:00Z') - Date.parse('2016-12-31T23:59:59Z')) / 1000",
      temporal: "return Temporal.Instant.from('2016-12-31T23:59:59Z').until(Temporal.Instant.from('2017-01-01T00:00:00Z')).total('seconds')",
      python: "(datetime(2017, 1, 1, tzinfo=timezone.utc) - datetime(2016, 12, 31, 23, 59, 59, tzinfo=timezone.utc)).total_seconds()",
      postgres: "extract(epoch from '2017-01-01 00:00:00+00'::timestamptz - '2016-12-31 23:59:59+00'::timestamptz)",
    },
  },
  {
    id: 'duration-year',
    title: 'Seconds in 2016',
    input: '2016-01-01T00:00:00Z → 2017-01-01T00:00:00Z',
    truth: { from: '2016-01-01T00:00:00Z', to: '2017-01-01T00:00:00Z' },
    snippets: {
      date: "return (Date.parse('2017-01-01T00:00:00Z') - Date.parse('2016-01-01T00:00:00Z')) / 1000",
      temporal: "return Temporal.Instant.from('2016-01-01T00:00:00Z').until(Temporal.Instant.from('2017-01-01T00:00:00Z')).total('seconds')",
      python: "(datetime(2017, 1, 1, tzinfo=timezone.utc) - datetime(2016, 1, 1, tzinfo=timezone.utc)).total_seconds()",
      postgres: "extract(epoch from '2017-01-01 00:00:00+00'::timestamptz - '2016-01-01 00:00:00+00'::timestamptz)",
    },
  },
  {
    id: 'add-day',
    title: 'Add 86,400 seconds across the leap',
    input: '2016-12-31T12:00:00Z + 86400 s',
    snippets: {
      date: "return new Date(Date.parse('2016-12-31T12:00:00Z') + 86400 * 1000).toISOString()",
      temporal: "return Temporal.Instant.from('2016-12-31T12:00:00Z').add({ seconds: 86400 }).toString()",
      python: "(datetime(2016, 12, 31, 12, tzinfo=timezone.utc) + timedelta(seconds=86400)).isoformat()",
      postgres: "'2016-12-31 12:00:00+00'::timestamptz + interval '86400 seconds'",
    },
  },
  {
    id: 'neg-label',
    title: 'Hypothetical negative leap: 23:59:59 is removed',
    input: '2029-12-31T23:59:59Z (if 2029-12-31 had a negative leap second)',
    snippets: {
      date: "return new Date('2029-12-31T23:59:59Z').toISOString()",
      temporal: "return Temporal.Instant.from('2029-12-31T23:59:59Z').toString()",
      python: "datetime.fromisoformat('2029-12-31T23:59:59+00:00').isoformat()",
      postgres: "'2029-12-31 23:59:59+00'::timestamptz",
    },
  },
  {
    id: 'neg-duration',
    title: 'Hypothetical negative leap: 23:59:58 to midnight',
    input: '2029-12-31T23:59:58Z → 2030-01-01T00:00:00Z',
    truth: { from: '2029-12-31T23:59:58Z', to: '2030-01-01T00:00:00Z', negative: '2029-12-31' },
    snippets: {
      date: "return (Date.parse('2030-01-01T00:00:00Z') - Date.parse('2029-12-31T23:59:58Z')) / 1000",
      temporal: "return Temporal.Instant.from('2029-12-31T23:59:58Z').until(Temporal.Instant.from('2030-01-01T00:00:00Z')).total('seconds')",
      python: "(datetime(2030, 1, 1, tzinfo=timezone.utc) - datetime(2029, 12, 31, 23, 59, 58, tzinfo=timezone.utc)).total_seconds()",
      postgres: "extract(epoch from '2030-01-01 00:00:00+00'::timestamptz - '2029-12-31 23:59:58+00'::timestamptz)",
    },
  },
  {
    id: 'sort-strings',
    title: 'Sort parsed timestamps around the leap',
    input: "['2017-01-01T00:00:00Z', '2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z']",
    snippets: {
      date: "return ['2017-01-01T00:00:00Z', '2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z'].map((s) => [s, Date.parse(s) / 1000]).sort((a, b) => a[1] - b[1]).map((p) => p[0] + ' = ' + p[1]).join(', ')",
      temporal: "return ['2017-01-01T00:00:00Z', '2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z'].map((s) => [s, Temporal.Instant.from(s)]).sort((a, b) => Temporal.Instant.compare(a[1], b[1])).map((p) => p[0] + ' = ' + p[1].epochSeconds).join(', ')",
      python: "', '.join(s + ' = ' + str(k) for k, s in sorted([(calendar.timegm(time.strptime(s, '%Y-%m-%dT%H:%M:%SZ')), s) for s in ['2017-01-01T00:00:00Z', '2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z']], key=lambda p: p[0]))",
      postgres: "(select string_agg(s || ' = ' || extract(epoch from s::timestamptz)::bigint, ', ' order by s::timestamptz) from unnest(array['2017-01-01T00:00:00Z', '2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z']) with ordinality as t(s, i))",
    },
  },
];

function show(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  return JSON.stringify(v);
}

function runJs(body) {
  try {
    const fn = new Function('Temporal', body);
    return { ok: true, output: show(fn(Temporal)) };
  } catch (err) {
    return { ok: false, output: `${err.name}: ${err.message}` };
  }
}

function runPython(cases) {
  const prog = [
    'import calendar, json, sys, time',
    'from datetime import datetime, timedelta, timezone',
    'out = {}',
    ...cases.map(
      (c) =>
        `try:\n    out[${JSON.stringify(c.id)}] = {"ok": True, "output": str(${c.snippets.python})}\nexcept Exception as e:\n    out[${JSON.stringify(c.id)}] = {"ok": False, "output": type(e).__name__ + ": " + str(e)}`,
    ),
    'print(json.dumps(out))',
  ].join('\n');
  const version = execFileSync('python3', ['-c', 'import sys; print(sys.version.split()[0])']).toString().trim();
  const res = JSON.parse(execFileSync('python3', ['-I', '-c', prog]).toString());
  return { version: `CPython ${version}`, res };
}

function runPostgres(cases) {
  const cmd = (process.env.PSQL ?? 'psql').split(/\s+/);
  const base = [...cmd.slice(1), '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=0', '-c'];
  const sql = (q) => {
    try {
      return { ok: true, output: execFileSync(cmd[0], [...base, `set timezone = 'UTC'; select ${q};`], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n').pop() };
    } catch (err) {
      const msg = (err.stderr?.toString() ?? String(err)).trim().split('\n')[0];
      return { ok: false, output: msg.replace(/^ERROR:\s*/, 'ERROR: ') };
    }
  };
  const version = sql('version()');
  if (!version.ok) throw new Error(`Postgres not reachable: ${version.output}`);
  const res = {};
  for (const c of cases) res[c.id] = sql(c.snippets.postgres);
  return { version: version.output.split(' on ')[0], res };
}

function main() {
  const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
  const temporalVersion = JSON.parse(readFileSync(join(dirname(require.resolve('@js-temporal/polyfill')), '..', 'package.json'), 'utf8')).version;
  const runtimes = {
    date: `Node.js ${process.version} Date`,
    temporal: `@js-temporal/polyfill ${temporalVersion} on Node.js ${process.version}`,
    python: '',
    postgres: previous?.runtimes?.postgres ?? '',
  };
  const results = Object.fromEntries(CASES.map((c) => [c.id, {}]));
  for (const c of CASES) {
    results[c.id].date = runJs(c.snippets.date);
    results[c.id].temporal = runJs(c.snippets.temporal);
  }
  const py = runPython(CASES);
  runtimes.python = py.version;
  for (const c of CASES) results[c.id].python = py.res[c.id];
  try {
    const pg = runPostgres(CASES);
    runtimes.postgres = pg.version;
    for (const c of CASES) results[c.id].postgres = pg.res[c.id];
  } catch (err) {
    console.warn(String(err.message ?? err), '— keeping previous Postgres results');
    for (const c of CASES) {
      const old = previous?.cases?.find((p) => p.id === c.id)?.results?.postgres;
      if (old) results[c.id].postgres = old;
    }
  }
  const data = {
    recordedOn: new Date().toISOString().slice(0, 10),
    runtimes,
    cases: CASES.map((c) => ({ ...c, results: results[c.id] })),
  };
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${outPath}`);
  for (const c of data.cases) {
    console.log(`\n${c.id}: ${c.input}`);
    for (const [k, v] of Object.entries(c.results)) console.log(`  ${k.padEnd(9)} ${v.ok ? '' : '✗ '}${v.output}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
