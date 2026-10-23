// Schedules: every way the kernel could interleave the processes' events.
//
// Happens-before is simple here: a process's events run in program order, a
// child's first event comes after its parent's fork, and a wait() completes
// only after the child it reaps has exited. Output is the only thing anyone
// can observe, so the search branches only on which ready process writes
// next. Forks, exits and satisfiable waits are run eagerly as soon as they
// are enabled: they are invisible and only ever enable more steps, so doing
// them early loses no output (a simple partial-order reduction). States are
// memoised on (event counters, reaped children).

import type { Ev, OutEvent, Proc, RunResult } from './interp';

export interface State {
  pc: number[];
  reaped: boolean[];
}

/** Thrown when a program has too many distinct states to search. */
export class TooManyStates extends Error {
  constructor(readonly limit: number) {
    super(`more than ${limit.toLocaleString()} search steps: shrink the loop bounds`);
  }
}

/** Search budget: memoised states, and set insertions while merging outputs. */
export const MAX_STATES = 50_000;
const WORK_PER_STATE = 40;

interface Canon {
  ids: Map<string, number>;
  sigs: Map<string, number>;
  ordered: boolean[];
}

const canonCache = new WeakMap<RunResult, Canon>();

function canon(run: RunResult): Canon {
  let c = canonCache.get(run);
  if (!c) {
    c = {
      ids: new Map(),
      sigs: new Map(),
      // A process that waits for a specific child keeps its children in order.
      ordered: run.procs.map((p) => p.events.some((e) => e.kind === 'wait' && e.target !== null)),
    };
    canonCache.set(run, c);
  }
  return c;
}

/** Interned id of process i's remaining behaviour from event pc on, with forked children inlined. */
function sig(run: RunResult, i: number, pc: number): number {
  const c = canon(run);
  const k = i + ':' + pc;
  const hit = c.sigs.get(k);
  if (hit !== undefined) return hit;
  const p = run.procs[i] as Proc;
  const parts: string[] = [c.ordered[i] ? 'O' : 'U'];
  for (let j = pc; j < p.events.length; j++) {
    const e = p.events[j] as Ev;
    if (e.kind === 'out') parts.push('o' + JSON.stringify(e.text));
    else if (e.kind === 'fork') parts.push('f' + sig(run, e.child, 0));
    else if (e.kind === 'wait') parts.push(e.target === null ? 'w' : 'w' + p.children.indexOf(e.target));
    else parts.push('e');
  }
  const str = parts.join(' ');
  let id = c.ids.get(str);
  if (id === undefined) {
    id = c.ids.size;
    c.ids.set(str, id);
  }
  c.sigs.set(k, id);
  return id;
}

/** Does process i have a wait at or after event pc? */
function waitsFrom(run: RunResult, i: number, pc: number): boolean {
  const evs = (run.procs[i] as Proc).events;
  for (let j = pc; j < evs.length; j++) if ((evs[j] as Ev).kind === 'wait') return true;
  return false;
}

/**
 * Canonical key for a state: two states with the same key print the same
 * set of futures. Each live process is its remaining behaviour plus the
 * canonical forms of its children; children of a finished process are
 * orphans, and so are children of a parent that never waits again, so they
 * move to the top level; unreaped children of a waiting parent count only
 * as "exited". Siblings are sorted unless their parent
 * waits for a specific one, which is what makes 16 copies of the same loop
 * body collapse into a handful of states.
 */
function stateKey(run: RunResult, s: State): string {
  const top: string[] = [];
  const visit = (i: number): string | null => {
    const p = run.procs[i] as Proc;
    const kids: string[] = [];
    for (const ch of p.children) {
      if (!exists(run, s, ch)) {
        kids.push('u');
        continue;
      }
      const node = visit(ch);
      kids.push(node ?? 'r');
    }
    const ordered = canon(run).ordered[i] as boolean;
    if (finished(run, s, i) || !waitsFrom(run, i, s.pc[i] as number)) {
      // Nobody will wait for these children through this process: they are independent.
      for (const k of kids) if (k !== 'u' && k !== 'r' && k !== 'Z') top.push(k);
      if (!finished(run, s, i)) return sig(run, i, s.pc[i] as number) + '[]';
      const parentAlive = p.parent !== null && !finished(run, s, p.parent);
      const parentWaits = parentAlive && waitsFrom(run, p.parent as number, s.pc[p.parent as number] as number);
      return !s.reaped[i] && parentWaits ? 'Z' : null;
    }
    const list = ordered ? kids : kids.filter((k) => k !== 'u' && k !== 'r').sort();
    return sig(run, i, s.pc[i] as number) + '[' + list.join(',') + ']';
  };
  const root = visit(0);
  if (root) top.push(root);
  return top.sort().join(';');
}

export function initialState(run: RunResult): State {
  return { pc: run.procs.map(() => 0), reaped: run.procs.map(() => false) };
}

const clone = (s: State): State => ({ pc: [...s.pc], reaped: [...s.reaped] });

const forkIndexCache = new WeakMap<RunResult, number[]>();

/** For each process, the index of the fork event in its parent that creates it (-1 for the root). */
function forkIndex(run: RunResult): number[] {
  let fi = forkIndexCache.get(run);
  if (!fi) {
    fi = run.procs.map((p, i) =>
      p.parent === null ? -1 : (run.procs[p.parent] as Proc).events.findIndex((e) => e.kind === 'fork' && e.child === i),
    );
    forkIndexCache.set(run, fi);
  }
  return fi;
}

export function exists(run: RunResult, s: State, i: number): boolean {
  const p = run.procs[i] as Proc;
  return p.parent === null || (s.pc[p.parent] as number) > (forkIndex(run)[i] as number);
}

export const finished = (run: RunResult, s: State, i: number) =>
  (s.pc[i] as number) >= (run.procs[i] as Proc).events.length;

export function nextEvent(run: RunResult, s: State, i: number): Ev | undefined {
  return (run.procs[i] as Proc).events[s.pc[i] as number];
}

/** The child a wait at the head of process i would reap now, or -1 if it must block. */
export function waitTarget(run: RunResult, s: State, i: number): number {
  const e = nextEvent(run, s, i);
  /* c8 ignore next */
  if (!e || e.kind !== 'wait') return -1;
  if (e.target !== null) return finished(run, s, e.target) && !s.reaped[e.target] ? e.target : -1;
  for (const c of (run.procs[i] as Proc).children) {
    if (exists(run, s, c) && finished(run, s, c) && !s.reaped[c]) return c;
  }
  return -1;
}

/** Is process i's next event runnable in state s? */
export function enabled(run: RunResult, s: State, i: number): boolean {
  if (!exists(run, s, i) || finished(run, s, i)) return false;
  const e = nextEvent(run, s, i) as Ev;
  return e.kind !== 'wait' || waitTarget(run, s, i) >= 0;
}

/** Runs process i's next event (which must be enabled) in place. */
export function step(run: RunResult, s: State, i: number): Ev {
  const e = nextEvent(run, s, i) as Ev;
  if (e.kind === 'wait') s.reaped[waitTarget(run, s, i)] = true;
  s.pc[i] = (s.pc[i] as number) + 1;
  return e;
}

/** Runs every enabled invisible event until only writes (or nothing) remain. */
function closeInternal(run: RunResult, s: State): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < run.procs.length; i++) {
      while (enabled(run, s, i) && (nextEvent(run, s, i) as Ev).kind !== 'out') {
        step(run, s, i);
        changed = true;
      }
    }
  }
}

function writers(run: RunResult, s: State): number[] {
  const out: number[] = [];
  for (let i = 0; i < run.procs.length; i++) {
    if (enabled(run, s, i)) out.push(i);
  }
  return out;
}

const allDone = (run: RunResult, s: State) => run.procs.every((_, i) => finished(run, s, i));

export interface Enumeration {
  outputs: string[];
  /** True when the cap was hit and `outputs` is only a sample. */
  truncated: boolean;
  /** Number of distinct orders of the write events (schedules that differ in output order). */
  schedules: bigint;
  states: number;
}

export function enumerate(run: RunResult, cap = 2000, maxStates = MAX_STATES): Enumeration {
  const memo = new Map<string, { set: Set<string>; truncated: boolean; count: bigint }>();
  let work = 0;
  const visit = (s: State): { set: Set<string>; truncated: boolean; count: bigint } => {
    closeInternal(run, s);
    const k = stateKey(run, s);
    const hit = memo.get(k);
    if (hit) return hit;
    const ws = writers(run, s);
    let res: { set: Set<string>; truncated: boolean; count: bigint };
    if (ws.length === 0) {
      /* c8 ignore next 3 */
      if (!allDone(run, s)) throw new Error('deadlock: no process can run');
      res = { set: new Set(['']), truncated: false, count: 1n };
    } else {
      const set = new Set<string>();
      let truncated = false;
      let count = 0n;
      for (const i of ws) {
        const n = clone(s);
        const e = step(run, n, i) as OutEvent;
        const sub = visit(n);
        count += sub.count;
        truncated ||= sub.truncated;
        work += Math.min(sub.set.size, cap) + 1;
        if (work > maxStates * WORK_PER_STATE) throw new TooManyStates(maxStates * WORK_PER_STATE);
        for (const suffix of sub.set) {
          if (set.size >= cap) {
            truncated = true;
            break;
          }
          set.add(e.text + suffix);
        }
      }
      res = { set, truncated, count };
    }
    if (memo.size >= maxStates) throw new TooManyStates(maxStates * WORK_PER_STATE);
    memo.set(k, res);
    return res;
  };
  const root = visit(initialState(run));
  return { outputs: [...root.set].sort(), truncated: root.truncated, schedules: root.count, states: memo.size };
}

/** Every write event, in process order: the chunks every run prints exactly once. */
export function allChunks(run: RunResult): { proc: number; ev: OutEvent; idx: number }[] {
  const out: { proc: number; ev: OutEvent; idx: number }[] = [];
  run.procs.forEach((p, proc) =>
    p.events.forEach((ev, idx) => {
      if (ev.kind === 'out') out.push({ proc, ev, idx });
    }),
  );
  return out;
}

export interface Witness {
  /** Characters of the target matched by the best schedule found. */
  matched: number;
  /** The chunks that schedule wrote, in order. */
  chunks: { proc: number; text: string; line: number }[];
  /** State at the point the schedule could go no further. */
  state: State;
}

/** Longest prefix of `target` that some schedule prints, with a witness. Exact (not capped). */
export function bestPrefix(run: RunResult, target: string, maxStates = MAX_STATES): Witness {
  // Score = 2 * characters matched, plus 1 when that leaves every process finished.
  const memo = new Map<string, number>();
  const best = (s: State, pos: number): number => {
    closeInternal(run, s);
    const k = stateKey(run, s) + '@' + pos;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let m = 2 * pos + (pos === target.length && allDone(run, s) ? 1 : 0);
    for (const i of writers(run, s)) {
      const e = nextEvent(run, s, i) as OutEvent;
      if (!target.startsWith(e.text, pos)) continue;
      const n = clone(s);
      step(run, n, i);
      m = Math.max(m, best(n, pos + e.text.length));
      if (m === 2 * target.length + 1) break;
    }
    if (memo.size >= maxStates) throw new TooManyStates(maxStates);
    memo.set(k, m);
    return m;
  };
  // Reconstruct one schedule that reaches the best score.
  const s = initialState(run);
  const goal = best(clone(s), 0);
  let pos = 0;
  const chunks: Witness['chunks'] = [];
  closeInternal(run, s);
  while (2 * pos < goal - 1) {
    let moved = false;
    for (const i of writers(run, s)) {
      const e = nextEvent(run, s, i) as OutEvent;
      if (!target.startsWith(e.text, pos)) continue;
      const n = clone(s);
      step(run, n, i);
      if (best(clone(n), pos + e.text.length) === goal) {
        step(run, s, i);
        closeInternal(run, s);
        chunks.push({ proc: i, text: e.text, line: e.line });
        pos += e.text.length;
        moved = true;
        break;
      }
    }
    /* c8 ignore next */
    if (!moved) break;
  }
  return { matched: pos, chunks, state: s };
}

export function isPossible(run: RunResult, target: string): boolean {
  const w = bestPrefix(run, target);
  return w.matched === target.length && allDone(run, w.state);
}

// ---- explanations ----

export const pidOf = (run: RunResult, i: number) => (run.procs[i] as Proc).pid;

export function show(text: string): string {
  return '"' + text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
}

/**
 * Why can't process i's event idx run yet? Follows the chain of unmet
 * happens-before edges back to the first write that has to come first.
 */
export function blocker(run: RunResult, s: State, i: number, idx: number, depth = 0): string {
  const p = run.procs[i] as Proc;
  const pid = p.pid;
  /* c8 ignore next */
  if (depth > 20) return `pid ${pid} is blocked`;
  if (!exists(run, s, i)) {
    const parent = p.parent as number;
    const pp = run.procs[parent] as Proc;
    const fi = pp.events.findIndex((e) => e.kind === 'fork' && e.child === i);
    const pending = firstPendingOut(run, s, parent, fi);
    const forked = `pid ${pid} does not exist until pid ${pp.pid} forks it at line ${p.forkLine}`;
    if (pending) {
      return `${forked}, and pid ${pp.pid} first prints ${show(pending.text)} (line ${pending.line}).`;
    }
    return `${forked}; ${lower(blocker(run, s, parent, fi, depth + 1))}`;
  }
  const pending = firstPendingOut(run, s, i, idx);
  if (pending) {
    return `pid ${pid} prints ${show(pending.text)} (line ${pending.line}) before that: program order within one process.`;
  }
  const head = nextEvent(run, s, i) as Ev;
  if (head.kind === 'wait') {
    const kids =
      head.target !== null ? [head.target] : p.children.filter((c) => !s.reaped[c] && !finished(run, s, c));
    const parts = kids.map((c) => {
      const out = firstPendingOut(run, s, c, (run.procs[c] as Proc).events.length);
      return out
        ? `pid ${pidOf(run, c)} still has to print ${show(out.text)} (line ${out.line})`
        : lower(blocker(run, s, c, (run.procs[c] as Proc).events.length - 1, depth + 1));
    });
    const which = head.target !== null ? `pid ${pidOf(run, head.target)} exits` : 'one of its children exits';
    return `pid ${pid} is blocked in wait() at line ${head.line} until ${which}, and ${parts.join(' and ')}`.replace(
      /\.?$/,
      '.',
    );
  }
  /* c8 ignore next */
  return `pid ${pid} cannot run yet.`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** First write of process i that has not happened yet and comes before event `before`. */
function firstPendingOut(run: RunResult, s: State, i: number, before: number): OutEvent | null {
  const evs = (run.procs[i] as Proc).events;
  for (let k = s.pc[i] as number; k < before && k < evs.length; k++) {
    const e = evs[k] as Ev;
    if (e.kind === 'out') return e;
  }
  return null;
}

export interface Verdict {
  possible: boolean;
  reasons: string[];
  witness: Witness;
}

function charCounts(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of s) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/** Normalises a typed answer: CRLF to LF, and the literal two characters \n to a newline. */
export function normaliseAnswer(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function check(run: RunResult, target: string): Verdict {
  const witness = bestPrefix(run, target);
  if (witness.matched === target.length && allDone(run, witness.state)) {
    return { possible: true, reasons: [], witness };
  }
  const reasons: string[] = [];
  const chunks = allChunks(run);
  const total = chunks.map((c) => c.ev.text).join('');
  // Every run prints every chunk exactly once, so the characters are fixed.
  const want = charCounts(total);
  const got = charCounts(target);
  const diffs: string[] = [];
  for (const c of new Set([...want.keys(), ...got.keys()])) {
    const w = want.get(c) ?? 0;
    const g = got.get(c) ?? 0;
    if (w !== g) diffs.push(`${show(c)} appears ${w} time${w === 1 ? '' : 's'} in every run but ${g} in yours`);
  }
  if (diffs.length) {
    reasons.push(
      `Every run prints the same ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} (${total.length} characters), only in different orders: ${diffs.slice(0, 4).join('; ')}.`,
    );
    return { possible: false, reasons, witness };
  }
  const s = witness.state;
  const rest = target.slice(witness.matched);
  const prefix =
    witness.matched > 0 ? `Some schedule prints the first ${witness.matched} characters ${show(target.slice(0, witness.matched))}, but none can continue with ${show(rest.slice(0, 12))}.` : `No schedule can start with ${show(rest.slice(0, 12))}.`;
  reasons.push(prefix);
  // Pending writes that would fit the next characters of the answer.
  const fits: { proc: number; idx: number; ev: OutEvent }[] = [];
  const partial: OutEvent[] = [];
  run.procs.forEach((p, proc) => {
    for (let idx = s.pc[proc] as number; idx < p.events.length; idx++) {
      const ev = p.events[idx] as Ev;
      if (ev.kind !== 'out') continue;
      if (rest.startsWith(ev.text)) fits.push({ proc, idx, ev });
      else if (ev.text.startsWith(rest) || (rest.length > 0 && ev.text.startsWith(rest[0] as string) && !rest.startsWith(ev.text))) {
        partial.push(ev);
      }
    }
  });
  const seen = new Set<string>();
  for (const f of fits) {
    const r = `${show(f.ev.text)} (pid ${pidOf(run, f.proc)}, line ${f.ev.line}) cannot come next: ${lower(blocker(run, s, f.proc, f.idx))}`;
    if (!seen.has(r)) reasons.push(r);
    seen.add(r);
    if (seen.size >= 3) break;
  }
  if (!fits.length && partial.length) {
    const e = partial[0] as OutEvent;
    reasons.push(
      `The next pending write is ${show(e.text)} (line ${e.line}), and each write lands in one piece: output from another process cannot appear in the middle of it.`,
    );
  }
  if (!fits.length && !partial.length) {
    reasons.push(`No pending write starts with ${show(rest.slice(0, 1))} at this point.`);
  }
  return { possible: false, reasons, witness };
}

// ---- one concrete schedule, for the animation ----

export type Policy = 'parent' | 'child' | 'random';

export type ProcStatus = 'unborn' | 'ready' | 'blocked' | 'zombie' | 'reaped' | 'orphan';

export interface Frame {
  proc: number;
  ev: Ev;
  output: string;
  status: ProcStatus[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function statuses(run: RunResult, s: State): ProcStatus[] {
  return run.procs.map((p, i) => {
    if (!exists(run, s, i)) return 'unborn';
    const parentGone = p.parent !== null && finished(run, s, p.parent);
    if (finished(run, s, i)) {
      // init reaps orphans at once; the shell reaps the root.
      if (p.parent === null || s.reaped[i] || parentGone) return 'reaped';
      return 'zombie';
    }
    if (parentGone) return 'orphan';
    return enabled(run, s, i) ? 'ready' : 'blocked';
  });
}

export function simulate(run: RunResult, policy: Policy, seed = 1): Frame[] {
  const rand = mulberry32(seed);
  const s = initialState(run);
  const frames: Frame[] = [];
  let output = '';
  for (;;) {
    const ready = run.procs.map((_, i) => i).filter((i) => enabled(run, s, i));
    if (!ready.length) break;
    const i =
      policy === 'parent'
        ? (ready[0] as number)
        : policy === 'child'
          ? (ready[ready.length - 1] as number)
          : (ready[Math.floor(rand() * ready.length)] as number);
    const ev = step(run, s, i);
    if (ev.kind === 'out') output += ev.text;
    frames.push({ proc: i, ev, output, status: statuses(run, s) });
  }
  return frames;
}
