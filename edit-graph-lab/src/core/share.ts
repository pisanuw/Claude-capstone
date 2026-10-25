import type { Mode } from './script';

export interface Shared {
  a: string;
  b: string;
  mode: Mode;
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

/** URL fragment holding both texts and the token mode. */
export function encodeState(s: Shared): string {
  return `#${new URLSearchParams({ m: s.mode, a: b64(s.a), b: b64(s.b) }).toString()}`;
}

export function decodeState(hash: string): Shared | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const a = p.get('a');
  const b = p.get('b');
  if (a === null || b === null) return null;
  try {
    return { a: unb64(a), b: unb64(b), mode: p.get('m') === 'char' ? 'char' : 'line' };
  } catch {
    return null;
  }
}
