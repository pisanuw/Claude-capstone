import { DEFAULT_CONFIG, validateConfig, type CacheConfig, type Policy } from './cache';

export interface Shared {
  a: string;
  b: string;
  cfg: CacheConfig;
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/** URL fragment holding both kernels and the cache configuration. */
export function encodeState(s: Shared): string {
  const c = s.cfg;
  const p = new URLSearchParams({
    c: `${c.size}-${c.lineSize}-${c.ways}-${c.policy}-${c.writeAllocate ? 'wa' : 'nwa'}-${c.writeBack ? 'wb' : 'wt'}-${c.seed}`,
    a: b64(s.a),
  });
  if (s.b) p.set('b', b64(s.b));
  return `#${p.toString()}`;
}

export function decodeState(hash: string): Shared | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const a = p.get('a');
  if (!a) return null;
  try {
    const parts = (p.get('c') ?? '').split('-');
    const policy = parts[3] as Policy;
    const cfg: CacheConfig = {
      size: Number(parts[0]),
      lineSize: Number(parts[1]),
      ways: Number(parts[2]),
      policy: ['lru', 'fifo', 'random'].includes(policy) ? policy : 'lru',
      writeAllocate: parts[4] !== 'nwa',
      writeBack: parts[5] !== 'wt',
      seed: Number(parts[6]) || 1,
    };
    const b = p.get('b');
    return { a: unb64(a), b: b ? unb64(b) : '', cfg: validateConfig(cfg).length ? { ...DEFAULT_CONFIG } : cfg };
  } catch {
    return null;
  }
}
