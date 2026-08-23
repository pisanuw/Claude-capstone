import { describe, expect, it } from 'vitest';
import { formatBytes, formatMs, shortPath } from '../src/core/format';

describe('formatBytes', () => {
  it('picks sensible units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3_500_000)).toBe('3.34 MB');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('formatMs', () => {
  it('switches to seconds at 1000ms', () => {
    expect(formatMs(0)).toBe('0 ms');
    expect(formatMs(999)).toBe('999 ms');
    expect(formatMs(1500)).toBe('1.50 s');
    expect(formatMs(-1)).toBe('0 ms');
  });
});

describe('shortPath', () => {
  it('keeps short paths and trims long ones at a segment boundary', () => {
    expect(shortPath('/api/users')).toBe('/api/users');
    const long = '/very/long/path/with/many/segments/deeply/nested/resource.json';
    const short = shortPath(long, 30);
    expect(short.length).toBeLessThanOrEqual(30);
    expect(short.startsWith('…')).toBe(true);
    expect(short).toContain('resource.json');
  });
});
