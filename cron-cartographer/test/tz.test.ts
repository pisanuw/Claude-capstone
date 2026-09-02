import { describe, expect, it } from 'vitest';
import {
  buildOffsetTable,
  isValidZone,
  listTimeZones,
  localZone,
  offsetAt,
  probeOffset,
  utcMsToWall,
  wallToUtcMs,
} from '../src/core/tz.js';

// US DST in 2026: spring forward Sunday March 8 (2:00 -> 3:00 local),
// fall back Sunday November 1 (2:00 -> 1:00 local).
const MAR = Date.UTC(2026, 2, 1);
const APR = Date.UTC(2026, 3, 1);
const OCT_MID = Date.UTC(2026, 9, 15);
const NOV_MID = Date.UTC(2026, 10, 15);

describe('probeOffset', () => {
  it('is 0 for UTC and fixed for zones without DST', () => {
    expect(probeOffset('UTC', Date.now())).toBe(0);
    expect(probeOffset('Asia/Tokyo', MAR)).toBe(540);
    expect(probeOffset('Asia/Kolkata', MAR)).toBe(330); // half-hour zone
  });

  it('sees PST vs PDT on either side of the spring transition', () => {
    expect(probeOffset('America/Los_Angeles', MAR)).toBe(-480);
    expect(probeOffset('America/Los_Angeles', APR)).toBe(-420);
  });
});

describe('buildOffsetTable / offsetAt', () => {
  it('finds the exact spring-forward transition instant', () => {
    const table = buildOffsetTable('America/Los_Angeles', MAR, APR);
    // 2026-03-08 02:00 PST == 2026-03-08T10:00:00Z.
    const transition = Date.UTC(2026, 2, 8, 10, 0);
    expect(offsetAt(table, transition - 60000)).toBe(-480);
    expect(offsetAt(table, transition)).toBe(-420);
  });

  it('finds the exact fall-back transition instant', () => {
    const table = buildOffsetTable('America/Los_Angeles', OCT_MID, NOV_MID);
    // 2026-11-01 02:00 PDT == 2026-11-01T09:00:00Z.
    const transition = Date.UTC(2026, 10, 1, 9, 0);
    expect(offsetAt(table, transition - 60000)).toBe(-420);
    expect(offsetAt(table, transition)).toBe(-480);
  });

  it('produces a single entry for a fixed-offset zone', () => {
    const table = buildOffsetTable('Asia/Tokyo', MAR, APR);
    expect(table.offsetMin).toEqual([540]);
  });
});

describe('wallToUtcMs / utcMsToWall', () => {
  it('round-trips an ordinary wall time', () => {
    const table = buildOffsetTable('America/Los_Angeles', MAR, APR);
    const wall = { year: 2026, month: 3, day: 15, hour: 9, minute: 30 };
    const ms = wallToUtcMs(table, wall);
    expect(ms).not.toBeNull();
    expect(utcMsToWall(table, ms as number)).toEqual(wall);
  });

  it('returns null for a wall time inside the spring-forward gap', () => {
    const table = buildOffsetTable('America/Los_Angeles', MAR, APR);
    expect(wallToUtcMs(table, { year: 2026, month: 3, day: 8, hour: 2, minute: 30 })).toBeNull();
    expect(wallToUtcMs(table, { year: 2026, month: 3, day: 8, hour: 3, minute: 0 })).toBe(
      Date.UTC(2026, 2, 8, 10, 0),
    );
  });

  it('resolves ambiguous fall-back wall times to the earlier instant', () => {
    const table = buildOffsetTable('America/Los_Angeles', OCT_MID, NOV_MID);
    // 01:30 happens twice on 2026-11-01; the PDT (earlier) reading wins.
    expect(wallToUtcMs(table, { year: 2026, month: 11, day: 1, hour: 1, minute: 30 })).toBe(
      Date.UTC(2026, 10, 1, 8, 30),
    );
  });

  it('handles UTC as an identity mapping', () => {
    const table = buildOffsetTable('UTC', MAR, APR);
    const wall = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };
    expect(wallToUtcMs(table, wall)).toBe(Date.UTC(2026, 2, 8, 2, 30));
  });
});

describe('zone helpers', () => {
  it('validates zone names', () => {
    expect(isValidZone('America/Los_Angeles')).toBe(true);
    expect(isValidZone('Not/AZone')).toBe(false);
  });

  it('lists zones including UTC and reports a local zone', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones.length).toBeGreaterThan(100);
    expect(typeof localZone()).toBe('string');
    expect(localZone().length).toBeGreaterThan(0);
  });
});
