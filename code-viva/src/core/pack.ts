/**
 * Links and response codes. A viva travels to the student inside the link's
 * URL fragment (deflated JSON, base64url), so no server sees it. The student's
 * transcript comes back as a response code they paste into the LMS or email;
 * it names the viva it answers by a hash of the viva's content, so a
 * transcript for edited or someone else's questions is caught on import.
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { hash } from './text';
import type { Question, Transcript, Viva } from './types';

const VIVA_PREFIX = 'cv1.';
const RESPONSE_PREFIX = 'CVR1.';

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pack(value: unknown): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify(value)), { level: 9 }));
}

function unpack(s: string): unknown {
  return JSON.parse(strFromU8(inflateSync(fromBase64Url(s))));
}

/** Content id of a viva: any change to its questions or timing gives a new id. */
export function vivaId(v: Viva): string {
  return hash(JSON.stringify([v.course, v.assignment, v.student, v.submissionId, v.minutes, v.timeMultiplier, v.maxFollowUps, v.questions.map((q) => [q.id, q.prompt])]));
}

export function encodeViva(v: Viva): string {
  return VIVA_PREFIX + pack(v);
}

function isQuestion(q: unknown): q is Question {
  const o = q as Record<string, unknown>;
  return !!o && typeof o.id === 'string' && typeof o.prompt === 'string' && Array.isArray(o.identifiers) && Array.isArray(o.concepts) && !!o.followUps;
}

export function decodeViva(code: string): Viva | null {
  try {
    const raw = code.trim().replace(/^#?viva=/, '');
    if (!raw.startsWith(VIVA_PREFIX)) return null;
    const v = unpack(raw.slice(VIVA_PREFIX.length)) as Viva;
    if (v?.v !== 1 || !Array.isArray(v.questions) || !v.questions.every(isQuestion) || typeof v.minutes !== 'number') return null;
    return v;
  } catch {
    return null;
  }
}

export function vivaLink(base: string, v: Viva): string {
  return `${base.replace(/#.*$/, '')}#viva=${encodeViva(v)}`;
}

export function encodeResponse(t: Transcript): string {
  return RESPONSE_PREFIX + pack(t);
}

/** Finds every response code in pasted text (an email body, an LMS export) and decodes them. */
export function decodeResponses(text: string): { transcripts: Transcript[]; errors: number } {
  const transcripts: Transcript[] = [];
  let errors = 0;
  for (const m of text.matchAll(/CVR1\.[A-Za-z0-9_-]+/g)) {
    try {
      const t = unpack(m[0].slice(RESPONSE_PREFIX.length)) as Transcript;
      if (t?.v === 1 && typeof t.vivaId === 'string' && Array.isArray(t.questions)) transcripts.push(t);
      else errors++;
    } catch {
      errors++;
    }
  }
  return { transcripts, errors };
}
