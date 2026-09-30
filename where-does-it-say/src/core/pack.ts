/**
 * Course packs: the documents an instructor shares with students.
 *
 * A pack travels inside the share link (URL fragment, deflate-compressed and
 * base64url-encoded), so nothing is uploaded anywhere: the link is the pack.
 * Large packs can instead be downloaded as JSON and hosted anywhere that
 * serves it with CORS, then opened with ?pack=<url>.
 */

import { parseDoc, type DocFormat, type ParsedDoc, type SourceDoc } from './docs.js';
import { hash } from './text.js';

export interface CoursePack {
  v: 1;
  title: string;
  docs: SourceDoc[];
}

export const MAX_DOCS = 30;
export const MAX_DOC_CHARS = 400_000;
/** Links longer than this may be cut off by email clients and learning management systems. */
export const LONG_LINK = 32_000;

const FORMATS: DocFormat[] = ['markdown', 'text', 'pdf'];

/** Validates untrusted JSON as a course pack, or explains what is wrong. */
export function validatePack(data: unknown): { pack: CoursePack } | { error: string } {
  if (!data || typeof data !== 'object') return { error: 'The pack is not a JSON object.' };
  const o = data as Record<string, unknown>;
  if (o.v !== 1) return { error: 'Unknown pack version (expected "v": 1).' };
  if (typeof o.title !== 'string') return { error: 'The pack needs a "title" string.' };
  if (!Array.isArray(o.docs) || o.docs.length === 0) return { error: 'The pack needs a non-empty "docs" array.' };
  if (o.docs.length > MAX_DOCS) return { error: `A pack holds at most ${MAX_DOCS} documents.` };
  const docs: SourceDoc[] = [];
  for (const [i, d] of o.docs.entries()) {
    if (!d || typeof d !== 'object') return { error: `Document ${i + 1} is not an object.` };
    const r = d as Record<string, unknown>;
    if (typeof r.title !== 'string' || typeof r.source !== 'string') return { error: `Document ${i + 1} needs "title" and "source" strings.` };
    if (!FORMATS.includes(r.format as DocFormat)) return { error: `Document ${i + 1} has an unknown format (use markdown, text or pdf).` };
    if (r.source.length > MAX_DOC_CHARS) return { error: `Document ${i + 1} is longer than ${MAX_DOC_CHARS.toLocaleString('en-US')} characters.` };
    docs.push({ title: r.title.slice(0, 200), format: r.format as DocFormat, source: r.source });
  }
  return { pack: { v: 1, title: o.title.slice(0, 200), docs } };
}

/** Stable id of a pack's content; the gap log is kept per pack. */
export function packId(pack: CoursePack): string {
  return hash(JSON.stringify([pack.title, pack.docs.map((d) => [d.title, d.format, d.source])]));
}

/** Parses every document of a pack. */
export function parsePack(pack: CoursePack): ParsedDoc[] {
  return pack.docs.map((d, i) => parseDoc(d, i));
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Encodes a pack for the URL fragment: "pack=" + base64url(deflate-raw(JSON)). */
export async function encodePack(pack: CoursePack): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack));
  return 'pack=' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Decodes a pack from a URL fragment ("#pack=..."), or returns an error. */
export async function decodePack(fragment: string): Promise<{ pack: CoursePack } | { error: string } | null> {
  const m = /(?:^#?|&)pack=([A-Za-z0-9_-]+)/.exec(fragment);
  if (!m) return null;
  let text: string;
  try {
    text = new TextDecoder().decode(await pipe(fromBase64Url(m[1]), new DecompressionStream('deflate-raw')));
  } catch {
    return { error: 'The course link is damaged (it may have been cut off when it was copied).' };
  }
  try {
    return validatePack(JSON.parse(text));
  } catch {
    return { error: 'The course link does not contain a valid pack.' };
  }
}
