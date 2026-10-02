import { type Board, boardProblem, cellCount, mineCount, neighborTable, numbers } from './board';

/**
 * Deduction tiers, in the order a human tends to reach for them.
 *
 * 0. Opening: the start cell (and the flood fill behind any zero).
 * 1. Single cell: a number already satisfied by its flags means the rest of
 *    its neighbors are safe; a number with exactly as many hidden neighbors as
 *    missing mines means they are all mines.
 * 2. Pairwise: two overlapping numbers bound how many mines the overlap can
 *    hold, which can settle the cells only one of them touches (the classic
 *    1-2 and subset patterns).
 * 3. Frontier search: every mine layout consistent with the visible numbers
 *    is enumerated per connected frontier component; a cell that is a mine in
 *    all of them, or in none, is decided.
 * 4. Global mine count: the same enumeration, filtered by the total number of
 *    mines left, plus the hidden cells no number touches.
 */
export type Tier = 0 | 1 | 2 | 3 | 4;

export const TIER_NAMES: Record<Tier, string> = {
  0: 'Opening',
  1: 'Single-cell rules',
  2: 'Pairwise overlap',
  3: 'Frontier search',
  4: 'Global mine count',
};

export interface Step {
  tier: Tier;
  /** Cells uncovered by this step, including any flood fill. */
  revealed: number[];
  /** Cells this step proved to be mines. */
  flagged: number[];
}

export const UNKNOWN = 0;
export const REVEALED = 1;
export const FLAGGED = 2;

export interface SolveResult {
  /** True when every safe cell was uncovered without a guess. */
  solved: boolean;
  steps: Step[];
  /** The hardest tier any step needed; drives the difficulty meter. */
  maxTier: Tier;
  /** Final per-cell state: UNKNOWN, REVEALED or FLAGGED. */
  state: number[];
  /** Hidden cells next to a visible number that logic could not decide. */
  stuck: number[];
  /** Hidden cells no visible number touches: logic cannot even see them. */
  sealed: number[];
  /**
   * When stuck: the cells of the smallest ambiguous frontier component and
   * two different mine layouts for them that both fit every visible number.
   */
  ambiguity: { cells: number[]; layouts: number[][] } | null;
  /** True when a frontier component was too large to enumerate. */
  aborted: boolean;
  /** How many cells each tier decided. */
  decidedByTier: Record<Tier, number>;
}

export interface SolveOptions {
  /** Backtracking node budget for one frontier enumeration pass. */
  searchLimit?: number;
}

interface Constraint {
  cells: number[];
  count: number;
}

interface ComponentSearch {
  cells: number[];
  /** Number of layouts with k mines, indexed by k. */
  layouts: Map<number, number>;
  /** tally.get(k)[j]: layouts with k mines in which cells[j] is a mine. */
  tally: Map<number, number[]>;
  /** Up to two sample layouts per mine count, as mine flags over `cells`. */
  samples: Map<number, boolean[][]>;
  aborted: boolean;
}

const DEFAULT_SEARCH_LIMIT = 250_000;

export function solve(board: Board, options: SolveOptions = {}): SolveResult {
  const problem = boardProblem(board);
  if (problem) throw new Error(problem);
  return new Solver(board, options.searchLimit ?? DEFAULT_SEARCH_LIMIT).run();
}

class Solver {
  private readonly n: number;
  private readonly nbrs: number[][];
  private readonly nums: number[];
  private readonly totalMines: number;
  private readonly state: number[];
  private readonly steps: Step[] = [];
  private readonly decidedByTier: Record<Tier, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  private revealedCount = 0;
  private flaggedCount = 0;
  private aborted = false;

  constructor(
    private readonly board: Board,
    private readonly searchLimit: number,
  ) {
    this.n = cellCount(board);
    this.nbrs = neighborTable(board);
    this.nums = numbers(board);
    this.totalMines = mineCount(board);
    this.state = new Array<number>(this.n).fill(UNKNOWN);
  }

  run(): SolveResult {
    this.apply(0, [this.board.start], []);
    while (!this.done()) {
      if (this.tierOne()) continue;
      if (this.tierTwo()) continue;
      if (this.tierSearch()) continue;
      break;
    }
    const solved = this.done();
    const constraints = this.constraints();
    const stuck = solved ? [] : uniqueCells(constraints);
    const onFrontier = new Set(stuck);
    const sealed: number[] = [];
    if (!solved) for (let i = 0; i < this.n; i++) if (this.state[i] === UNKNOWN && !onFrontier.has(i)) sealed.push(i);
    let maxTier: Tier = 0;
    for (const s of this.steps) if (s.tier > maxTier) maxTier = s.tier;
    return {
      solved,
      steps: this.steps,
      maxTier,
      state: this.state.slice(),
      stuck,
      sealed,
      ambiguity: solved ? null : this.ambiguity(constraints),
      aborted: this.aborted,
      decidedByTier: this.decidedByTier,
    };
  }

  private done(): boolean {
    return this.revealedCount === this.n - this.totalMines;
  }

  /** Flag `mines`, then open `safe` (flood-filling zeros), as one recorded step. */
  private apply(tier: Tier, safe: Iterable<number>, mines: Iterable<number>): boolean {
    const step: Step = { tier, revealed: [], flagged: [] };
    for (const m of mines) {
      if (this.state[m] !== UNKNOWN) continue;
      if (!this.board.mines[m]) throw new Error(`Solver bug: flagged safe cell ${m}`);
      this.state[m] = FLAGGED;
      this.flaggedCount++;
      step.flagged.push(m);
    }
    for (const s of safe) this.reveal(s, step.revealed);
    const decided = step.revealed.length + step.flagged.length;
    if (decided === 0) return false;
    this.decidedByTier[tier] += decided;
    this.steps.push(step);
    return true;
  }

  private reveal(start: number, out: number[]): void {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      if (this.state[i] !== UNKNOWN) continue;
      if (this.board.mines[i]) throw new Error(`Solver bug: opened mine ${i}`);
      this.state[i] = REVEALED;
      this.revealedCount++;
      out.push(i);
      if (this.nums[i] === 0) for (const j of this.nbrs[i]!) if (this.state[j] === UNKNOWN) stack.push(j);
    }
  }

  /** One constraint per visible number that still touches hidden cells. */
  private constraints(): Constraint[] {
    const out: Constraint[] = [];
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== REVEALED) continue;
      const cells: number[] = [];
      let flags = 0;
      for (const j of this.nbrs[i]!) {
        if (this.state[j] === UNKNOWN) cells.push(j);
        else if (this.state[j] === FLAGGED) flags++;
      }
      if (cells.length) out.push({ cells, count: this.nums[i]! - flags });
    }
    return out;
  }

  private tierOne(): boolean {
    const safe = new Set<number>();
    const mines = new Set<number>();
    for (const c of this.constraints()) {
      if (c.count === 0) c.cells.forEach((j) => safe.add(j));
      else if (c.count === c.cells.length) c.cells.forEach((j) => mines.add(j));
    }
    return this.apply(1, safe, mines);
  }

  private tierTwo(): boolean {
    const cs = this.constraints();
    const byCell = new Map<number, number[]>();
    cs.forEach((c, k) => {
      for (const j of c.cells) {
        const list = byCell.get(j);
        if (list) list.push(k);
        else byCell.set(j, [k]);
      }
    });
    const safe = new Set<number>();
    const mines = new Set<number>();
    const seen = new Set<string>();
    for (const list of byCell.values()) {
      for (let p = 0; p < list.length; p++) {
        for (let q = p + 1; q < list.length; q++) {
          const key = `${list[p]},${list[q]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairwise(cs[list[p]!]!, cs[list[q]!]!, safe, mines);
          pairwise(cs[list[q]!]!, cs[list[p]!]!, safe, mines);
        }
      }
    }
    return this.apply(2, safe, mines);
  }

  /** Tiers 3 and 4: exact enumeration of each frontier component. */
  private tierSearch(): boolean {
    const constraints = this.constraints();
    const comps = this.searchComponents(constraints);
    if (comps.some((c) => c.aborted)) this.aborted = true;

    const safe = new Set<number>();
    const mines = new Set<number>();
    for (const comp of comps) {
      if (comp.aborted) continue;
      decideFrom(comp, [...comp.layouts.keys()], safe, mines);
    }
    if (this.apply(3, safe, mines)) return true;

    // Global mine count. Unsafe when any component's layouts are unknown.
    if (comps.some((c) => c.aborted)) return false;
    const remaining = this.totalMines - this.flaggedCount;
    const frontier = new Set(uniqueCells(constraints));
    const interior: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.state[i] === UNKNOWN && !frontier.has(i)) interior.push(i);
    const valid = validCounts(comps, remaining, interior.length);
    comps.forEach((comp, c) => decideFrom(comp, valid.perComponent[c]!, safe, mines));
    if (interior.length) {
      const left = valid.interiorCounts;
      if (left.length && left.every((k) => k === 0)) interior.forEach((j) => safe.add(j));
      else if (left.length && left.every((k) => k === interior.length)) interior.forEach((j) => mines.add(j));
    }
    return this.apply(4, safe, mines);
  }

  private searchComponents(constraints: Constraint[]): ComponentSearch[] {
    const groups = components(constraints);
    let budget = this.searchLimit;
    return groups.map((g) => {
      const result = enumerate(g.cells, g.constraints, budget);
      budget = Math.max(0, budget - result.nodes);
      return result.search;
    });
  }

  /** Two layouts for the smallest ambiguous component, for the side-by-side view. */
  private ambiguity(constraints: Constraint[]): SolveResult['ambiguity'] {
    const comps = this.searchComponents(constraints).filter((c) => !c.aborted);
    if (!comps.length) return null;
    const remaining = this.totalMines - this.flaggedCount;
    const frontier = uniqueCells(constraints).length;
    let interior = 0;
    for (let i = 0; i < this.n; i++) if (this.state[i] === UNKNOWN) interior++;
    interior -= frontier;
    const allComplete = comps.length === components(constraints).length;
    const valid = allComplete ? validCounts(comps, remaining, interior).perComponent : comps.map((c) => [...c.layouts.keys()]);
    const ranked = comps
      .map((comp, c) => ({ comp, ks: valid[c]! }))
      .sort((a, b) => a.comp.cells.length - b.comp.cells.length);
    for (const { comp, ks } of ranked) {
      const layouts: boolean[][] = [];
      for (const k of ks) for (const s of comp.samples.get(k) ?? []) if (layouts.length < 2) layouts.push(s);
      if (layouts.length === 2) {
        return {
          cells: comp.cells.slice(),
          layouts: layouts.map((l) => comp.cells.filter((_, j) => l[j])),
        };
      }
    }
    return null;
  }
}

/**
 * What constraint `a` says about the cells only `b` touches. The overlap holds
 * between lo and hi mines; whatever `b` still needs must fit outside it.
 */
function pairwise(a: Constraint, b: Constraint, safe: Set<number>, mines: Set<number>): void {
  const inA = new Set(a.cells);
  const overlap = b.cells.filter((j) => inA.has(j));
  const onlyA = a.cells.length - overlap.length;
  const onlyB = b.cells.filter((j) => !inA.has(j));
  if (!onlyB.length) return;
  const hi = Math.min(a.count, overlap.length);
  const lo = Math.max(0, a.count - onlyA);
  if (b.count - hi === onlyB.length) onlyB.forEach((j) => mines.add(j));
  else if (b.count - lo === 0) onlyB.forEach((j) => safe.add(j));
}

function uniqueCells(constraints: Constraint[]): number[] {
  const set = new Set<number>();
  for (const c of constraints) for (const j of c.cells) set.add(j);
  return [...set].sort((a, b) => a - b);
}

/** Split the frontier into groups of cells linked by shared constraints. */
export function components(constraints: Constraint[]): { cells: number[]; constraints: Constraint[] }[] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let y = x;
    while (parent.get(y) !== r) {
      const next = parent.get(y)!;
      parent.set(y, r);
      y = next;
    }
    return r;
  };
  for (const c of constraints) {
    for (const j of c.cells) if (!parent.has(j)) parent.set(j, j);
    for (let k = 1; k < c.cells.length; k++) {
      const a = find(c.cells[0]!);
      const b = find(c.cells[k]!);
      if (a !== b) parent.set(b, a);
    }
  }
  const groups = new Map<number, { cells: number[]; constraints: Constraint[] }>();
  for (const j of [...parent.keys()].sort((a, b) => a - b)) {
    const r = find(j);
    if (!groups.has(r)) groups.set(r, { cells: [], constraints: [] });
    groups.get(r)!.cells.push(j);
  }
  for (const c of constraints) groups.get(find(c.cells[0]!))!.constraints.push(c);
  return [...groups.values()];
}

/** Backtracking enumeration of every mine layout that satisfies `constraints`. */
export function enumerate(
  cells: number[],
  constraints: Constraint[],
  budget: number,
): { search: ComponentSearch; nodes: number } {
  const pos = new Map(cells.map((c, j) => [c, j]));
  const ofCell: number[][] = cells.map(() => []);
  constraints.forEach((c, k) => c.cells.forEach((j) => ofCell[pos.get(j)!]!.push(k)));
  // Order cells so each constraint fills up quickly: walk constraints in order.
  const order: number[] = [];
  const placed = new Set<number>();
  for (const c of constraints) {
    for (const j of c.cells) {
      const p = pos.get(j)!;
      if (!placed.has(p)) {
        placed.add(p);
        order.push(p);
      }
    }
  }
  const need = constraints.map((c) => c.count);
  const open = constraints.map((c) => c.cells.length);
  const assign = new Array<boolean>(cells.length).fill(false);
  const search: ComponentSearch = {
    cells,
    layouts: new Map(),
    tally: new Map(),
    samples: new Map(),
    aborted: false,
  };
  let nodes = 0;
  let mines = 0;

  const record = (): void => {
    search.layouts.set(mines, (search.layouts.get(mines) ?? 0) + 1);
    let t = search.tally.get(mines);
    if (!t) {
      t = new Array<number>(cells.length).fill(0);
      search.tally.set(mines, t);
    }
    for (let j = 0; j < cells.length; j++) if (assign[j]) t[j]!++;
    const s = search.samples.get(mines) ?? [];
    if (s.length < 2) s.push(assign.slice());
    search.samples.set(mines, s);
  };

  const place = (j: number, mine: boolean): boolean => {
    let ok = true;
    for (const k of ofCell[j]!) {
      open[k]!--;
      if (mine) need[k]!--;
      if (need[k]! < 0 || need[k]! > open[k]!) ok = false;
    }
    return ok;
  };
  const unplace = (j: number, mine: boolean): void => {
    for (const k of ofCell[j]!) {
      open[k]!++;
      if (mine) need[k]!++;
    }
  };

  const walk = (d: number): void => {
    if (search.aborted) return;
    if (++nodes > budget) {
      search.aborted = true;
      return;
    }
    if (d === order.length) {
      record();
      return;
    }
    const j = order[d]!;
    for (const mine of [false, true]) {
      assign[j] = mine;
      if (mine) mines++;
      if (place(j, mine)) walk(d + 1);
      unplace(j, mine);
      if (mine) mines--;
      assign[j] = false;
    }
  };
  walk(0);
  if (search.aborted) {
    search.layouts.clear();
    search.tally.clear();
    search.samples.clear();
  }
  return { search, nodes };
}

/** Add the cells that are a mine in every allowed layout, or in none. */
function decideFrom(comp: ComponentSearch, ks: number[], safe: Set<number>, mines: Set<number>): void {
  let total = 0;
  const hits = new Array<number>(comp.cells.length).fill(0);
  for (const k of ks) {
    total += comp.layouts.get(k) ?? 0;
    const t = comp.tally.get(k);
    if (t) t.forEach((v, j) => (hits[j]! += v));
  }
  if (total === 0) return;
  comp.cells.forEach((cell, j) => {
    if (hits[j] === 0) safe.add(cell);
    else if (hits[j] === total) mines.add(cell);
  });
}

/**
 * Which per-component mine counts can appear in a full layout that uses
 * exactly `remaining` mines, given `interior` hidden cells no number touches.
 */
export function validCounts(
  comps: { layouts: Map<number, number> }[],
  remaining: number,
  interior: number,
): { perComponent: number[][]; interiorCounts: number[] } {
  const ks = comps.map((c) => [...c.layouts.keys()].sort((a, b) => a - b));
  const fits = (sum: number): boolean => remaining - sum >= 0 && remaining - sum <= interior;
  const sums = (list: number[][]): Set<number> => {
    let acc = new Set([0]);
    for (const opts of list) {
      const next = new Set<number>();
      for (const a of acc) for (const k of opts) next.add(a + k);
      acc = next;
    }
    return acc;
  };
  const perComponent = ks.map((opts, c) => {
    const others = sums(ks.filter((_, d) => d !== c));
    return opts.filter((k) => [...others].some((s) => fits(s + k)));
  });
  const interiorCounts = [...sums(ks)].filter(fits).map((s) => remaining - s).sort((a, b) => a - b);
  return { perComponent, interiorCounts };
}

export type Difficulty = { tier: Tier; label: string; blurb: string };

export function difficulty(result: SolveResult): Difficulty {
  const blurbs: Record<Tier, [string, string]> = {
    0: ['Trivial', 'The opening click uncovers the whole board.'],
    1: ['Beginner logic', 'Every cell follows from one number at a time.'],
    2: ['Intermediate', 'Needs pairwise reasoning: comparing two overlapping numbers.'],
    3: ['Expert', 'Needs exhaustive frontier search: considering every layout around a region.'],
    4: ['Needs mine count', 'Only the total number of mines settles the final cells.'],
  };
  const [label, blurb] = blurbs[result.maxTier];
  return { tier: result.maxTier, label, blurb };
}
