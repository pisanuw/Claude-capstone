import { describe, expect, it } from 'vitest';
import {
  daysToDrift,
  formatDuration,
  formatError,
  formatSecondsPerDay,
  rateError,
  secondsPerDay,
  turnsAhead,
} from '../src/core/drift';
import { cutSheet } from '../src/core/cutfile';
import { parseExpression } from '../src/core/expr';
import { DEFAULT_LIMITS, PRESETS } from '../src/core/presets';
import { validateLimits } from '../src/core/search';
import { DEFAULT_MODULE, decodeState, decodeTrain, encodeState, encodeTrain } from '../src/core/share';

describe('drift', () => {
  it('a train with too large a reduction runs slow', () => {
    const t = { error: 1e-5 };
    expect(rateError(t)).toBeCloseTo(-1e-5, 9);
    expect(secondsPerDay(t)).toBeCloseTo(-0.864, 4);
    expect(daysToDrift(t, 60)).toBeCloseTo(60 / 0.864, 2);
    expect(turnsAhead(t, 1e5)).toBeCloseTo(-1, 4);
  });

  it('an exact train never drifts', () => {
    expect(daysToDrift({ error: 0 }, 1)).toBe(Infinity);
    expect(turnsAhead({ error: 0 }, 1e9)).toBe(0);
  });

  it('formats durations', () => {
    expect(formatDuration(Infinity)).toBe('never');
    expect(formatDuration(0.0001)).toBe('1 min');
    expect(formatDuration(0.5)).toBe('12.0 h');
    expect(formatDuration(3.25)).toBe('3.3 days');
    expect(formatDuration(200)).toBe('200 days');
    expect(formatDuration(3652.5)).toBe('10.0 years');
    expect(formatDuration(365.25 * 1234)).toBe('1,234 years');
    expect(formatDuration(365.25 * 1e6)).toBe('1.0e+6 years');
  });

  it('formats errors and rates', () => {
    expect(formatError(0)).toBe('exact');
    expect(formatError(0.0123)).toBe('+1.23%');
    expect(formatError(-2.5e-5)).toBe('−25.0 ppm');
    expect(formatError(3e-9)).toBe('+3.00 ppb');
    expect(formatSecondsPerDay(0)).toBe('0 s/day');
    expect(formatSecondsPerDay(-236)).toBe('loses 3.93 min/day');
    expect(formatSecondsPerDay(0.5)).toBe('gains 0.500 s/day');
    expect(formatSecondsPerDay(-0.0002)).toBe('loses 0.200 ms/day');
  });
});

describe('share links', () => {
  const state = {
    target: '365.2422/366.2422',
    limits: { minTeeth: 10, maxTeeth: 100, maxStages: 2 },
    module: 1.5,
    train: [
      { driver: 51, driven: 49 },
      { driver: 79, driven: 82 },
    ],
  };

  it('round-trips', () => {
    const hash = encodeState(state);
    expect(hash).toContain('train=51x49.79x82');
    expect(decodeState(`#${hash}`)).toEqual(state);
    expect(decodeState(encodeState({ ...state, train: null }))?.train).toBeNull();
  });

  it('falls back to defaults on junk', () => {
    expect(decodeState('#nothing=1')).toBeNull();
    expect(decodeState('#t=12&min=abc&max=-3&s=1.5&m=999&train=8x96;evil')).toEqual({
      target: '12',
      limits: { ...DEFAULT_LIMITS },
      module: DEFAULT_MODULE,
      train: null,
    });
    expect(decodeState('#t=' + 'x'.repeat(500))?.target).toHaveLength(200);
  });

  it('encodes trains compactly', () => {
    expect(encodeTrain([{ driver: 8, driven: 96 }])).toBe('8x96');
    expect(decodeTrain('8x96')).toEqual([{ driver: 8, driven: 96 }]);
    expect(decodeTrain('8x')).toBeNull();
  });
});

describe('cut sheet', () => {
  it('lays every gear out in a row with cut and engrave layers', () => {
    const svg = cutSheet(
      [
        { driver: 8, driven: 24 },
        { driver: 10, driven: 40 },
      ],
      { module: 2, bore: 5, gap: 5 },
    );
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(4);
    expect(svg.match(/<circle /g)).toHaveLength(4);
    expect(svg).toContain('S2 driven 40T');
    // Width: gaps plus diameters of 8, 24, 10 and 40 teeth at module 2 (outer = m(T+2)).
    const width = 5 + (20 + 5) + (52 + 5) + (24 + 5) + (84 + 5);
    expect(svg).toContain(`width="${width.toFixed(3)}mm"`);
  });
});

describe('presets', () => {
  it('parse, have valid limits and unique ids', () => {
    const ids = new Set<string>();
    for (const p of PRESETS) {
      const r = parseExpression(p.target);
      expect(r.ok, p.id).toBe(true);
      expect(validateLimits({ ...DEFAULT_LIMITS, ...p.limits }), p.id).toBeNull();
      ids.add(p.id);
    }
    expect(ids.size).toBe(PRESETS.length);
  });
});
