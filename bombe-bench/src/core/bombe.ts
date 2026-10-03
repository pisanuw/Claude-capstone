/**
 * A Turing-Welchman Bombe in software.
 *
 * For every rotor order and every one of the 26^3 core positions it wires
 * the menu (one scrambler per crib position, each a copy of the rotor stack
 * advanced by that many steps) and tests the 26 hypotheses "test letter T is
 * plugged to a". A hypothesis implies plug settings for every letter it can
 * reach through the menu; Welchman's diagonal board adds "a plugged to b
 * means b plugged to a". If the implications ever reach T plugged to
 * something other than a, the hypothesis contradicts itself. A position
 * where every hypothesis is contradicted is rejected; anything else is a
 * "stop". Ring settings never enter: they only move the turnover point, and
 * the Bombe assumes the middle rotor does not turn over inside the crib.
 */
import { N, chr, idx, mod, ROTORS, REFLECTORS, allRotorOrders, type RotorName, type ReflectorName } from './enigma';
import type { Menu, MenuEdge } from './crib';

const N2 = N * N;

/** Rotor wiring at every offset: fwd[off*26 + c] and bwd[off*26 + c], for ring setting A. */
function rotorOffsets(name: RotorName): { fwd: Int8Array; bwd: Int8Array } {
  const w = ROTORS[name].wiring;
  const f = new Int8Array(N);
  const b = new Int8Array(N);
  for (let i = 0; i < N; i++) {
    f[i] = idx(w[i]);
    b[f[i]] = i;
  }
  const fwd = new Int8Array(N * N);
  const bwd = new Int8Array(N * N);
  for (let off = 0; off < N; off++) {
    for (let c = 0; c < N; c++) {
      fwd[off * N + c] = mod(f[mod(c + off)] - off);
      bwd[off * N + c] = mod(b[mod(c + off)] - off);
    }
  }
  return { fwd, bwd };
}

/** Scrambler table for one rotor order: perm[((l*26+m)*26+r)*26 + x], ring settings A. */
export function scramblerTable(rotors: [RotorName, RotorName, RotorName], reflector: ReflectorName): Int8Array {
  const [L, M, R] = rotors.map(rotorOffsets);
  const refl = new Int8Array(N);
  const rw = REFLECTORS[reflector];
  for (let i = 0; i < N; i++) refl[i] = idx(rw[i]);
  const table = new Int8Array(N * N * N * N);
  const inner = new Int8Array(N);
  for (let l = 0; l < N; l++) {
    const lo = l * N;
    for (let m = 0; m < N; m++) {
      const mo = m * N;
      // Middle rotor, left rotor, reflector and back: fixed while the right rotor turns.
      for (let c = 0; c < N; c++) inner[c] = M.bwd[mo + L.bwd[lo + refl[L.fwd[lo + M.fwd[mo + c]]]]];
      for (let r = 0; r < N; r++) {
        const ro = r * N;
        const base = ((l * N + m) * N + r) * N;
        for (let x = 0; x < N; x++) table[base + x] = R.bwd[ro + inner[R.fwd[ro + x]]];
      }
    }
  }
  return table;
}

/** The scramblers (one per crib index) for a single core position, as 26-entry arrays. */
export function scramblersAt(table: Int8Array, positions: string, length: number): Int8Array[] {
  const l = idx(positions[0]);
  const m = idx(positions[1]);
  const r = idx(positions[2]);
  const out: Int8Array[] = [];
  for (let i = 0; i < length; i++) {
    const base = ((l * N + m) * N + mod(r + i)) * N;
    out.push(table.subarray(base, base + N));
  }
  return out;
}

/** Compact menu adjacency: for letter x, neighbours adjTo[adjStart[x]..adjStart[x+1]) at crib index adjI[]. */
export interface MenuWiring {
  adjStart: Int32Array;
  adjTo: Int8Array;
  adjI: Int16Array;
  testLetter: number;
  letters: number[];
  components: number[][];
  edges: MenuEdge[];
}

export function wireMenu(menu: Menu, testLetter = menu.testLetter): MenuWiring {
  const lists: { to: number; i: number }[][] = Array.from({ length: N }, () => []);
  for (const e of menu.edges) {
    lists[e.a].push({ to: e.b, i: e.i });
    lists[e.b].push({ to: e.a, i: e.i });
  }
  const adjStart = new Int32Array(N + 1);
  let total = 0;
  for (let x = 0; x < N; x++) {
    adjStart[x] = total;
    total += lists[x].length;
  }
  adjStart[N] = total;
  const adjTo = new Int8Array(total);
  const adjI = new Int16Array(total);
  let k = 0;
  for (let x = 0; x < N; x++) for (const { to, i } of lists[x]) {
    adjTo[k] = to;
    adjI[k] = i;
    k++;
  }
  return { adjStart, adjTo, adjI, testLetter, letters: menu.letters, components: menu.components, edges: menu.edges };
}

export interface Hypothesis {
  /** The stecker partner assumed for the test letter. */
  stecker: number;
  /** Implied plug partner per letter (-1 = not implied by this component). */
  steckers: number[];
  /** Letters that received two different partners: the checking machine's objection. */
  contradictions: number[];
  /** How many crib letters the implied plugs reproduce. */
  cribMatches: number;
}

export interface Stop {
  rotors: [RotorName, RotorName, RotorName];
  /** Core window positions (ring setting A) while the first crib letter was enciphered. */
  positions: string;
  testLetter: number;
  /** Consistent hypotheses for the test letter, best first. */
  hypotheses: Hypothesis[];
  /** Number of other menu components that keep at least one consistent hypothesis. */
  otherComponentsOk: number;
  otherComponents: number;
  /** Passed the checking machine: no contradictions and every component survives. */
  checked: boolean;
}

export interface BombeOptions {
  menu: Menu;
  reflector: ReflectorName;
  rotorOrders?: [RotorName, RotorName, RotorName][];
  testLetter?: number;
  /** Stop collecting after this many stops (the search still counts them). */
  maxStops?: number;
}

export interface BombeRun {
  readonly total: number;
  readonly orders: [RotorName, RotorName, RotorName][];
  ordersDone: number;
  configsDone: number;
  stopCount: number;
  stops: Stop[];
  /** Processes one rotor order; returns false when nothing is left. */
  next(): boolean;
}

/** A loop through a test letter, as the crib indices of its edges in walking order. */
export type LoopPath = number[];

/** Loops of the menu that pass through `letter`, each rotated to start (and end) there. */
export function loopsThrough(menu: Menu, letter: number): LoopPath[] {
  const out: LoopPath[] = [];
  menu.loops.forEach((loop, li) => {
    const letters = menu.loopLetters[li];
    const k = letters.indexOf(letter);
    if (k < 0) return;
    // loopLetters[j] -> loopLetters[j+1] is edge loop[j].
    const path: number[] = [];
    for (let j = 0; j < loop.length; j++) path.push(loop[(k + j) % loop.length].i);
    out.push(path);
  });
  return out;
}

/** Scratch buffers shared across configurations so the inner loop allocates nothing. */
class Propagator {
  readonly visited = new Int32Array(N2);
  readonly queue = new Int16Array(N2);
  readonly adjRow: Int32Array;
  readonly rowAt: Int32Array;
  gen = 0;
  /** Generation floor for the current configuration: marks below it are stale. */
  genBase = 0;

  constructor(readonly wiring: MenuWiring, readonly cribLength: number) {
    this.adjRow = new Int32Array(wiring.adjI.length);
    this.rowAt = new Int32Array(cribLength);
  }

  beginConfig(): void {
    this.genBase = this.gen;
    if (this.gen > 2_000_000_000) {
      this.visited.fill(0);
      this.gen = 0;
      this.genBase = 0;
    }
  }

  /**
   * Tests every hypothesis for `T` at the core position `posIndex` (index of
   * (l, m, r) into the table). Returns the consistent stecker partners of T,
   * or an empty array when every one is contradicted.
   *
   * Loops through T are checked first: following a loop's scramblers around
   * from (T, a) must come back to a, so only fixed points of the composed
   * loop permutation can survive. That is Turing's original test; the
   * diagonal board then does the rest in the breadth-first propagation.
   */
  survivors(table: Int8Array, posIndex: number, T: number, loops: LoopPath[], out: number[]): number[] {
    out.length = 0;
    const { adjStart, adjTo, adjI } = this.wiring;
    const visited = this.visited;
    const queue = this.queue;
    const genBase = this.genBase;
    const r = posIndex % N;
    const lmBase = (posIndex - r) * N; // ((l*26+m)*26)*26
    const rowAt = this.rowAt;
    for (let i = 0; i < rowAt.length; i++) rowAt[i] = lmBase + ((r + i) % N) * N;
    const adjRow = this.adjRow;
    for (let k = 0; k < adjI.length; k++) adjRow[k] = rowAt[adjI[k]];
    for (let a = 0; a < N; a++) {
      let fixed = true;
      for (let li = 0; li < loops.length && fixed; li++) {
        const path = loops[li];
        let c = a;
        for (let j = 0; j < path.length; j++) c = table[rowAt[path[j]] + c];
        if (c !== a) fixed = false;
      }
      if (!fixed) continue;
      const start = T * N + a;
      if (visited[start] > genBase) continue; // reached from an earlier, refuted hypothesis
      const tag = ++this.gen; // unique per hypothesis; anything in (genBase, tag) was refuted
      visited[start] = tag;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      let refuted = false;
      while (head < tail && !refuted) {
        const node = queue[head++];
        const x = (node / N) | 0;
        const y = node - x * N;
        // Diagonal board: x plugged to y means y plugged to x.
        const diag = y * N + x;
        if (diag !== node && visited[diag] !== tag) {
          if (visited[diag] > genBase || y === T) {
            refuted = true;
            break;
          }
          visited[diag] = tag;
          queue[tail++] = diag;
        }
        for (let k = adjStart[x]; k < adjStart[x + 1]; k++) {
          const z = adjTo[k];
          const w = table[adjRow[k] + y];
          const next = z * N + w;
          if (visited[next] === tag) continue;
          if (visited[next] > genBase || (z === T && w !== a)) {
            refuted = true;
            break;
          }
          visited[next] = tag;
          queue[tail++] = next;
        }
      }
      if (!refuted) out.push(a);
    }
    return out;
  }
}

/**
 * Full closure of one hypothesis without early exit: the implied plug for
 * every reachable letter, plus the letters that got two partners.
 */
export function closure(scr: Int8Array[], wiring: MenuWiring, T: number, a: number): { steckers: number[]; contradictions: number[]; nodes: number[] } {
  const steckers = new Array<number>(N).fill(-1);
  const contradictions = new Set<number>();
  const seen = new Uint8Array(N2);
  const queue: number[] = [T * N + a];
  seen[T * N + a] = 1;
  const nodes: number[] = [];
  const { adjStart, adjTo, adjI } = wiring;
  while (queue.length) {
    const node = queue.shift()!;
    nodes.push(node);
    const x = (node / N) | 0;
    const y = node % N;
    if (steckers[x] === -1) steckers[x] = y;
    else if (steckers[x] !== y) contradictions.add(x);
    const diag = y * N + x;
    if (!seen[diag]) {
      seen[diag] = 1;
      queue.push(diag);
    }
    for (let k = adjStart[x]; k < adjStart[x + 1]; k++) {
      const next = adjTo[k] * N + scr[adjI[k]][y];
      if (!seen[next]) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return { steckers, contradictions: [...contradictions].sort((p, q) => p - q), nodes };
}

/** Counts crib letters reproduced by the scramblers plus the given plugs (unknown plugs = straight through). */
export function cribMatches(scr: Int8Array[], edges: MenuEdge[], steckers: number[]): number {
  let n = 0;
  for (const e of edges) {
    const sa = steckers[e.a] === -1 ? e.a : steckers[e.a];
    const out = scr[e.i][sa];
    const sb = steckers[out] === -1 ? out : steckers[out];
    if (sb === e.b) n++;
  }
  return n;
}

export function positionString(posIndex: number): string {
  const r = posIndex % N;
  const m = ((posIndex - r) / N) % N;
  const l = Math.floor(posIndex / N2);
  return chr(l) + chr(m) + chr(r);
}

export function createBombeRun(opts: BombeOptions): BombeRun {
  const orders = opts.rotorOrders ?? allRotorOrders();
  const T = opts.testLetter ?? opts.menu.testLetter;
  const wiring = wireMenu(opts.menu, T);
  const prop = new Propagator(wiring, opts.menu.crib.length);
  const loopsT = loopsThrough(opts.menu, T);
  const maxStops = opts.maxStops ?? 500;
  const otherComponents = opts.menu.components.filter((c) => !c.includes(T));
  const otherTests = otherComponents.map((c) => {
    let best = c[0];
    for (const l of c) if (opts.menu.degree[l] > opts.menu.degree[best]) best = l;
    return { letter: best, loops: loopsThrough(opts.menu, best) };
  });
  const surv: number[] = [];
  const run: BombeRun = {
    total: orders.length * N2 * N,
    orders,
    ordersDone: 0,
    configsDone: 0,
    stopCount: 0,
    stops: [],
    next(): boolean {
      if (run.ordersDone >= orders.length) return false;
      const rotors = orders[run.ordersDone];
      const table = scramblerTable(rotors, opts.reflector);
      for (let p = 0; p < N2 * N; p++) {
        prop.beginConfig();
        prop.survivors(table, p, T, loopsT, surv);
        if (surv.length === 0) continue;
        run.stopCount++;
        if (run.stops.length >= maxStops) continue;
        const positions = positionString(p);
        const scr = scramblersAt(table, positions, opts.menu.crib.length);
        const hypotheses: Hypothesis[] = surv.map((a) => {
          const c = closure(scr, wiring, T, a);
          return { stecker: a, steckers: c.steckers, contradictions: c.contradictions, cribMatches: cribMatches(scr, wiring.edges, c.steckers) };
        });
        hypotheses.sort((h1, h2) => h1.contradictions.length - h2.contradictions.length || h2.cribMatches - h1.cribMatches);
        let otherOk = 0;
        for (const t of otherTests) {
          prop.beginConfig();
          const others = prop.survivors(table, p, t.letter, t.loops, []);
          if (others.length === 0) continue;
          otherOk++;
          // A component with a single survivor pins its plugs too; merge them into the best hypothesis.
          if (others.length === 1) {
            const c = closure(scr, wireMenu(opts.menu, t.letter), t.letter, others[0]);
            const best = hypotheses[0];
            for (let x = 0; x < N; x++) if (best.steckers[x] === -1 && c.steckers[x] !== -1 && !c.contradictions.includes(x)) best.steckers[x] = c.steckers[x];
            best.cribMatches = cribMatches(scr, wiring.edges, best.steckers);
          }
        }
        const checked = hypotheses[0].contradictions.length === 0 && otherOk === otherTests.length;
        run.stops.push({ rotors, positions, testLetter: T, hypotheses, otherComponentsOk: otherOk, otherComponents: otherTests.length, checked });
      }
      run.ordersDone++;
      run.configsDone = run.ordersDone * N2 * N;
      return run.ordersDone < orders.length;
    },
  };
  return run;
}

/** Runs the whole search synchronously (tests and small searches). */
export function runBombe(opts: BombeOptions): BombeRun {
  const run = createBombeRun(opts);
  while (run.next()) {
    /* keep going */
  }
  return run;
}

export function sortStops(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? -1 : 1;
    const ca = a.hypotheses[0].contradictions.length - b.hypotheses[0].contradictions.length;
    if (ca) return ca;
    return b.hypotheses[0].cribMatches - a.hypotheses[0].cribMatches;
  });
}

/** One implication in a traced hypothesis. */
export interface TraceStep {
  from: number; // node = letter*26 + stecker
  to: number;
  via: 'diagonal' | 'edge';
  edge?: MenuEdge;
  /** The step that produced the contradiction, if any. */
  contradiction: boolean;
}

export interface HypothesisTrace {
  testLetter: number;
  stecker: number;
  steps: TraceStep[];
  refuted: boolean;
  /** Test-register letters lit at the end (how many of the 26 lamps). */
  lit: number[];
}

/**
 * Traces the implications of one hypothesis in order, stopping at the first
 * contradiction, for the "watch a loop kill a hypothesis" view. Diagonal
 * board on by default; off shows why Turing's original Bombe needed loops.
 */
export function traceHypothesis(scr: Int8Array[], wiring: MenuWiring, T: number, a: number, diagonal = true): HypothesisTrace {
  const seen = new Uint8Array(N2);
  const start = T * N + a;
  seen[start] = 1;
  const queue = [start];
  const steps: TraceStep[] = [];
  const lit = new Set<number>([a]);
  let refuted = false;
  const { adjStart, adjTo, adjI, edges } = wiring;
  outer: while (queue.length) {
    const node = queue.shift()!;
    const x = (node / N) | 0;
    const y = node % N;
    if (diagonal) {
      const diag = y * N + x;
      if (!seen[diag]) {
        seen[diag] = 1;
        const bad = y === T && x !== a;
        steps.push({ from: node, to: diag, via: 'diagonal', contradiction: bad });
        if (y === T) lit.add(x);
        if (bad) {
          refuted = true;
          break;
        }
        queue.push(diag);
      }
    }
    for (let k = adjStart[x]; k < adjStart[x + 1]; k++) {
      const z = adjTo[k];
      const i = adjI[k];
      const w = scr[i][y];
      const next = z * N + w;
      if (seen[next]) continue;
      seen[next] = 1;
      const edge = edges.find((e) => e.i === i)!;
      const bad = z === T && w !== a;
      steps.push({ from: node, to: next, via: 'edge', edge, contradiction: bad });
      if (z === T) lit.add(w);
      if (bad) {
        refuted = true;
        break outer;
      }
      queue.push(next);
    }
  }
  return { testLetter: T, stecker: a, steps, refuted, lit: [...lit].sort((p, q) => p - q) };
}

export function nodeLabel(node: number): string {
  return chr((node / N) | 0) + '→' + chr(node % N);
}
