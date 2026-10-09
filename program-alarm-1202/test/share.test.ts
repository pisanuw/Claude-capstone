import { describe, expect, it } from 'vitest';
import { APOLLO_11_TIMELINE } from '../src/core/apollo';
import { clampSteal, decodeShare, encodeShare } from '../src/core/share';

describe('share links', () => {
  it('round-trips settings', () => {
    const st = { config: { scheduler: 'round-robin' as const, stealPct: 22, monitorOn: false }, tab: 'compare' as const };
    expect(decodeShare(encodeShare(st))).toEqual(st);
    expect(encodeShare(st)).toBe('#s=round-robin&steal=22&mon=0&tab=compare');
  });

  it('falls back to defaults on junk', () => {
    expect(decodeShare('#s=evil&steal=abc&tab=zzz')).toEqual({
      config: { scheduler: 'agc', stealPct: 15, monitorOn: true },
      tab: 'fly',
    });
    expect(decodeShare('')).toEqual(decodeShare('#'));
  });

  it('clamps steal into range', () => {
    expect(clampSteal(99)).toBe(30);
    expect(clampSteal(-3)).toBe(0);
    expect(clampSteal(12.6)).toBe(13);
    expect(clampSteal(Number.NaN)).toBe(15);
    expect(decodeShare('#steal=80').config.stealPct).toBe(30);
  });
});

describe('Apollo 11 timeline', () => {
  it('is in time order and reports both alarm codes', () => {
    const gets = APOLLO_11_TIMELINE.map((e) => e.get);
    expect([...gets].sort()).toEqual(gets);
    const codes = new Set(APOLLO_11_TIMELINE.map((e) => e.alarm).filter(Boolean));
    expect(codes).toEqual(new Set([1201, 1202]));
  });
});
