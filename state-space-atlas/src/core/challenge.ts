import { createPuzzle } from './factory';
import { PuzzleError, type PuzzleDef } from './puzzle';
import type { Algorithm } from './search';

/**
 * A "beat this node count" challenge an instructor exports: a puzzle, the
 * algorithm to use, and the number of expansions to beat. Students load it
 * from the link, write a heuristic, and the atlas reports whether their run
 * expanded fewer nodes than the target while staying admissible.
 */
export interface Challenge {
  v: 1;
  title: string;
  def: PuzzleDef;
  algorithm: Algorithm;
  /** Expand strictly fewer nodes than this. */
  targetExpanded: number;
  /** Whether the heuristic must pass the admissibility check too. */
  requireAdmissible: boolean;
  note?: string;
}

const ALGORITHMS = new Set<Algorithm>(['bfs', 'dfs', 'iddfs', 'greedy', 'astar']);

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeChallenge(c: Challenge): string {
  return toBase64Url(JSON.stringify(c));
}

export function decodeChallenge(encoded: string): Challenge {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded));
  } catch {
    throw new PuzzleError('That challenge link is damaged (not decodable)');
  }
  return validateChallenge(raw);
}

export function validateChallenge(raw: unknown): Challenge {
  if (!raw || typeof raw !== 'object') throw new PuzzleError('Challenge must be an object');
  const c = raw as Partial<Challenge>;
  if (c.v !== 1) throw new PuzzleError('Unsupported challenge version');
  if (typeof c.title !== 'string' || c.title.length > 120) throw new PuzzleError('Challenge needs a title (up to 120 characters)');
  if (!c.algorithm || !ALGORITHMS.has(c.algorithm)) throw new PuzzleError('Challenge names an unknown algorithm');
  if (!Number.isInteger(c.targetExpanded) || (c.targetExpanded as number) < 1) {
    throw new PuzzleError('Challenge target must be a positive whole number of expansions');
  }
  if (c.note !== undefined && (typeof c.note !== 'string' || c.note.length > 1000)) {
    throw new PuzzleError('Challenge note must be a string of up to 1000 characters');
  }
  createPuzzle(c.def as PuzzleDef); // validates the definition, throws PuzzleError
  return {
    v: 1,
    title: c.title,
    def: c.def as PuzzleDef,
    algorithm: c.algorithm,
    targetExpanded: c.targetExpanded as number,
    requireAdmissible: c.requireAdmissible !== false,
    ...(c.note ? { note: c.note } : {}),
  };
}

/** Build the share URL for a challenge given the page URL (hash replaced). */
export function challengeUrl(pageUrl: string, c: Challenge): string {
  const base = pageUrl.split('#')[0];
  return `${base}#c=${encodeChallenge(c)}`;
}

/** Read a challenge from a URL hash, or null when there is none. */
export function challengeFromHash(hash: string): Challenge | null {
  const m = /^#?c=([A-Za-z0-9_-]+)$/.exec(hash.trim());
  if (!m) return null;
  return decodeChallenge(m[1]);
}

export interface ChallengeVerdict {
  beaten: boolean;
  reasons: string[];
}

export function judgeChallenge(c: Challenge, run: { expanded: number; found: boolean; algorithm: Algorithm; admissible: boolean | null }): ChallengeVerdict {
  const reasons: string[] = [];
  if (run.algorithm !== c.algorithm) reasons.push(`the challenge is for ${c.algorithm.toUpperCase()}, this run used ${run.algorithm.toUpperCase()}`);
  if (!run.found) reasons.push('the search did not reach the goal');
  if (run.expanded >= c.targetExpanded) reasons.push(`expanded ${run.expanded.toLocaleString()} nodes, target is fewer than ${c.targetExpanded.toLocaleString()}`);
  if (c.requireAdmissible) {
    if (run.admissible === null) reasons.push('run the heuristic check first (the challenge requires an admissible heuristic)');
    else if (!run.admissible) reasons.push('the heuristic overestimates somewhere, so it is not admissible');
  }
  return { beaten: reasons.length === 0, reasons };
}
