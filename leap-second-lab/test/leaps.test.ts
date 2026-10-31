import { describe, expect, it } from 'vitest';
import {
  BASE_OFFSET,
  GPS_EPOCH_TAI,
  HISTORICAL_LEAPS,
  HISTORICAL_TABLE,
  buildTable,
  elapsedBetween,
  findLeap,
  formatLabel,
  formatPosix,
  formatTai,
  gpsFromTai,
  insertedLeapAt,
  labelToTai,
  leapsBetween,
  offsetAt,
  parseDate,
  parseLabel,
  parseToTai,
  posixStep,
  taiToLabel,
  validateLabel,
  withExtraLeap,
} from '../src/core/leaps';

describe('leap table', () => {
  it('has 27 leap seconds ending at TAI − UTC = 37', () => {
    expect(HISTORICAL_LEAPS).toHaveLength(27);
    expect(HISTORICAL_TABLE[0].before).toBe(BASE_OFFSET);
    expect(HISTORICAL_TABLE.at(-1)?.after).toBe(37);
    expect(findLeap(HISTORICAL_TABLE, '2016-12-31')?.nextMidnight).toBe(1483228800);
  });

  it('has TAI − UTC = 19 at the GPS epoch', () => {
    expect(offsetAt(GPS_EPOCH_TAI, HISTORICAL_TABLE)).toBe(19);
  });

  it('rejects bad and duplicate dates', () => {
    expect(() => parseDate('2016-02-30')).toThrow(/No such date/);
    expect(() => parseDate('20161231')).toThrow(/Bad date/);
    expect(() => buildTable([{ date: '2020-01-01', sign: 1 }, { date: '2020-01-01', sign: -1 }])).toThrow(/Two leap/);
  });

  it('sorts input and supports negative leaps', () => {
    const t = withExtraLeap({ date: '2029-12-31', sign: -1 });
    const last = t.at(-1);
    expect(last?.before).toBe(37);
    expect(last?.after).toBe(36);
    const unsorted = buildTable([{ date: '1973-12-31', sign: 1 }, { date: '1972-06-30', sign: 1 }]);
    expect(unsorted.map((e) => e.date)).toEqual(['1972-06-30', '1973-12-31']);
  });
});

describe('labels', () => {
  it('parses and formats, including :60 and fractions', () => {
    const l = parseLabel('2016-12-31T23:59:60.250Z');
    expect(l).toEqual({ y: 2016, mo: 12, d: 31, h: 23, mi: 59, s: 60.25 });
    expect(formatLabel(l)).toBe('2016-12-31T23:59:60.250');
    expect(formatLabel(l, 0)).toBe('2016-12-31T23:59:60');
    expect(parseLabel('2016-12-31 23:59:59 UTC').s).toBe(59);
    expect(formatLabel({ y: 2016, mo: 1, d: 1, h: 0, mi: 0, s: 59.9999 })).toBe('2016-01-01T00:00:59.999');
  });

  it('rejects malformed labels', () => {
    expect(() => parseLabel('yesterday')).toThrow(/Cannot read/);
    expect(() => parseLabel('2016-12-31T24:00:00Z')).toThrow(/Out-of-range/);
    expect(() => parseLabel('2016-12-31T23:59:61Z')).toThrow(/Out-of-range/);
  });

  it('validates :60 against the table', () => {
    expect(validateLabel(parseLabel('2016-12-31T23:59:60Z'), HISTORICAL_TABLE)).toBeNull();
    expect(validateLabel(parseLabel('2017-06-30T23:59:60Z'), HISTORICAL_TABLE)).toMatch(/does not exist/);
    expect(validateLabel(parseLabel('2016-12-31T23:58:60Z'), HISTORICAL_TABLE)).toMatch(/does not exist/);
    const neg = withExtraLeap({ date: '2029-12-31', sign: -1 });
    expect(validateLabel(parseLabel('2029-12-31T23:59:59.5Z'), neg)).toMatch(/removes 23:59:59/);
    expect(validateLabel(parseLabel('2029-12-31T23:59:58.9Z'), neg)).toBeNull();
  });
});

describe('tai conversion', () => {
  it('is continuous across an inserted second', () => {
    const a = parseToTai('2016-12-31T23:59:59Z');
    const b = parseToTai('2016-12-31T23:59:60Z');
    const c = parseToTai('2017-01-01T00:00:00Z');
    expect(b - a).toBe(1);
    expect(c - b).toBe(1);
    expect(formatPosix(c, 0)).toBe('2017-01-01T00:00:37');
  });

  it('round-trips labels through tai', () => {
    for (const s of ['1972-06-30T23:59:60.5Z', '1999-01-01T00:00:00Z', '2016-12-31T23:59:59.999Z', '2024-02-29T12:34:56.789Z']) {
      const l = parseLabel(s);
      expect(formatLabel(taiToLabel(labelToTai(l, HISTORICAL_TABLE), HISTORICAL_TABLE))).toBe(formatLabel(l));
    }
    expect(formatTai(parseToTai('2016-12-31T23:59:60.5Z'), HISTORICAL_TABLE, 1)).toBe('2016-12-31T23:59:60.5');
  });

  it('throws for nonexistent labels', () => {
    expect(() => parseToTai('2017-06-30T23:59:60Z')).toThrow(/does not exist/);
  });

  it('skips the removed second of a negative leap', () => {
    const neg = withExtraLeap({ date: '2029-12-31', sign: -1 });
    const a = parseToTai('2029-12-31T23:59:58Z', neg);
    const b = parseToTai('2030-01-01T00:00:00Z', neg);
    expect(b - a).toBe(1);
    expect(formatTai(a + 0.5, neg)).toBe('2029-12-31T23:59:58.500');
    expect(formatTai(b, neg)).toBe('2030-01-01T00:00:00.000');
    expect(insertedLeapAt(a + 0.5, neg)).toBeUndefined();
  });

  it('counts elapsed SI seconds and leaps between instants', () => {
    expect(elapsedBetween('2016-12-31T23:59:59Z', '2017-01-01T00:00:00Z')).toBe(2);
    expect(elapsedBetween('2016-01-01T00:00:00Z', '2017-01-01T00:00:00Z')).toBe(31622401);
    expect(elapsedBetween('2012-06-30T12:00:00Z', '2015-07-01T12:00:00Z')).toBe(94694402);
    expect(leapsBetween(parseToTai('1972-01-01T00:00:00Z'), parseToTai('2020-01-01T00:00:00Z'), HISTORICAL_TABLE)).toBe(27);
  });

  it('uses the base offset with an empty table', () => {
    expect(offsetAt(0, [])).toBe(BASE_OFFSET);
    expect(labelToTai(parseLabel('2000-01-01T00:00:00Z'), [])).toBe(946684800 + BASE_OFFSET);
  });
});

describe('POSIX step and GPS', () => {
  it('repeats 23:59:59 during the inserted second', () => {
    const leap = parseToTai('2016-12-31T23:59:60.25Z');
    expect(posixStep(leap, HISTORICAL_TABLE)).toBeCloseTo(1483228799.25, 6);
    expect(posixStep(parseToTai('2016-12-31T23:59:59.25Z'), HISTORICAL_TABLE)).toBeCloseTo(1483228799.25, 6);
    expect(posixStep(parseToTai('2017-01-01T00:00:00Z'), HISTORICAL_TABLE)).toBe(1483228800);
  });

  it('computes GPS week and time of week', () => {
    const g0 = gpsFromTai(GPS_EPOCH_TAI);
    expect(g0).toMatchObject({ week: 0, tow: 0, label: '1980-01-06T00:00:00.000' });
    const g = gpsFromTai(parseToTai('2017-01-01T00:00:00Z'));
    expect(g.week).toBe(1930);
    expect(g.label).toBe('2017-01-01T00:00:18.000');
  });
});
