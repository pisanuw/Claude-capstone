/**
 * Reading an answer: does it name the student's own code, cover the concepts
 * the question is about, and explain rather than assert? The same reading
 * decides when to ask a follow-up (during the session) and feeds the proposed
 * score (afterwards), so the student is never scored on a rule the session did
 * not give them a chance to answer.
 */

import { coversConcept, mentions, words } from './text';
import type { Question } from './types';

export type Missing = 'specifics' | 'concept' | 'depth';

export interface Assessment {
  words: number;
  identifiersHit: string[];
  /** True when the answer points at a line number or quotes code in backticks. */
  pointsAtCode: boolean;
  specific: boolean;
  /** Per concept group: covered or not. */
  concepts: boolean[];
  causal: boolean;
  hedges: number;
  dontKnow: boolean;
  vague: boolean;
  missing: Missing | null;
}

const HEDGES = /\b(?:i think|i guess|maybe|probably|not sure|kind of|sort of|basically|somehow|just works|it works|something like|stuff|whatever)\b/g;
const DONT_KNOW = /\b(?:i don'?t know|idk|no idea|don'?t remember|can'?t remember|not sure what|i forgot|dunno)\b/;
const CAUSAL = /\b(?:because|so that|so the|since|therefore|which means|otherwise|this means|that means|in order to|which is why|so it|so we|so i|if .{1,60} then|when .{1,60} it)\b/;

export function assess(q: Question, answer: string): Assessment {
  const text = answer.trim();
  const lower = text.toLowerCase();
  const n = words(text).length;
  const identifiersHit = q.identifiers.filter((id) => mentions(text, id));
  const pointsAtCode = /\bline\s+\d+\b|`[^`]+`/.test(lower);
  const specific = identifiersHit.length > 0 || pointsAtCode || q.identifiers.length === 0;
  const concepts = q.concepts.map((g) => coversConcept(text, g));
  const covered = concepts.filter(Boolean).length;
  const causal = CAUSAL.test(lower);
  const hedges = (lower.match(HEDGES) ?? []).length;
  const dontKnow = DONT_KNOW.test(lower);
  const vague = dontKnow || n < 12 || !specific || covered < concepts.length || (hedges >= 2 && n < 40) || (n < 25 && !causal);
  let missing: Missing | null = null;
  if (vague) missing = !specific ? 'specifics' : covered < concepts.length ? 'concept' : 'depth';
  return { words: n, identifiersHit, pointsAtCode, specific, concepts, causal, hedges, dontKnow, vague, missing };
}
