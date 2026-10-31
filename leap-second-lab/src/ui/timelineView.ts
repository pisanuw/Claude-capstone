import {
  HISTORICAL_LEAPS,
  type LeapEntry,
  buildTable,
  formatLabel,
  formatPosix,
  gpsFromTai,
  insertedLeapAt,
  labelToTai,
  offsetAt,
  parseLabel,
  posixStep,
  validateLabel,
} from '../core/leaps';
import { DEFAULT_MODEL, type Ut1Model, leapsAvoided, ut1MinusUtc, yearOfPosix, yearsUntil } from '../core/ut1';
import { clear, field, h, numberInput } from './dom';
import { lineChart } from './chart';

function posixOfYear(year: number): number {
  const y = Math.floor(year);
  const a = Date.UTC(y, 0, 1) / 1000;
  const b = Date.UTC(y + 1, 0, 1) / 1000;
  return a + (year - y) * (b - a);
}

function offsetAtPosix(posix: number, table: readonly LeapEntry[]): number {
  let off = table.length ? table[0].before : 10;
  for (const e of table) {
    if (posix >= e.nextMidnight) off = e.after;
    else break;
  }
  return off;
}

function cutoverLabel(year: number): string {
  return formatPosix(Math.round(posixOfYear(year)), 0).slice(0, 10);
}

export function timelineView(): HTMLElement {
  const model: Ut1Model = { ...DEFAULT_MODEL };
  let negative = false;
  let negativeDate = '2029-12-31';
  let table: LeapEntry[] = buildTable(HISTORICAL_LEAPS);

  const rebuildTable = (): string | null => {
    try {
      table = buildTable(negative ? [...HISTORICAL_LEAPS, { date: negativeDate, sign: -1 }] : HISTORICAL_LEAPS);
      return null;
    } catch (err) {
      table = buildTable(HISTORICAL_LEAPS);
      return err instanceof Error ? err.message : String(err);
    }
  };

  const series = () => [
    { name: 'TAI − UTC', color: 'var(--c-tai)', step: true, fn: (x: number) => offsetAtPosix(posixOfYear(x), table) },
    { name: 'GPS − UTC', color: 'var(--c-gps)', step: true, fn: (x: number) => (x < 1980.0137 ? null : offsetAtPosix(posixOfYear(x), table) - 19) },
    { name: 'UT1 − UTC (schematic, then projected)', color: 'var(--c-ut1)', fn: (x: number) => ut1MinusUtc(model, x, table.filter((e) => e.sign === 1)) },
    { name: 'Unix − UTC (0, but cannot name 23:59:60)', color: 'var(--c-unix)', dash: '5 4', fn: () => 0 },
  ];

  const rangeText = h('span', { class: 'muted' });
  const chart = lineChart(series(), {
    xMin: 1972,
    xMax: 2040,
    xLimit: [1972, 6000],
    minSpan: 0.5,
    yLabel: 'seconds ahead of UTC',
    xFormat: (x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1)),
    markers: () => [
      ...table.map((e) => ({ x: yearOfPosix(e.nextMidnight), label: `${e.sign > 0 ? 'Inserted' : 'Removed'} leap second at the end of ${e.date}` })),
      { x: model.cutoverYear, label: `Continuous UTC from ${cutoverLabel(model.cutoverYear)}` },
    ],
    band: { from: -0.9, to: 0.9, label: '|UT1 − UTC| < 0.9 s, the leap-second rule' },
    onRange: (a, b) => { rangeText.textContent = `Showing ${a.toFixed(1)} – ${b.toFixed(1)}`; },
  });

  const presets: [string, number, number][] = [
    ['1972 → 2040', 1972, 2040],
    ['2015 → 2018', 2015, 2018],
    ['Next 200 years', 2020, 2230],
    ['Next 2,000 years', 2020, 4100],
  ];
  const presetBar = h('div', { class: 'button-row' }, ...presets.map(([label, a, b]) => h('button', { type: 'button', class: 'small', onclick: () => chart.setRange(a, b) }, label)), rangeText);

  const readouts = h('div', { class: 'readouts' });
  const negError = h('p', { class: 'error', role: 'alert' });
  const refresh = () => {
    negError.textContent = rebuildTable() ?? '';
    chart.setSeries(series());
    clear(readouts);
    const minute = yearsUntil(model, 60);
    const hour = yearsUntil(model, 3600);
    readouts.append(
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, '|UT1 − UTC| reaches 1 minute in'), h('strong', {}, fmtYearsFrom(minute))),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, '|UT1 − UTC| reaches 1 hour in'), h('strong', {}, fmtYearsFrom(hour))),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Leap seconds the old rule would have needed by 2100'), h('strong', {}, String(leapsAvoided(model, 2100)))),
    );
    converter.update();
  };
  const fmtYearsFrom = (t: number | null) => (t === null ? 'not within 10,000 years' : `about ${Math.round(t).toLocaleString('en-US')} years (≈ ${Math.round(model.cutoverYear + t)})`);

  const cutoverInput = h('input', { type: 'date', value: cutoverLabel(model.cutoverYear), min: '2017-01-02', max: '2100-12-31' });
  cutoverInput.addEventListener('change', () => {
    if (!cutoverInput.value) return;
    const [y, m, d] = cutoverInput.value.split('-').map(Number);
    model.cutoverYear = yearOfPosix(Date.UTC(y, m - 1, d) / 1000);
    refresh();
  });
  const negToggle = h('input', { type: 'checkbox' });
  const negDate = h('input', { type: 'date', value: negativeDate, min: '2017-01-31' });
  negToggle.addEventListener('change', () => { negative = negToggle.checked; refresh(); });
  negDate.addEventListener('change', () => { if (negDate.value) { negativeDate = negDate.value; refresh(); } });

  const controls = h(
    'div',
    { class: 'controls' },
    field('Leap seconds stop (continuous UTC) on', cutoverInput, 'Default 20 May 2027, the date in the idea brief. The 2022 CGPM resolution only set "by or before 2035"; change it.'),
    field('Excess length of day at cutover (ms/day)', numberInput(model.lodExcessMs, 0.1, (v) => { model.lodExcessMs = v; refresh(); }), 'Positive: the Earth turns slower than 86,400 SI s. Negative: faster (what made a negative leap second plausible).'),
    field('Growth of the excess (ms/day per century)', numberInput(model.trendMsPerCentury, 0.1, (v) => { model.trendMsPerCentury = v; refresh(); }), 'Tidal braking is often quoted near +1.7 ms/day per century; treat it as a knob.'),
    field('UT1 − UTC at the cutover (s)', numberInput(model.startValue, 0.1, (v) => { model.startValue = v; refresh(); }, { min: -0.9, max: 0.9 })),
    h('label', { class: 'field check' }, negToggle, h('span', {}, 'Add a hypothetical negative leap second at the end of '), negDate),
    negError,
  );

  const converter = converterPanel(() => table, () => model);

  const leapList = h(
    'details',
    { class: 'leap-table' },
    h('summary', {}, 'The 27 leap seconds (1972–2016)'),
    h(
      'ol',
      {},
      ...buildTable(HISTORICAL_LEAPS).map((e) => h('li', {}, h('code', {}, `${e.date} 23:59:60`), ` → TAI − UTC = ${e.after} s`)),
    ),
    h('p', { class: 'muted' }, 'TAI − UTC was 10 s on 1 January 1972, when UTC switched to whole-second steps. No leap second has been inserted since 2016-12-31.'),
  );

  refresh();
  return h(
    'section',
    { class: 'view' },
    h('h2', {}, 'Time scales since 1972'),
    h(
      'p',
      { class: 'lede' },
      'TAI counts SI seconds without interruption. UTC follows TAI but has been stepped 27 times so it never drifts more than 0.9 s from UT1, the time kept by the Earth\'s rotation. GPS time froze the offset in 1980. Unix time counts UTC days of exactly 86,400 s, so it has no name for 23:59:60. Once leap seconds stop, UT1 − UTC is free to grow.',
    ),
    presetBar,
    chart.root,
    h('p', { class: 'note' }, h('strong', {}, 'Honest scale: '), 'the UT1 line before the cutover is a schematic sawtooth (between +0.5 s and −0.5 s between leap seconds), not IERS measurements. After the cutover it is the quadratic model set by the inputs below.'),
    controls,
    readouts,
    converter.root,
    leapList,
  );
}

function converterPanel(getTable: () => readonly LeapEntry[], getModel: () => Ut1Model) {
  const input = h('input', { type: 'text', value: '2016-12-31T23:59:60.500Z', spellcheck: false, 'aria-label': 'UTC timestamp', class: 'mono' });
  const out = h('dl', { class: 'conversions' });
  const update = () => {
    clear(out);
    const table = getTable();
    const add = (k: string, v: string, note?: string) => out.append(h('dt', {}, k), h('dd', {}, h('code', {}, v), note ? h('small', {}, ' ' + note) : null));
    let label;
    try {
      label = parseLabel(input.value);
    } catch (err) {
      out.append(h('dd', { class: 'error' }, err instanceof Error ? err.message : String(err)));
      return;
    }
    const reason = validateLabel(label, table);
    if (reason) {
      out.append(h('dd', { class: 'error' }, reason));
      return;
    }
    const tai = labelToTai(label, table);
    const gps = gpsFromTai(tai);
    const step = posixStep(tai, table);
    const inLeap = insertedLeapAt(tai, table);
    const year = yearOfPosix(step);
    add('UTC', formatLabel(label) + 'Z');
    add('TAI', formatPosix(tai) + ' TAI', `(TAI − UTC = ${offsetAt(tai, table)} s)`);
    if (year >= 1980.0137) add('GPS', `week ${gps.week}, ${gps.tow.toFixed(3)} s`, `reads ${gps.label} GPS`);
    add('Unix (stepping kernel)', step.toFixed(3), inLeap ? '— the same value it showed one second earlier' : '');
    const dut1 = ut1MinusUtc(getModel(), year, table.filter((e) => e.sign === 1));
    add('UT1 − UTC', `${dut1 >= 0 ? '+' : ''}${dut1.toFixed(3)} s`, year < getModel().cutoverYear ? '(schematic)' : '(projected)');
  };
  input.addEventListener('input', update);
  const preset = (label: string, value: string) => h('button', { type: 'button', class: 'small', onclick: () => { input.value = value; update(); } }, label);
  const root = h(
    'div',
    { class: 'card' },
    h('h3', {}, 'Convert an instant'),
    h('div', { class: 'button-row' }, input),
    h(
      'div',
      { class: 'button-row' },
      preset('Inside the 2016 leap second', '2016-12-31T23:59:60.500Z'),
      preset('A :60 that never happened', '2017-06-30T23:59:60Z'),
      preset('GPS epoch', '1980-01-06T00:00:00Z'),
      preset('Now', new Date().toISOString()),
      preset('Year 2300', '2300-01-01T00:00:00Z'),
    ),
    out,
  );
  return { root, update };
}
