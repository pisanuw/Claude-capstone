import crypto from 'node:crypto';
import type { GameState } from './game.js';

/**
 * Game state lives in a signed cookie. This suits cookie-identity perfectly:
 * the streak and 24h lockout are inherently per-browser, survive server
 * restarts, and need no database. The payload is HMAC-signed so a player
 * cannot forge a streak or clear a lockout by editing the cookie (they can of
 * course clear cookies to start over as a NEW anonymous player; that is an
 * accepted property of cookie identity, documented in the README).
 */

export const COOKIE_NAME = 'mstreak';

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Encode + sign state into a cookie value: base64url(json).signature */
export function encodeState(state: GameState, secret: string): string {
  const json = JSON.stringify(state);
  const body = Buffer.from(json, 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** Verify + decode a cookie value. Returns null if missing, malformed, or the
 *  signature does not match (tampered or signed with a different secret). */
export function decodeState(value: string | undefined, secret: string): GameState | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(body, secret);
  // Constant-time compare to avoid timing leaks on the signature.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as GameState;
    if (typeof parsed.id !== 'string' || typeof parsed.streak !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A new random anonymous player id. */
export function newId(): string {
  return crypto.randomUUID();
}
