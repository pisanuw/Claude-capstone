import { describe, it, expect, vi } from 'vitest';
import { scan, ApiError } from '../src/lib/api.js';
import { profileMeta, scoreBand, SEVERITY_META } from '../src/lib/profiles.js';
import type { Report } from '../src/lib/types.js';

const fakeReport: Partial<Report> = { url: 'https://x.com', issues: [], score: 100 };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('scan', () => {
  it('returns the parsed report on success', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fakeReport)) as unknown as typeof fetch;
    const report = await scan('https://x.com', fetchImpl);
    expect(report.url).toBe('https://x.com');
  });

  it('throws ApiError with the server message on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'bad url' }, false, 422),
    ) as unknown as typeof fetch;
    await expect(scan('nope', fetchImpl)).rejects.toThrow(ApiError);
    await expect(scan('nope', fetchImpl)).rejects.toThrow('bad url');
  });

  it('throws a friendly ApiError when the network is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(scan('https://x.com', fetchImpl)).rejects.toThrow(/reach the server/);
  });

  it('falls back to a generic message when the error body is unparseable', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;
    await expect(scan('https://x.com', fetchImpl)).rejects.toThrow(/HTTP 500/);
  });
});

describe('profile metadata', () => {
  it('resolves known profiles', () => {
    expect(profileMeta('screen-reader').label).toBe('Screen reader');
  });

  it('maps every severity to display metadata', () => {
    expect(SEVERITY_META.critical.label).toBe('Critical');
    expect(SEVERITY_META.minor.order).toBe(3);
  });
});

describe('scoreBand', () => {
  it('bands scores into qualitative labels', () => {
    expect(scoreBand(95).label).toBe('Strong');
    expect(scoreBand(75).label).toBe('Fair');
    expect(scoreBand(55).label).toBe('Weak');
    expect(scoreBand(20).label).toBe('Failing');
  });
});
