// Trace and configuration packed into the URL fragment so a heap can be shared.

import { DEFAULT_CONFIG, type HeapConfig, validateConfig } from './heap';
import type { PolicySwitch } from './trace';

export interface Shared {
  cfg: HeapConfig;
  trace: string;
  switches: PolicySwitch[];
  step?: number;
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(s: Shared): string {
  const payload = {
    c: [s.cfg.word, s.cfg.heapSize, s.cfg.list, s.cfg.fit, s.cfg.coalesce, s.cfg.insert],
    t: s.trace,
    s: s.switches.map((sw) => [sw.at, sw.patch]),
    k: s.step,
  };
  return 'h=' + b64encode(JSON.stringify(payload));
}

export function decodeShare(hash: string): Shared | null {
  const m = hash.replace(/^#/, '').match(/(?:^|&)h=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(b64decode(m[1])) as { c: unknown[]; t: unknown; s?: unknown[]; k?: unknown };
    if (!Array.isArray(p.c) || typeof p.t !== 'string') return null;
    const cfg: HeapConfig = {
      word: p.c[0] === 8 ? 8 : 4,
      heapSize: typeof p.c[1] === 'number' ? p.c[1] : DEFAULT_CONFIG.heapSize,
      list: pick(p.c[2], ['implicit', 'explicit', 'segregated'], DEFAULT_CONFIG.list),
      fit: pick(p.c[3], ['first', 'next', 'best', 'worst'], DEFAULT_CONFIG.fit),
      coalesce: pick(p.c[4], ['immediate', 'deferred', 'none'], DEFAULT_CONFIG.coalesce),
      insert: pick(p.c[5], ['lifo', 'address'], DEFAULT_CONFIG.insert),
    };
    if (validateConfig(cfg)) return null;
    const switches: PolicySwitch[] = [];
    if (Array.isArray(p.s)) {
      for (const sw of p.s) {
        if (Array.isArray(sw) && typeof sw[0] === 'number' && sw[1] && typeof sw[1] === 'object') {
          switches.push({ at: sw[0], patch: sw[1] as PolicySwitch['patch'] });
        }
      }
    }
    const out: Shared = { cfg, trace: p.t, switches };
    if (typeof p.k === 'number') out.step = p.k;
    return out;
  } catch {
    return null;
  }
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
