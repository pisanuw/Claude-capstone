import type { Entry, Phases } from '../src/core/types';

let counter = 0;

export function resetCounter(): void {
  counter = 0;
}

export type EntrySpec = Partial<Omit<Entry, 'phases'>> & { phases?: Partial<Phases> };

/** Build a normalized Entry with sensible defaults; override what the test cares about. */
export function makeEntry(overrides: EntrySpec = {}): Entry {
  const phases: Phases = {
    blocked: 0,
    dns: 0,
    connect: 0,
    ssl: 0,
    send: 1,
    wait: 40,
    receive: 9,
    ...(overrides.phases ?? {}),
  };
  const url = overrides.url ?? `https://app.test/resource-${counter}`;
  const u = new URL(url);
  const entry: Entry = {
    index: counter,
    url,
    origin: u.origin,
    path: u.pathname,
    method: 'GET',
    status: 200,
    statusText: 'OK',
    httpVersion: 'http/2.0',
    mimeType: 'application/json',
    type: 'xhr',
    start: counter * 10,
    time: 50,
    transferSize: 1000,
    bodySize: 1000,
    requestHeaders: {},
    responseHeaders: {},
    redirectURL: '',
    fromCache: false,
    pageref: null,
    ...overrides,
    phases,
  };
  counter++;
  return entry;
}

/** Build several entries at once. */
export function makeEntries(specs: EntrySpec[]): Entry[] {
  resetCounter();
  return specs.map((s) => makeEntry(s));
}
