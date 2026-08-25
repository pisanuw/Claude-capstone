import type { Audience } from './types';
import { AUDIENCES } from './types';
import { getAnalogy } from './corpus/index';

/**
 * Read-only share links. Because the corpus ships with the app, a share link
 * only needs to carry ids (plus an optional personal note), so links stay short
 * and the shared card renders without any backend.
 */

export interface SharePayload {
  analogyId: string;
  audience: Audience;
  note?: string;
}

const VERSION = 1;
const MAX_NOTE_LENGTH = 500;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a share payload into a URL hash fragment (without the leading '#'). */
export function encodeShare(payload: SharePayload): string {
  const body: Record<string, unknown> = {
    v: VERSION,
    a: payload.analogyId,
    u: payload.audience,
  };
  const note = payload.note?.trim();
  if (note) body.n = note.slice(0, MAX_NOTE_LENGTH);
  return `share=${toBase64Url(JSON.stringify(body))}`;
}

/**
 * Decode a hash fragment produced by encodeShare. Returns null for anything
 * malformed, from the wrong version, or referencing an unknown analogy or
 * audience: a bad link degrades to the normal app, never to a crash.
 */
export function decodeShare(hash: string): SharePayload | null {
  const m = /(?:^|[#&])share=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(m[1]));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== VERSION) return null;
    if (typeof obj.a !== 'string' || !getAnalogy(obj.a)) return null;
    if (typeof obj.u !== 'string' || !(AUDIENCES as string[]).includes(obj.u)) return null;
    const payload: SharePayload = { analogyId: obj.a, audience: obj.u as Audience };
    if (typeof obj.n === 'string' && obj.n.trim() !== '') {
      payload.note = obj.n.slice(0, MAX_NOTE_LENGTH);
    }
    return payload;
  } catch {
    return null;
  }
}
