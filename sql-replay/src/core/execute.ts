import { evalExpr, truthOf, compare, fmt, aggregate, hasAggregate, type Env } from './eval';
import * as narrate from './narrate';
import {
  SqlError,
  type AggFn,
  type Expr,
  type SelectQuery,
  type Step,
  type StepGrid,
  type StepRow,
  type Table,
  type Value,
} from './types';

/** A column of the working relation, qualified by the table alias it came from. */
interface WorkCol {
  alias: string;
  name: string;
}

/** One row of the working relation as it flows between stages. */
interface WorkRow {
  key: string;
  /** Values parallel to the working column list; null-padded for LEFT JOIN misses. */
  vals: Value[];
  /** Aliases whose columns are NULL because a LEFT JOIN found no match. */
  padded: string[];
}

interface Group {
  key: string;
  /** Values of the GROUP BY expressions for this group. */
  keyVals: Value[];
  members: WorkRow[];
}

const MAX_ROWS = 200;

/**
 * Execute a parsed SELECT over the given tables, returning the full replay
 * trace. Deterministic: same query + same data always yields the same steps.
 */
export function execute(query: SelectQuery, tables: Table[]): Step[] {
  return new Executor(query, tables).run();
}

class Executor {
  private steps: Step[] = [];
  private cols: WorkCol[] = [];
  private rows: WorkRow[] = [];
  private aliases = new Map<string, Table>();

  constructor(private q: SelectQuery, private tables: Table[]) {}

  run(): Step[] {
    this.stageFrom();
    for (const join of this.q.joins) this.stageJoin(join);
    if (this.q.where) this.stageWhere();
    const grouped = this.isGrouped();
    let groups: Group[] = [];
    if (grouped) {
      groups = this.stageGroup();
      if (this.q.having) groups = this.stageHaving(groups);
    } else if (this.q.having) {
      throw new SqlError('HAVING needs GROUP BY (or an aggregate query)');
    }
    const output = grouped ? this.projectGroups(groups) : this.projectRows();
    this.stageSelect(output);
    let final = output;
    if (this.q.distinct) final = this.stageDistinct(final);
    if (this.q.orderBy.length > 0) final = this.stageOrder(final, grouped ? groups : null);
    if (this.q.limit) final = this.stageLimit(final);
    this.stageResult(final);
    return this.steps;
  }

  /* -------------------------------- lookup -------------------------------- */

  private findTable(name: string): Table {
    const t = this.tables.find((tb) => tb.name.toLowerCase() === name.toLowerCase());
    if (!t) {
      const known = this.tables.map((tb) => tb.name).join(', ') || '(no tables defined)';
      throw new SqlError(`Unknown table "${name}". Available: ${known}`);
    }
    return t;
  }

  private addAlias(alias: string, table: Table): void {
    const key = alias.toLowerCase();
    for (const existing of this.aliases.keys()) {
      if (existing.toLowerCase() === key) {
        throw new SqlError(`Duplicate table alias "${alias}"; give one side a different alias`);
      }
    }
    this.aliases.set(alias, table);
  }

  private colIndex(table: string | null, name: string): number {
    const nameLc = name.toLowerCase();
    const matches: number[] = [];
    this.cols.forEach((c, i) => {
      if (c.name.toLowerCase() !== nameLc) return;
      if (table !== null && c.alias.toLowerCase() !== table.toLowerCase()) return;
      matches.push(i);
    });
    if (matches.length === 1) return matches[0];
    const ref = table ? `${table}.${name}` : name;
    if (matches.length === 0) throw new SqlError(`Unknown column "${ref}"`);
    throw new SqlError(`Column "${ref}" is ambiguous; qualify it with a table alias`);
  }

  private rowEnv(row: WorkRow): Env {
    return { col: (t, n) => row.vals[this.colIndex(t, n)] };
  }

  private groupEnv(g: Group): Env {
    return {
      col: (t, n) => {
        const idx = this.colIndex(t, n);
        const ref = this.groupByIndexOfCol(idx);
        if (ref === -1) {
          const c = this.cols[idx];
          throw new SqlError(
            `Column "${c.alias}.${c.name}" is not in GROUP BY; wrap it in an aggregate or group by it`,
          );
        }
        return g.keyVals[ref];
      },
      agg: (fn, arg) => this.evalAggregate(fn, arg, g.members),
    };
  }

  /** If the working column at idx is one of the GROUP BY expressions, its position there. */
  private groupByIndexOfCol(idx: number): number {
    const exprs = this.q.groupBy?.exprs ?? [];
    for (let i = 0; i < exprs.length; i++) {
      const e = exprs[i];
      if (e.k === 'col') {
        try {
          if (this.colIndex(e.table, e.name) === idx) return i;
        } catch {
          // Unknown group-by column errors surface when the group stage evaluates it.
        }
      }
    }
    return -1;
  }

  private evalAggregate(fn: AggFn, arg: Expr | '*', members: WorkRow[]): Value {
    if (arg === '*') return members.length;
    const values: Value[] = [];
    for (const m of members) {
      const v = evalExpr(arg, this.rowEnv(m));
      if (v !== null) values.push(v);
    }
    return aggregate(fn, values);
  }

  /* -------------------------------- stages --------------------------------- */

  private stageFrom(): void {
    const { table, alias } = this.q.from;
    const t = this.findTable(table);
    this.addAlias(alias, t);
    this.cols = t.columns.map((name) => ({ alias, name }));
    this.rows = t.rows.slice(0, MAX_ROWS).map((vals, i) => ({
      key: `${alias}:${i}`,
      vals: vals.slice(),
      padded: [],
    }));
    const clause = `FROM ${table}${alias !== table ? ` AS ${alias}` : ''}`;
    this.steps.push({
      kind: 'from',
      label: 'FROM',
      clause,
      narration: narrate.from(table, this.rows.length, t.columns.length),
      grids: [this.grid(`${table} (${this.rows.length} rows)`, this.rows, () => ({ status: 'in' }))],
    });
  }

  private stageJoin(join: SelectQuery['joins'][number]): void {
    const t = this.findTable(join.table);
    this.addAlias(join.alias, t);
    const leftCols = this.cols;
    const rightCols: WorkCol[] = t.columns.map((name) => ({ alias: join.alias, name }));
    const rightRows: WorkRow[] = t.rows.slice(0, MAX_ROWS).map((vals, i) => ({
      key: `${join.alias}:${i}`,
      vals: vals.slice(),
      padded: [],
    }));
    const leftRows = this.rows;
    this.cols = [...leftCols, ...rightCols];

    const out: WorkRow[] = [];
    let matchedPairs = 0;
    const unmatchedLeft: WorkRow[] = [];
    for (const l of leftRows) {
      let any = false;
      for (const r of rightRows) {
        const combined: WorkRow = {
          key: `${l.key}+${r.key}`,
          vals: [...l.vals, ...r.vals],
          padded: l.padded,
        };
        const v = truthOf(evalExpr(join.on, this.rowEnv(combined)));
        if (v === true) {
          out.push(combined);
          any = true;
          matchedPairs++;
        }
      }
      if (!any) unmatchedLeft.push(l);
    }
    if (join.kind === 'left') {
      for (const l of unmatchedLeft) {
        out.push({
          key: `${l.key}+∅`,
          vals: [...l.vals, ...rightCols.map(() => null)],
          padded: [...l.padded, join.alias],
        });
      }
    }
    // Restore source order for LEFT JOIN so padded rows sit near their kin.
    if (join.kind === 'left') out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    this.rows = out.slice(0, MAX_ROWS);

    const kindSql = join.kind === 'left' ? 'LEFT JOIN' : 'JOIN';
    const clause = `${kindSql} ${join.table}${join.alias !== join.table ? ` AS ${join.alias}` : ''} ON ${join.onText}`;
    const resultGrid = this.grid(`after ${kindSql} (${this.rows.length} rows)`, this.rows, (row) => {
      if (row.padded.includes(join.alias)) {
        return { status: 'padded', note: `no ${join.table} match: NULL-padded` };
      }
      return { status: 'kept', note: `matched on ${join.onText}` };
    });
    const rightGrid: StepGrid = {
      title: `${join.table} (${rightRows.length} rows)`,
      columns: t.columns,
      rows: rightRows.map((r) => ({ key: r.key, cells: r.vals, status: 'in' as const })),
    };
    this.steps.push({
      kind: 'join',
      label: kindSql,
      clause,
      narration: narrate.join(
        join.kind, join.table, leftRows.length, rightRows.length,
        matchedPairs, unmatchedLeft.length,
      ),
      grids: [rightGrid, resultGrid],
    });
  }

  private stageWhere(): void {
    const { expr, text } = this.q.where!;
    if (hasAggregate(expr)) throw new SqlError('Aggregates are not allowed in WHERE; use HAVING');
    const kept: WorkRow[] = [];
    const rows: StepRow[] = [];
    for (const r of this.rows) {
      const v = truthOf(evalExpr(expr, this.rowEnv(r)));
      const pass = v === true;
      if (pass) kept.push(r);
      rows.push({
        key: r.key,
        cells: r.vals,
        status: pass ? 'kept' : 'dropped',
        note: `${text} → ${v === null ? 'NULL' : v}`,
      });
    }
    const dropped = this.rows.length - kept.length;
    this.steps.push({
      kind: 'where',
      label: 'WHERE',
      clause: `WHERE ${text}`,
      narration: narrate.where(text, this.rows.length, kept.length, dropped),
      grids: [{ title: `filtering ${this.rows.length} rows`, columns: this.gridColumns(), rows }],
    });
    this.rows = kept;
  }

  private isGrouped(): boolean {
    if (this.q.groupBy) return true;
    if (this.q.items.some((it) => it.expr.k !== 'star' && hasAggregate(it.expr))) return true;
    if (this.q.having && hasAggregate(this.q.having.expr)) return true;
    return false;
  }

  private stageGroup(): Group[] {
    const exprs = this.q.groupBy?.exprs ?? [];
    const texts = this.q.groupBy?.texts ?? [];
    const groups: Group[] = [];
    const index = new Map<string, Group>();
    for (const r of this.rows) {
      const keyVals = exprs.map((e) => evalExpr(e, this.rowEnv(r)));
      const key = keyVals.map(fmt).join('␟');
      let g = index.get(key);
      if (!g) {
        g = { key: `g${groups.length}`, keyVals, members: [] };
        groups.push(g);
        index.set(key, g);
      }
      g.members.push(r);
    }
    if (exprs.length === 0) {
      // Aggregates without GROUP BY: one implicit group over all rows.
      if (groups.length === 0) groups.push({ key: 'g0', keyVals: [], members: [...this.rows] });
    }
    const clause = exprs.length > 0 ? `GROUP BY ${texts.join(', ')}` : '(implicit single group)';
    const columns = [...texts, 'rows in group'];
    const rows: StepRow[] = groups.map((g) => ({
      key: g.key,
      cells: [...g.keyVals, g.members.length],
      status: 'in',
      note: g.members.map((m) => `#${m.key}`).join(', '),
    }));
    this.steps.push({
      kind: 'group',
      label: 'GROUP BY',
      clause,
      narration: narrate.group(this.rows.length, groups.length, texts),
      grids: [{ title: `${groups.length} group${groups.length === 1 ? '' : 's'}`, columns, rows }],
    });
    return groups;
  }

  private stageHaving(groups: Group[]): Group[] {
    const { expr, text } = this.q.having!;
    const texts = this.q.groupBy?.texts ?? [];
    const kept: Group[] = [];
    const rows: StepRow[] = [];
    for (const g of groups) {
      const v = truthOf(evalExpr(expr, this.groupEnv(g)));
      const pass = v === true;
      if (pass) kept.push(g);
      rows.push({
        key: g.key,
        cells: [...g.keyVals, g.members.length],
        status: pass ? 'kept' : 'dropped',
        note: `${text} → ${v === null ? 'NULL' : v}`,
      });
    }
    this.steps.push({
      kind: 'having',
      label: 'HAVING',
      clause: `HAVING ${text}`,
      narration: narrate.having(text, groups.length, kept.length),
      grids: [{ title: `filtering ${groups.length} groups`, columns: [...texts, 'rows in group'], rows }],
    });
    return kept;
  }

  /* ------------------------------ projection ------------------------------- */

  private outputColumns(): string[] {
    const headers: string[] = [];
    const multi = this.q.joins.length > 0;
    for (const item of this.q.items) {
      if (item.expr.k === 'star') {
        const wanted = item.expr.table;
        if (wanted && !this.cols.some((c) => c.alias.toLowerCase() === wanted.toLowerCase())) {
          throw new SqlError(`Unknown table alias "${wanted}" in ${wanted}.*`);
        }
        for (const c of this.cols) {
          if (wanted && c.alias.toLowerCase() !== wanted.toLowerCase()) continue;
          headers.push(multi ? `${c.alias}.${c.name}` : c.name);
        }
      } else {
        headers.push(item.alias ?? (item.expr.k === 'col' ? item.expr.name : item.text));
      }
    }
    return headers;
  }

  private projectEnvValues(env: Env): Value[] {
    const out: Value[] = [];
    for (const item of this.q.items) {
      if (item.expr.k === 'star') {
        const wanted = item.expr.table;
        for (const c of this.cols) {
          if (wanted && c.alias.toLowerCase() !== wanted.toLowerCase()) continue;
          out.push(env.col(c.alias, c.name));
        }
      } else {
        out.push(evalExpr(item.expr, env));
      }
    }
    return out;
  }

  private projectRows(): { key: string; cells: Value[] }[] {
    for (const item of this.q.items) {
      if (item.expr.k !== 'star' && hasAggregate(item.expr)) {
        // isGrouped() routes aggregate queries elsewhere; guard anyway.
        throw new SqlError('Aggregates need GROUP BY or an all-rows aggregate query');
      }
    }
    return this.rows.map((r) => ({ key: r.key, cells: this.projectEnvValues(this.rowEnv(r)) }));
  }

  private projectGroups(groups: Group[]): { key: string; cells: Value[] }[] {
    for (const item of this.q.items) {
      if (item.expr.k === 'star') {
        throw new SqlError('SELECT * cannot be combined with GROUP BY; list columns or aggregates');
      }
    }
    return groups.map((g) => ({ key: g.key, cells: this.projectEnvValues(this.groupEnv(g)) }));
  }

  private stageSelect(output: { key: string; cells: Value[] }[]): void {
    const columns = this.outputColumns();
    const clause = `SELECT ${this.q.distinct ? 'DISTINCT ' : ''}${this.q.items.map((i) => i.text + (i.alias ? ` AS ${i.alias}` : '')).join(', ')}`;
    this.steps.push({
      kind: 'select',
      label: 'SELECT',
      clause,
      narration: narrate.select(columns, output.length),
      grids: [{
        title: `projected to ${columns.length} column${columns.length === 1 ? '' : 's'}`,
        columns,
        rows: output.map((r) => ({ key: r.key, cells: r.cells, status: 'in' as const })),
      }],
    });
  }

  private stageDistinct(output: { key: string; cells: Value[] }[]): { key: string; cells: Value[] }[] {
    const seen = new Set<string>();
    const kept: { key: string; cells: Value[] }[] = [];
    const rows: StepRow[] = [];
    for (const r of output) {
      const sig = r.cells.map(fmt).join('␟');
      const dup = seen.has(sig);
      if (!dup) { seen.add(sig); kept.push(r); }
      rows.push({
        key: r.key,
        cells: r.cells,
        status: dup ? 'dropped' : 'kept',
        note: dup ? 'duplicate of an earlier row' : 'first occurrence',
      });
    }
    this.steps.push({
      kind: 'distinct',
      label: 'DISTINCT',
      clause: 'DISTINCT',
      narration: narrate.distinct(output.length, kept.length),
      grids: [{ title: 'removing duplicates', columns: this.outputColumns(), rows }],
    });
    return kept;
  }

  private stageOrder(
    output: { key: string; cells: Value[] }[],
    groups: Group[] | null,
  ): { key: string; cells: Value[] }[] {
    const headers = this.outputColumns();
    const rowByKey = new Map(this.rows.map((r) => [r.key, r]));
    const groupByKey = groups ? new Map(groups.map((g) => [g.key, g])) : null;

    const keyed = output.map((r) => {
      const env = this.orderEnv(r, headers, rowByKey, groupByKey);
      const sortVals = this.q.orderBy.map((k) => evalExpr(k.expr, env));
      return { r, sortVals };
    });
    const sorted = keyed.slice().sort((a, b) => {
      for (let i = 0; i < this.q.orderBy.length; i++) {
        const av = a.sortVals[i];
        const bv = b.sortVals[i];
        let c: number;
        if (av === null && bv === null) c = 0;
        else if (av === null) c = 1; // NULLs last, like Postgres ASC default
        else if (bv === null) c = -1;
        else c = compare(av, bv);
        if (this.q.orderBy[i].desc && !(av === null || bv === null)) c = -c;
        if (c !== 0) return c;
      }
      return 0;
    });
    const clause = `ORDER BY ${this.q.orderBy.map((k) => k.text + (k.desc ? ' DESC' : '')).join(', ')}`;
    const rows: StepRow[] = sorted.map(({ r, sortVals }) => ({
      key: r.key,
      cells: r.cells,
      status: 'in',
      note: this.q.orderBy.map((k, i) => `${k.text} = ${fmt(sortVals[i])}`).join(', '),
    }));
    this.steps.push({
      kind: 'order',
      label: 'ORDER BY',
      clause,
      narration: narrate.order(this.q.orderBy.map((k) => `${k.text}${k.desc ? ' descending' : ''}`), output.length),
      grids: [{ title: 'rows in final order', columns: headers, rows }],
    });
    return sorted.map((s) => s.r);
  }

  /** ORDER BY sees output aliases first, then the underlying row or group. */
  private orderEnv(
    out: { key: string; cells: Value[] },
    headers: string[],
    rowByKey: Map<string, WorkRow>,
    groupByKey: Map<string, Group> | null,
  ): Env {
    const fallback: Env | null = groupByKey
      ? (groupByKey.has(out.key) ? this.groupEnv(groupByKey.get(out.key)!) : null)
      : (rowByKey.has(out.key) ? this.rowEnv(rowByKey.get(out.key)!) : null);
    return {
      col: (t, n) => {
        if (!t) {
          const idx = headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
          if (idx !== -1) return out.cells[idx];
        }
        if (fallback) return fallback.col(t, n);
        throw new SqlError(`ORDER BY cannot resolve column "${t ? `${t}.` : ''}${n}"`);
      },
      agg: (fn, arg) => {
        if (fallback?.agg) return fallback.agg(fn, arg);
        throw new SqlError('Aggregates in ORDER BY need GROUP BY');
      },
    };
  }

  private stageLimit(output: { key: string; cells: Value[] }[]): { key: string; cells: Value[] }[] {
    const { count, offset } = this.q.limit!;
    const kept = output.slice(offset, offset + count);
    const rows: StepRow[] = output.map((r, i) => {
      const inWindow = i >= offset && i < offset + count;
      return {
        key: r.key,
        cells: r.cells,
        status: inWindow ? 'kept' : 'dropped',
        note: inWindow ? `row ${i + 1} is inside the window` : i < offset ? `row ${i + 1} skipped by OFFSET` : `row ${i + 1} is past the limit`,
      };
    });
    const clause = `LIMIT ${count}${offset ? ` OFFSET ${offset}` : ''}`;
    this.steps.push({
      kind: 'limit',
      label: 'LIMIT',
      clause,
      narration: narrate.limit(output.length, kept.length, count, offset),
      grids: [{ title: 'trimming the result', columns: this.outputColumns(), rows }],
    });
    return kept;
  }

  private stageResult(output: { key: string; cells: Value[] }[]): void {
    this.steps.push({
      kind: 'result',
      label: 'RESULT',
      clause: '(final result)',
      narration: narrate.result(output.length, this.outputColumns().length),
      grids: [{
        title: `final result (${output.length} row${output.length === 1 ? '' : 's'})`,
        columns: this.outputColumns(),
        rows: output.map((r) => ({ key: r.key, cells: r.cells, status: 'in' as const })),
      }],
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  private gridColumns(): string[] {
    const multi = this.aliases.size > 1;
    return this.cols.map((c) => (multi ? `${c.alias}.${c.name}` : c.name));
  }

  private grid(
    title: string,
    rows: WorkRow[],
    status: (r: WorkRow) => { status: StepRow['status']; note?: string },
  ): StepGrid {
    return {
      title,
      columns: this.gridColumns(),
      rows: rows.map((r) => {
        const s = status(r);
        return { key: r.key, cells: r.vals, status: s.status, ...(s.note ? { note: s.note } : {}) };
      }),
    };
  }
}
