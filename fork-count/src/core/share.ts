import type { BufMode } from './interp';

const MODES: BufMode[] = ['line', 'full', 'none'];

/** URL fragment holding the program and buffering mode. */
export function encodeState(code: string, mode: BufMode): string {
  const bytes = new TextEncoder().encode(code);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#m=${mode}&c=${b64}`;
}

export function decodeState(hash: string): { code: string; mode: BufMode } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const c = params.get('c');
  const m = params.get('m') as BufMode | null;
  if (!c) return null;
  try {
    const bin = atob(c.replace(/-/g, '+').replace(/_/g, '/'));
    const code = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    return { code, mode: m && MODES.includes(m) ? m : 'line' };
  } catch {
    return null;
  }
}
