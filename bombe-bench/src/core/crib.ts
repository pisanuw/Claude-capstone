/**
 * Known-plaintext ("crib") tooling: where a crib can sit under the
 * ciphertext, the menu graph the Bombe is wired from, and the loops in it.
 */
import { N, chr, idx, normalizeText } from './enigma';

/** One position where the crib might sit under the ciphertext. */
export interface CribPlacement {
  offset: number;
  /** Indices (within the crib) where ciphertext letter equals crib letter. */
  clashes: number[];
  valid: boolean;
}

/** Slides the crib along the ciphertext; a position is impossible wherever a letter would encrypt to itself. */
export function cribPlacements(ciphertext: string, crib: string): CribPlacement[] {
  const ct = normalizeText(ciphertext);
  const cr = normalizeText(crib);
  const out: CribPlacement[] = [];
  if (!cr.length || cr.length > ct.length) return out;
  for (let offset = 0; offset + cr.length <= ct.length; offset++) {
    const clashes: number[] = [];
    for (let i = 0; i < cr.length; i++) if (ct[offset + i] === cr[i]) clashes.push(i);
    out.push({ offset, clashes, valid: clashes.length === 0 });
  }
  return out;
}

/** An edge of the menu: at relative position `i`, plaintext letter `a` enciphers to ciphertext letter `b`. */
export interface MenuEdge {
  a: number;
  b: number;
  /** Position within the crib (0-based); the Bombe's scrambler index. */
  i: number;
}

export interface Menu {
  edges: MenuEdge[];
  /** Letters that appear in the menu. */
  letters: number[];
  /** Degree of every letter 0-25. */
  degree: number[];
  /** Independent loops = E - V + components (the cycle rank). */
  loopCount: number;
  components: number[][];
  /** The letter the Bombe should test: most connected, ties broken toward loops. */
  testLetter: number;
  /** A cycle basis, each loop as a list of edges. */
  loops: MenuEdge[][];
  /** Letters per loop, in order. */
  loopLetters: number[][];
  /** The crib plaintext aligned with ciphertext, for display. */
  crib: string;
  cipher: string;
  offset: number;
}

/** Builds the menu for a crib at a given offset. */
export function buildMenu(ciphertext: string, crib: string, offset: number): Menu {
  const ct = normalizeText(ciphertext);
  const cr = normalizeText(crib);
  const cipher = ct.slice(offset, offset + cr.length);
  const edges: MenuEdge[] = [];
  for (let i = 0; i < cr.length; i++) edges.push({ a: idx(cr[i]), b: idx(cipher[i]), i });
  const degree = new Array<number>(N).fill(0);
  for (const e of edges) {
    degree[e.a]++;
    degree[e.b]++;
  }
  const letters: number[] = [];
  for (let l = 0; l < N; l++) if (degree[l] > 0) letters.push(l);
  const comp = components(edges, letters);
  const loopCount = Math.max(0, edges.length - letters.length + comp.length);
  const loops = cycleBasis(edges, letters);
  const inLoop = new Array<number>(N).fill(0);
  for (const loop of loops) for (const e of loop) {
    inLoop[e.a]++;
    inLoop[e.b]++;
  }
  let testLetter = letters[0] ?? 0;
  for (const l of letters) {
    const better = degree[l] > degree[testLetter] || (degree[l] === degree[testLetter] && inLoop[l] > inLoop[testLetter]);
    if (better) testLetter = l;
  }
  return {
    edges,
    letters,
    degree,
    loopCount,
    components: comp,
    testLetter,
    loops,
    loopLetters: loops.map(loopToLetters),
    crib: cr,
    cipher,
    offset,
  };
}

function components(edges: MenuEdge[], letters: number[]): number[][] {
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const e of edges) parent[find(e.a)] = find(e.b);
  const groups = new Map<number, number[]>();
  for (const l of letters) {
    const r = find(l);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(l);
  }
  return [...groups.values()].sort((x, y) => y.length - x.length);
}

/**
 * A fundamental cycle basis: grow a spanning forest by DFS; every non-tree
 * edge closes exactly one loop with the tree path between its ends. A
 * crib with the same letter pair at two positions is a 2-edge loop.
 */
function cycleBasis(edges: MenuEdge[], letters: number[]): MenuEdge[][] {
  const adj = new Map<number, { to: number; e: MenuEdge }[]>();
  for (const l of letters) adj.set(l, []);
  for (const e of edges) {
    adj.get(e.a)!.push({ to: e.b, e });
    adj.get(e.b)!.push({ to: e.a, e });
  }
  const parentEdge = new Map<number, MenuEdge | null>();
  const depth = new Map<number, number>();
  const treeEdges = new Set<MenuEdge>();
  for (const root of letters) {
    if (depth.has(root)) continue;
    depth.set(root, 0);
    parentEdge.set(root, null);
    const stack = [root];
    while (stack.length) {
      const v = stack.pop()!;
      for (const { to, e } of adj.get(v)!) {
        if (depth.has(to)) continue;
        depth.set(to, depth.get(v)! + 1);
        parentEdge.set(to, e);
        treeEdges.add(e);
        stack.push(to);
      }
    }
  }
  const loops: MenuEdge[][] = [];
  for (const e of edges) {
    if (treeEdges.has(e)) continue;
    // Walk both ends up to their common ancestor.
    const pathA: MenuEdge[] = [];
    const pathB: MenuEdge[] = [];
    let a = e.a;
    let b = e.b;
    while (a !== b) {
      if (depth.get(a)! >= depth.get(b)!) {
        const pe = parentEdge.get(a)!;
        pathA.push(pe);
        a = pe.a === a ? pe.b : pe.a;
      } else {
        const pe = parentEdge.get(b)!;
        pathB.push(pe);
        b = pe.a === b ? pe.b : pe.a;
      }
    }
    loops.push([e, ...pathB, ...pathA.reverse()]);
  }
  loops.sort((x, y) => x.length - y.length);
  return loops;
}

/** Orders the letters of a loop by walking its edges. */
export function loopToLetters(loop: MenuEdge[]): number[] {
  if (loop.length === 0) return [];
  if (loop.length === 1) return [loop[0].a, loop[0].b];
  const first = loop[0];
  const second = loop[1];
  let start = first.a;
  if (first.a === second.a || first.a === second.b) start = first.b;
  const out = [start];
  let cur = start;
  for (const e of loop) {
    cur = e.a === cur ? e.b : e.a;
    out.push(cur);
  }
  out.pop();
  return out;
}

export function describeLoop(letters: number[]): string {
  return letters.map(chr).join(' – ') + ' – ' + chr(letters[0]);
}
