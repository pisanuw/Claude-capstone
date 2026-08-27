import type { Gene } from './types';
import { isGeneType } from './types';
import { makeGene } from './segment';

/**
 * Read-only share links with no server: the genome is encoded into the URL
 * hash as base64url JSON. Anyone opening the link gets the genes rebuilt
 * locally; nothing is stored anywhere.
 */

const PREFIX = 'genome=';
const MAX_HASH_LENGTH = 20_000;

interface WireGenome {
  v: 1;
  g: { t: string; x: string }[];
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeShare(genes: Gene[]): string {
  const wire: WireGenome = { v: 1, g: genes.map((g) => ({ t: g.type, x: g.text })) };
  return `#${PREFIX}${toBase64Url(JSON.stringify(wire))}`;
}

export function decodeShare(hash: string): Gene[] | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(PREFIX)) return null;
  const payload = raw.slice(PREFIX.length);
  if (payload === '' || payload.length > MAX_HASH_LENGTH) return null;
  const json = fromBase64Url(payload);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const wire = parsed as Record<string, unknown>;
  if (wire.v !== 1 || !Array.isArray(wire.g) || wire.g.length === 0) return null;
  const genes: Gene[] = [];
  for (const entry of wire.g) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { t, x } = entry as Record<string, unknown>;
    if (!isGeneType(t) || typeof x !== 'string' || x.trim() === '') return null;
    genes.push(makeGene(t, x, ['from share link']));
  }
  return genes;
}
