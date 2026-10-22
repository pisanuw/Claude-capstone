/**
 * FERPA release. Under 34 CFR 99.30 a written consent to disclose education
 * records must be signed and dated and must name the records, the purpose and
 * the parties they go to; it may be signed electronically. The text below is
 * generated from the student's own choices, stored verbatim with a SHA-256 so
 * the professor can show exactly what was signed, and re-checked on import.
 */

import { sha256Hex } from './codec';
import type { Policy, Program, Release, ReleaseScope, RequestPacket } from './types';
import { SCOPE_LABELS } from './types';

export interface ReleaseInput {
  student: string;
  programs: Pick<Program, 'name' | 'kind'>[];
  scope: ReleaseScope[];
  waive: boolean;
  date: string;
}

function programLabel(p: Pick<Program, 'name' | 'kind'>): string {
  return p.kind.trim() ? `${p.name.trim()} (${p.kind.trim()})` : p.name.trim();
}

export function releaseText(policy: Pick<Policy, 'professor' | 'institution'>, r: ReleaseInput): string {
  const who = policy.professor.trim() || 'the professor';
  const where = policy.institution.trim() ? ` of ${policy.institution.trim()}` : '';
  const scope = r.scope.length ? r.scope.map((s) => `- ${SCOPE_LABELS[s]}`).join('\n') : '- (nothing selected)';
  const programs = r.programs.length ? r.programs.map((p) => `- ${programLabel(p)}`).join('\n') : '- (no programs listed)';
  const waiver = r.waive
    ? 'I waive my right to inspect and review this letter of recommendation and any copy of it. I understand this waiver is voluntary and is not a condition of the letter being written.'
    : 'I do not waive my right to inspect and review this letter of recommendation. I understand some programs may give less weight to letters the applicant can read.';
  return [
    'Release of education records for a letter of recommendation (FERPA, 34 CFR 99.30)',
    '',
    `I, ${r.student.trim() || '(name)'}, authorize ${who}${where} to disclose the following information from my education records:`,
    scope,
    '',
    'The purpose of this disclosure is a letter of recommendation in support of my application to:',
    programs,
    '',
    'The information may be disclosed only to those programs, their admissions or selection committees, and the services they use to collect letters.',
    '',
    waiver,
    '',
    'I may revoke this consent in writing for letters not yet sent.',
    '',
    `Signed electronically by typing my full name, on ${r.date}.`,
  ].join('\n');
}

export async function buildRelease(policy: Pick<Policy, 'professor' | 'institution'>, r: ReleaseInput, signature: string, consent: boolean, signedAt: string): Promise<Release> {
  const text = releaseText(policy, r);
  return { consent, scope: [...r.scope], waive: r.waive, signature: signature.trim(), signedAt, text, textHash: await sha256Hex(text) };
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** True when the typed signature is the student's name (case and spacing aside). */
export function signatureMatches(signature: string, name: string): boolean {
  return !!squash(name) && squash(signature) === squash(name);
}

/** Problems with a received packet's release; an empty list means it is complete and unaltered. */
export async function releaseProblems(packet: RequestPacket): Promise<string[]> {
  const r = packet.release;
  const out: string[] = [];
  if (!r.consent) out.push('The student did not tick the consent box.');
  if (!signatureMatches(r.signature, packet.student.name)) out.push(`The signature "${r.signature}" does not match the name "${packet.student.name}".`);
  if (!r.scope.length) out.push('No records were released, so the letter cannot discuss grades or coursework.');
  if ((await sha256Hex(r.text)) !== r.textHash) out.push('The release text does not match its hash; it was edited after signing.');
  for (const p of packet.programs) if (!r.text.includes(p.name.trim())) out.push(`"${p.name}" is not named in the signed release.`);
  if (!r.text.includes(`I, ${packet.student.name.trim()},`)) out.push('The release text names a different student.');
  return out;
}
