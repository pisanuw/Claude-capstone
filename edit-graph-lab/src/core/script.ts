// Shared vocabulary for every diff algorithm in the lab.
//
// Coordinates follow the edit graph: x indexes the old text A (a step right
// deletes A[x]), y indexes the new text B (a step down inserts B[y]) and a
// diagonal step keeps a token that is equal in both.

export type Mode = 'line' | 'char';

export type Op =
  | { type: 'eq'; a: number; b: number }
  | { type: 'del'; a: number }
  | { type: 'ins'; b: number };

export type Script = Op[];

export interface Point {
  x: number;
  y: number;
}

/** Largest input (tokens per side) the lab will diff; keeps the O(N*M) views responsive. */
export const MAX_TOKENS = 600;

export function tokenize(text: string, mode: Mode): string[] {
  if (mode === 'char') return Array.from(text);
  if (text === '') return [];
  const lines = text.split('\n');
  // A trailing newline terminates the last line rather than starting an empty one.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Number of insertions plus deletions: the path length the algorithms minimise. */
export function distance(script: Script): number {
  return script.reduce((n, op) => n + (op.type === 'eq' ? 0 : 1), 0);
}

export function matches(script: Script): number {
  return script.length - distance(script);
}

/** Replays a script against A, returning the text it claims B is. Throws if the script is inconsistent. */
export function apply(script: Script, a: string[], b: string[]): string[] {
  const out: string[] = [];
  let x = 0;
  let y = 0;
  for (const op of script) {
    if (op.type === 'eq') {
      if (op.a !== x || op.b !== y || a[x] !== b[y]) throw new Error(`bad match at (${x},${y})`);
      out.push(a[x] as string);
      x++;
      y++;
    } else if (op.type === 'del') {
      if (op.a !== x) throw new Error(`bad delete at ${x}`);
      x++;
    } else {
      if (op.b !== y) throw new Error(`bad insert at ${y}`);
      out.push(b[y] as string);
      y++;
    }
  }
  if (x !== a.length || y !== b.length) throw new Error('script does not cover both inputs');
  return out;
}

/** The lattice points visited by a script, starting at (0,0) and ending at (N,M). */
export function pathOf(script: Script): Point[] {
  const pts: Point[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const op of script) {
    if (op.type !== 'ins') x++;
    if (op.type !== 'del') y++;
    pts.push({ x, y });
  }
  return pts;
}

/** Appends `count` equal tokens starting at (a, b). */
export function pushEq(script: Script, a: number, b: number, count: number): void {
  for (let i = 0; i < count; i++) script.push({ type: 'eq', a: a + i, b: b + i });
}

/** Deletes A[a0..a1) then inserts B[b0..b1): the usual way to fill a region with no matches. */
export function pushReplace(script: Script, a0: number, a1: number, b0: number, b1: number): void {
  for (let i = a0; i < a1; i++) script.push({ type: 'del', a: i });
  for (let j = b0; j < b1; j++) script.push({ type: 'ins', b: j });
}

/** Set of "a:b" pairs a script keeps, for comparing which tokens two algorithms aligned. */
export function matchedPairs(script: Script): Set<string> {
  const s = new Set<string>();
  for (const op of script) if (op.type === 'eq') s.add(`${op.a}:${op.b}`);
  return s;
}
