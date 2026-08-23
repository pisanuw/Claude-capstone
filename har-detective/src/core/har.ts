/**
 * HAR parsing: turn the HTTP Archive JSON exported by browser DevTools into a
 * normalized, defensively-validated Entry list. Malformed entries are skipped
 * with a warning instead of failing the whole file, because real-world HARs
 * (extensions, proxies, older browsers) are frequently sloppy.
 */

import type { Entry, ParsedHar, Phases, ResourceType } from './types';

export class HarParseError extends Error {}

interface RawHeader {
  name?: unknown;
  value?: unknown;
}

const PHASE_KEYS = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'] as const;

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function headerMap(raw: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(raw)) return map;
  for (const h of raw as RawHeader[]) {
    if (h && typeof h.name === 'string' && typeof h.value === 'string') {
      map[h.name.toLowerCase()] = h.value;
    }
  }
  return map;
}

/** Case-insensitive response/request header lookup on a normalized entry. */
export function header(map: Record<string, string>, name: string): string | null {
  const v = map[name.toLowerCase()];
  return v === undefined ? null : v;
}

const EXT_TYPES: Record<string, ResourceType> = {
  js: 'script',
  mjs: 'script',
  css: 'stylesheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  svg: 'image',
  ico: 'image',
  woff: 'font',
  woff2: 'font',
  ttf: 'font',
  otf: 'font',
  mp4: 'media',
  webm: 'media',
  mp3: 'media',
};

/** Infer a coarse resource type from Chrome's `_resourceType`, the mime type, and the URL. */
export function resourceType(mime: string, url: string, chromeType?: string): ResourceType {
  const ct = (chromeType ?? '').toLowerCase();
  if (ct === 'xhr' || ct === 'fetch') return 'xhr';
  if (ct === 'document') return 'document';
  if (ct === 'script') return 'script';
  if (ct === 'stylesheet') return 'stylesheet';
  if (ct === 'image') return 'image';
  if (ct === 'font') return 'font';
  if (ct === 'media') return 'media';

  const m = mime.toLowerCase().split(';')[0].trim();
  if (m === 'text/html') return 'document';
  if (m.includes('javascript') || m === 'text/js') return 'script';
  if (m === 'text/css') return 'stylesheet';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('font/') || m.includes('font-')) return 'font';
  if (m.startsWith('audio/') || m.startsWith('video/')) return 'media';
  if (m.includes('json') || m.includes('xml') || m === 'text/plain') return 'xhr';

  const path = url.split('?')[0];
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : '';
  return EXT_TYPES[ext] ?? 'other';
}

function parsePhases(raw: unknown): Phases {
  const t = (raw ?? {}) as Record<string, unknown>;
  const phases = {} as Phases;
  for (const k of PHASE_KEYS) {
    // -1 means "phase not applicable" in the HAR spec; clamp to 0.
    phases[k] = Math.max(0, asNumber(t[k], 0));
  }
  return phases;
}

function parseUrl(url: string): { origin: string; path: string } {
  try {
    const u = new URL(url);
    return { origin: u.origin, path: u.pathname };
  } catch {
    return { origin: '(invalid-url)', path: url };
  }
}

/**
 * Best-effort bytes on the wire. Chrome exports `_transferSize`; otherwise the
 * spec's response.bodySize + headersSize when present, else the decoded size.
 */
function transferSize(res: Record<string, unknown>, decoded: number): number {
  const t = asNumber(res._transferSize, -1);
  if (t >= 0) return t;
  const body = asNumber(res.bodySize, -1);
  const heads = asNumber(res.headersSize, -1);
  if (body >= 0) return body + Math.max(0, heads);
  return decoded;
}

export function parseHar(text: string): ParsedHar {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new HarParseError('This file is not valid JSON. Export a .har file from your browser DevTools Network panel.');
  }
  const log = (doc as Record<string, unknown> | null)?.log as Record<string, unknown> | undefined;
  const rawEntries = log?.entries;
  if (!Array.isArray(rawEntries)) {
    throw new HarParseError('This JSON has no log.entries array, so it does not look like a HAR file.');
  }

  const warnings: string[] = [];
  const creatorObj = (log?.creator ?? {}) as Record<string, unknown>;
  const creator = [asString(creatorObj.name), asString(creatorObj.version)].filter(Boolean).join(' ');

  interface Staged {
    epoch: number;
    entry: Omit<Entry, 'index' | 'start'>;
  }
  const staged: Staged[] = [];

  rawEntries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const req = e?.request as Record<string, unknown> | undefined;
    const res = e?.response as Record<string, unknown> | undefined;
    const url = asString(req?.url);
    if (!req || !res || !url) {
      warnings.push(`Entry ${i + 1} is missing its request or response and was skipped.`);
      return;
    }
    const epoch = Date.parse(asString(e.startedDateTime));
    if (Number.isNaN(epoch)) {
      warnings.push(`Entry ${i + 1} (${url.slice(0, 80)}) has no valid start time and was skipped.`);
      return;
    }
    const content = (res.content ?? {}) as Record<string, unknown>;
    const decoded = Math.max(0, asNumber(content.size, 0));
    const { origin, path } = parseUrl(url);
    const mimeType = asString(content.mimeType);
    const status = asNumber(res.status, 0);

    staged.push({
      epoch,
      entry: {
        url,
        origin,
        path,
        method: asString(req.method, 'GET').toUpperCase(),
        status,
        statusText: asString(res.statusText),
        httpVersion: asString(res.httpVersion, asString(req.httpVersion)).toLowerCase(),
        mimeType,
        type: resourceType(mimeType, url, asString(e._resourceType)),
        time: Math.max(0, asNumber(e.time, 0)),
        phases: parsePhases(e.timings),
        transferSize: transferSize(res, decoded),
        bodySize: decoded,
        requestHeaders: headerMap(req.headers),
        responseHeaders: headerMap(res.headers),
        redirectURL: asString(res.redirectURL),
        fromCache: e._fromCache !== undefined && e._fromCache !== null && e._fromCache !== false,
        pageref: asString(e.pageref) || null,
      },
    });
  });

  if (staged.length === 0) {
    throw new HarParseError('No usable entries were found in this HAR file.');
  }

  staged.sort((a, b) => a.epoch - b.epoch);
  const t0 = staged[0].epoch;
  const entries: Entry[] = staged.map((s, index) => ({ ...s.entry, index, start: s.epoch - t0 }));

  return {
    entries,
    warnings,
    creator,
    startedAt: new Date(t0).toISOString(),
  };
}
