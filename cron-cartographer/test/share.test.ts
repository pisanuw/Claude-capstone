import { describe, expect, it } from 'vitest';
import { DEFAULT_HORIZON, decodeShare, encodeShare } from '../src/core/share.js';

describe('share links', () => {
  it('round-trips a full state', () => {
    const state = {
      input: '15 4 * * 1-5',
      scheduleZone: 'UTC',
      displayZone: 'America/Los_Angeles',
      horizonDays: 365 as const,
    };
    expect(decodeShare(encodeShare(state), 'Europe/Berlin')).toEqual(state);
  });

  it('omits redundant params and restores them as defaults', () => {
    const qs = encodeShare({
      input: '@daily',
      scheduleZone: 'UTC',
      displayZone: 'UTC',
      horizonDays: DEFAULT_HORIZON,
    });
    expect(qs).not.toContain('view=');
    expect(qs).not.toContain('days=');
    expect(decodeShare(qs, 'America/New_York')).toEqual({
      input: '@daily',
      scheduleZone: 'UTC',
      displayZone: 'UTC',
      horizonDays: DEFAULT_HORIZON,
    });
  });

  it('survives a leading "?" and URL-encoded input', () => {
    const qs = encodeShare({
      input: 'every weekday at 4:15am',
      scheduleZone: 'America/New_York',
      displayZone: 'America/New_York',
      horizonDays: 30,
    });
    const state = decodeShare(`?${qs}`, 'UTC');
    expect(state?.input).toBe('every weekday at 4:15am');
    expect(state?.horizonDays).toBe(30);
    expect(state?.scheduleZone).toBe('America/New_York');
  });

  it('falls back safely on missing or bogus values', () => {
    expect(decodeShare('', 'UTC')).toBeNull();
    expect(decodeShare('q=', 'UTC')).toBeNull();
    const state = decodeShare('q=%40daily&tz=Not%2FAZone&view=Also%2FBogus&days=17', 'Asia/Tokyo');
    expect(state).toEqual({
      input: '@daily',
      scheduleZone: 'Asia/Tokyo',
      displayZone: 'Asia/Tokyo',
      horizonDays: DEFAULT_HORIZON,
    });
  });

  it('truncates absurdly long inputs', () => {
    const state = decodeShare(`q=${'x'.repeat(5000)}`, 'UTC');
    expect(state?.input.length).toBe(2000);
  });
});
