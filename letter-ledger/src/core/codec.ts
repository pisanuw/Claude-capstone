/** Byte and text encodings shared by links, packets and backups. */

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/** Bytes backed by a plain ArrayBuffer, which is what Web Crypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function own(bytes: Uint8Array): Bytes {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Bytes) : new Uint8Array(bytes);
}

function toBinary(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return bin;
}

function fromBinary(bin: string): Bytes {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(toBinary(bytes));
}

export function fromBase64(s: string): Bytes {
  return fromBinary(atob(s));
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Bytes {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/** JSON, deflated. */
export function packBytes(value: unknown): Bytes {
  return own(deflateSync(strToU8(JSON.stringify(value)), { level: 9 }));
}

export function unpackBytes(bytes: Uint8Array): unknown {
  return JSON.parse(strFromU8(inflateSync(bytes)));
}

export function packText(value: unknown): string {
  return toBase64Url(packBytes(value));
}

export function unpackText(s: string): unknown {
  return unpackBytes(fromBase64Url(s));
}

export function utf8(s: string): Bytes {
  return new TextEncoder().encode(s);
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? utf8(data) : own(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Random id: 16 hex characters from the platform CSPRNG. */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
