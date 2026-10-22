/**
 * Checking a request against the professor's policy, and moving it between
 * browsers as a sealed packet file. The same checks run in the student's form
 * (errors block sending, warnings are shown) and again on import, since a
 * packet could come from an older link with a looser policy.
 */

import { packBytes, unpackBytes } from './codec';
import { daysBetween, isDay } from './dates';
import { gradePoints, meets } from './grades';
import { isEmail } from './policy';
import { signatureMatches } from './release';
import { seal, unseal } from './seal';
import type { Policy, RequestPacket } from './types';
import { DOC_LABELS } from './types';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export interface Issue {
  level: 'error' | 'warn';
  /** Form field the issue belongs to, for focus links: "name", "program-0-deadline", "release". */
  field: string;
  message: string;
}

export function earliestDeadline(packet: Pick<RequestPacket, 'programs'>): string | null {
  const days = packet.programs.map((p) => p.deadline).filter(isDay).sort();
  return days[0] ?? null;
}

export function checkRequest(policy: Policy, packet: RequestPacket, today: string): Issue[] {
  const out: Issue[] = [];
  const err = (field: string, message: string) => out.push({ level: 'error', field, message });
  const warn = (field: string, message: string) => out.push({ level: 'warn', field, message });
  const s = packet.student;

  if (!s.name.trim()) err('name', 'Enter your full name.');
  if (!isEmail(s.email)) err('email', 'Enter an email address I can reply to.');
  if (!s.howKnown.trim()) err('howKnown', 'Say how I know you (course, project, research), in a sentence or two.');

  if (!packet.programs.length) err('programs', 'Add at least one program.');
  if (packet.programs.length > policy.maxPrograms) err('programs', `I write for at most ${policy.maxPrograms} programs per request; you listed ${packet.programs.length}.`);
  packet.programs.forEach((p, i) => {
    const label = p.name.trim() || `Program ${i + 1}`;
    if (!p.name.trim()) err(`program-${i}-name`, `Program ${i + 1}: enter the program or position name.`);
    if (!isDay(p.deadline)) err(`program-${i}-deadline`, `${label}: enter the letter deadline as a date.`);
    else {
      const left = daysBetween(today, p.deadline);
      if (left < 0) err(`program-${i}-deadline`, `${label}: the deadline has already passed.`);
      else if (left < policy.leadDays) warn(`program-${i}-deadline`, `${label}: the deadline is ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}; I ask for ${policy.leadDays} days' notice, so this letter may be late or declined.`);
    }
    if (!p.method.trim()) err(`program-${i}-method`, `${label}: say how the letter is submitted (portal email, Interfolio, ...).`);
  });

  if (!packet.courses.length) err('courses', 'List at least one course you took with me (or worked with me in).');
  packet.courses.forEach((c, i) => {
    if (!c.code.trim() && !c.title.trim()) err(`course-${i}-code`, `Course ${i + 1}: enter the course number or title.`);
    if (!c.term.trim()) err(`course-${i}-term`, `Course ${i + 1}: enter the term (e.g. Fall 2025).`);
  });
  if (policy.minGrade.trim() && policy.minCourses > 0 && packet.courses.length) {
    const ranked = packet.courses.filter((c) => gradePoints(c.grade) !== null);
    const meeting = ranked.filter((c) => meets(c.grade, policy.minGrade)).length;
    if (meeting < policy.minCourses) {
      warn('courses', `I usually write only for students with at least ${policy.minCourses} course${policy.minCourses === 1 ? '' : 's'} at ${policy.minGrade} or better with me; you list ${meeting}. You can still send the request.`);
    }
  }

  for (const kind of policy.requiredDocs) {
    if (!packet.attachments.some((a) => a.kind === kind)) err(`doc-${kind}`, `Attach your ${DOC_LABELS[kind].toLowerCase()}.`);
  }
  let total = 0;
  for (const a of packet.attachments) {
    total += a.size;
    if (a.size > MAX_FILE_BYTES) err(`doc-${a.kind}`, `${a.name} is larger than 8 MB; please compress it.`);
  }
  if (total > MAX_TOTAL_BYTES) err('docs', 'Attachments add up to more than 20 MB; please compress them.');

  policy.questions.forEach((q, i) => {
    if (q.trim() && !isOptional(q) && !(packet.answers[i] ?? '').trim()) err(`answer-${i}`, `Answer: "${q}"`);
  });

  const r = packet.release;
  if (!r.consent) err('release', 'Tick the box to sign the FERPA release; I cannot discuss your records without it.');
  if (!r.scope.length) err('release', 'Choose at least one kind of record the letter may discuss.');
  if (!signatureMatches(r.signature, s.name)) err('signature', 'Type your full name exactly as entered above to sign.');
  return out;
}

/** A policy question ending in "(optional)" may be left blank. */
export const isOptional = (q: string) => /\(optional\)\s*$/i.test(q);

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');

export function isPacket(p: unknown): p is RequestPacket {
  const o = p as RequestPacket;
  return (
    !!o &&
    o.v === 1 &&
    typeof o.id === 'string' &&
    !!o.student &&
    typeof o.student.name === 'string' &&
    typeof o.student.email === 'string' &&
    Array.isArray(o.programs) &&
    o.programs.every((x) => typeof x?.id === 'string' && typeof x.name === 'string' && typeof x.deadline === 'string') &&
    Array.isArray(o.courses) &&
    Array.isArray(o.attachments) &&
    Array.isArray(o.answers) &&
    !!o.release &&
    typeof o.release.text === 'string'
  );
}

export async function sealPacket(publicKey: string, packet: RequestPacket): Promise<Uint8Array> {
  return seal(publicKey, packBytes(packet));
}

export async function openPacket(privateKey: JsonWebKey, sealed: Uint8Array): Promise<RequestPacket> {
  const value = unpackBytes(await unseal(privateKey, sealed));
  if (!isPacket(value)) throw new Error('The packet opened but its contents are not a letter request.');
  return value;
}

/** File name for the student's download: "letter-request-ada-lovelace-2026-10-22.ledger". */
export function packetFileName(packet: RequestPacket): string {
  const slug = packet.student.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'student';
  return `letter-request-${slug}-${packet.createdAt.slice(0, 10)}.ledger`;
}
