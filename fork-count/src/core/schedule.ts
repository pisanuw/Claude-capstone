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
//
// Pipes add two edges: a read comes after the write whose bytes it returns,
// and a read that returns end of file comes after every process holding the
// write end has closed it or exited. Pipe writes, reads and closes are
// invisible too and only ever enable more steps (each pipe has one reader),
// so they run eagerly as well. A state where nothing can run but some process
// has not finished is a deadlock: its output ends in HANG.

import type { Ev, OutEvent, Proc, ReadEvent, RunResult } from './interp';

/** Marks the end of an output after which the program hangs (a deadlock). */
export const HANG = '\u{E000}';

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
    else if (e.kind === 'exit') parts.push('e');
    /* c8 ignore next */ else parts.push(e.kind); // pipe events: stateKey does not use sig() for those programs
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
  // Pipes tie particular processes together, so there is no symmetry to exploit.
  if (run.pipes.length) return s.pc.join(',') + '|' + s.reaped.map((r) => (r ? 1 : 0)).join('');
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

/** Processes still holding the write end of a pipe in state s. */
export function writeHolders(run: RunResult, s: State, pipe: number): number[] {
  return run.procs.flatMap((p, i) => {
    const at = p.writeEnds.get(pipe);
    if (at === undefined) return [];
    return exists(run, s, i) && (s.pc[i] as number) > at ? [] : [i];
  });
}

/** Can this read return now? */
export function readReady(run: RunResult, s: State, e: ReadEvent): boolean {
  if (e.forever) return false;
  if (e.eof) return writeHolders(run, s, e.pipe).length === 0;
  const w = run.pipes[e.pipe]?.writes[e.seq];
  return w !== undefined && (s.pc[w.proc] as number) > w.idx;
}

/** Is process i's next event runnable in state s? */
export function enabled(run: RunResult, s: State, i: number): boolean {
  if (!exists(run, s, i) || finished(run, s, i)) return false;
  const e = nextEvent(run, s, i) as Ev;
  if (e.kind === 'read') return readReady(run, s, e);
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
  /** Distinct outputs; one that ends in HANG is followed by a deadlock. */
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
      res = { set: new Set([allDone(run, s) ? '' : HANG]), truncated: false, count: 1n };
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
  // Score = 2 * characters matched, plus 1 when that leaves nothing able to run (finished or deadlocked).
  const memo = new Map<string, number>();
  const best = (s: State, pos: number): number => {
    closeInternal(run, s);
    const k = stateKey(run, s) + '@' + pos;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let m = 2 * pos + (pos === target.length && writers(run, s).length === 0 ? 1 : 0);
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

/** Can some schedule print exactly `target` (and then finish, or hang)? */
export function isPossible(run: RunResult, target: string): boolean {
  const w = bestPrefix(run, target);
  return w.matched === target.length && writers(run, w.state).length === 0;
}

/** Some schedule that deadlocks: the state it gets stuck in and what it printed. Null if every schedule finishes. */
export function findHang(run: RunResult, maxStates = MAX_STATES): { state: State; output: string } | null {
  if (!run.pipes.length && !run.procs.some((p) => p.blocked)) return null;
  const seen = new Set<string>();
  const go = (s: State, output: string): { state: State; output: string } | null => {
    closeInternal(run, s);
    const k = stateKey(run, s);
    if (seen.has(k)) return null;
    if (seen.size >= maxStates) throw new TooManyStates(maxStates);
    seen.add(k);
    const ws = writers(run, s);
    if (!ws.length) return allDone(run, s) ? null : { state: s, output };
    for (const i of ws) {
      const n = clone(s);
      const e = step(run, n, i) as OutEvent;
      const found = go(n, output + e.text);
      if (found) return found;
    }
    return null;
  };
  return go(initialState(run), '');
}

/** One sentence per process that is stuck in a deadlocked state. */
export function stuckReasons(run: RunResult, s: State): string[] {
  const stuck = run.procs.flatMap((_, i) => (exists(run, s, i) && !finished(run, s, i) ? [i] : []));
  return stuck.map((i) => {
    const head = nextEvent(run, s, i) as Ev;
    if (head.kind === 'wait') {
      // Its children are stuck too and get their own sentence.
      return `pid ${pidOf(run, i)} is blocked in wait() at line ${head.line} for a child that never exits.`;
    }
    return blocker(run, s, i, s.pc[i] as number);
  });
}

// ---- explanations ----

export const pidOf = (run: RunResult, i: number) => (run.procs[i] as Proc).pid;

export function show(text: string): string {
  return (
    '"' +
    text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\xff]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')) +
    '"'
  );
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
  if (head.kind === 'read') return readBlocker(run, s, i, head, depth);
  /* c8 ignore next */
  return `pid ${pid} cannot run yet.`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Why a read at the head of process i cannot return yet. */
function readBlocker(run: RunResult, s: State, i: number, head: ReadEvent, depth: number): string {
  const pid = pidOf(run, i);
  const pipe = run.pipes[head.pipe] as RunResult['pipes'][number];
  const where = `pid ${pid} is blocked in read() at line ${head.line}`;
  const w = pipe.writes[head.seq];
  if (!head.eof && w) {
    const data = ((run.procs[w.proc] as Proc).events[w.idx] as Extract<Ev, { kind: 'pwrite' }>).text;
    const until = `${where} until pid ${pidOf(run, w.proc)} writes ${show(data)} into the pipe (line ${(run.procs[w.proc] as Proc).events[w.idx]?.line})`;
    const pending = firstPendingOut(run, s, w.proc, w.idx);
    if (pending) return `${until}, and pid ${pidOf(run, w.proc)} first prints ${show(pending.text)} (line ${pending.line}).`;
    if (!exists(run, s, w.proc) || !enabled(run, s, w.proc)) {
      return `${until}; ${lower(blocker(run, s, w.proc, w.idx, depth + 1))}`;
    }
    /* c8 ignore next */
    return `${until}.`;
  }
  // Waiting for end of file (or for data that never comes): every write end must be closed first.
  const holders = writeHolders(run, s, pipe.id);
  const parts = holders.map((h) => {
    const at = (run.procs[h] as Proc).writeEnds.get(pipe.id) as number;
    const who = h === i ? `pid ${pid} itself` : `pid ${pidOf(run, h)}`;
    let tail: string;
    if (at === Infinity) tail = 'never closes it';
    else {
      const ev = (run.procs[h] as Proc).events[at] as Ev;
      tail = ev.kind === 'exit' ? 'keeps it until it exits' : `closes it at line ${ev.line}`;
    }
    const stuck = h !== i && exists(run, s, h) && !finished(run, s, h) && !enabled(run, s, h);
    const head2 = stuck ? nextEvent(run, s, h) : undefined;
    const also = head2 && (head2.kind === 'read' || head2.kind === 'wait') ? `, and is itself blocked in ${head2.kind}() at line ${head2.line}` : '';
    return `${who} still holds a write end (and ${tail}${also})`;
  });
  const lead = head.forever
    ? `${where}: no more data will arrive, and read() only returns 0 (end of file) once every write end of the pipe from line ${pipe.line} is closed`
    : `${where} until every write end of the pipe from line ${pipe.line} is closed`;
  return `${lead}, but ${parts.join('; ')}.`;
}

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
  /** Possible, but the program then deadlocks: these say who is stuck where. */
  hang: string[];
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
  if (witness.matched === target.length && writers(run, witness.state).length === 0) {
    const hang = allDone(run, witness.state) ? [] : stuckReasons(run, witness.state);
    return { possible: true, hang, reasons: [], witness };
  }
  const reasons: string[] = [];
  const chunks = allChunks(run);
  const total = chunks.map((c) => c.ev.text).join('');
  // With pipes a run can deadlock part way, so not every run prints every chunk.
  const fixedChars = !run.pipes.length && !run.procs.some((p) => p.blocked);
  // Every run prints every chunk exactly once, so the characters are fixed.
  const want = charCounts(total);
  const got = charCounts(target);
  const diffs: string[] = [];
  for (const c of new Set([...want.keys(), ...got.keys()])) {
    const w = want.get(c) ?? 0;
    const g = got.get(c) ?? 0;
    if (w !== g) diffs.push(`${show(c)} appears ${w} time${w === 1 ? '' : 's'} in every run but ${g} in yours`);
  }
  if (fixedChars && diffs.length) {
    reasons.push(
      `Every run prints the same ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} (${total.length} characters), only in different orders: ${diffs.slice(0, 4).join('; ')}.`,
    );
    return { possible: false, hang: [], reasons, witness };
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
  if (!fits.length && partial.length && !rest) {
    const e = partial[0] as OutEvent;
    reasons.push(`Every schedule that prints this much goes on to print ${show(e.text)} (line ${e.line}).`);
  } else if (!fits.length && partial.length) {
    const e = partial[0] as OutEvent;
    reasons.push(
      `The next pending write is ${show(e.text)} (line ${e.line}), and each write lands in one piece: output from another process cannot appear in the middle of it.`,
    );
  }
  if (!fits.length && !partial.length) {
    reasons.push(
      rest
        ? `No pending write starts with ${show(rest.slice(0, 1))} at this point.`
        : 'Every schedule that prints this much goes on to print more.',
    );
  }
  if (!writers(run, s).length && !allDone(run, s)) {
    reasons.push(`At that point the program is deadlocked: ${stuckReasons(run, s).map(lower).join(' ')}`);
  }
  return { possible: false, hang: [], reasons, witness };
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
