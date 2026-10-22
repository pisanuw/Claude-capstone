/** The professor's request policy and the link that carries it to students. */

import { packText, unpackText } from './codec';
import { gradePoints } from './grades';
import type { DocKind, Policy } from './types';

const PREFIX = 'll1.';
const DOCS: DocKind[] = ['cv', 'statement', 'transcript', 'photo', 'other'];

export function defaultPolicy(publicKey = ''): Policy {
  return {
    v: 1,
    professor: '',
    title: '',
    institution: '',
    email: '',
    leadDays: 21,
    maxPrograms: 8,
    minGrade: '',
    minCourses: 1,
    requiredDocs: ['cv', 'statement'],
    conditions: '',
    questions: ['What do you most want the letter to say about you, and what example from my course shows it?'],
    publicKey,
  };
}

export interface PolicyProblem {
  field: keyof Policy;
  message: string;
}

/** Problems that would make the link unusable or misleading; an empty list means it is ready to share. */
export function policyProblems(p: Policy): PolicyProblem[] {
  const out: PolicyProblem[] = [];
  if (!p.professor.trim()) out.push({ field: 'professor', message: 'Add your name so students know whose form this is.' });
  if (p.email.trim() && !isEmail(p.email)) out.push({ field: 'email', message: 'That email address does not look right.' });
  if (!Number.isInteger(p.leadDays) || p.leadDays < 0 || p.leadDays > 120) out.push({ field: 'leadDays', message: 'Lead time must be a whole number of days from 0 to 120.' });
  if (!Number.isInteger(p.maxPrograms) || p.maxPrograms < 1 || p.maxPrograms > 40) out.push({ field: 'maxPrograms', message: 'Allow from 1 to 40 programs per request.' });
  if (p.minGrade.trim() && gradePoints(p.minGrade) === null) out.push({ field: 'minGrade', message: 'Use a letter grade (A, B+) or grade points (3.5).' });
  if (!Number.isInteger(p.minCourses) || p.minCourses < 0 || p.minCourses > 10) out.push({ field: 'minCourses', message: 'Course count must be from 0 to 10.' });
  if (!p.publicKey) out.push({ field: 'publicKey', message: 'No encryption key yet; reload the page to create one.' });
  return out;
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function encodePolicy(p: Policy): string {
  return PREFIX + packText(p);
}

/** Decodes a link fragment (with or without `#ask=`); null for anything malformed. */
export function decodePolicy(fragment: string): Policy | null {
  try {
    const raw = fragment.trim().replace(/^#?ask=/, '');
    if (!raw.startsWith(PREFIX)) return null;
    const p = unpackText(raw.slice(PREFIX.length)) as Policy;
    const ok =
      p?.v === 1 &&
      typeof p.professor === 'string' &&
      typeof p.publicKey === 'string' &&
      p.publicKey.length > 0 &&
      typeof p.leadDays === 'number' &&
      typeof p.maxPrograms === 'number' &&
      Array.isArray(p.requiredDocs) &&
      p.requiredDocs.every((d) => DOCS.includes(d)) &&
      Array.isArray(p.questions) &&
      p.questions.every((q) => typeof q === 'string');
    return ok ? p : null;
  } catch {
    return null;
  }
}

export function requestLink(base: string, p: Policy): string {
  return `${base.replace(/[?#].*$/, '')}#ask=${encodePolicy(p)}`;
}
