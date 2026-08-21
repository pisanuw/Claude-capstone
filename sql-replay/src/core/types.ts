/** A cell value. SQL NULL is represented as JavaScript null. */
export type Value = number | string | boolean | null;

/** A named table of sample data. */
export interface Table {
  name: string;
  columns: string[];
  rows: Value[][];
}

/* ---------------------------------- AST ---------------------------------- */

export type AggFn = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type Expr =
  | { k: 'lit'; v: Value }
  | { k: 'col'; table: string | null; name: string }
  | { k: 'bin'; op: BinOp; l: Expr; r: Expr }
  | { k: 'not'; e: Expr }
  | { k: 'isnull'; e: Expr; neg: boolean }
  | { k: 'in'; e: Expr; list: Expr[]; neg: boolean }
  | { k: 'like'; e: Expr; pat: Expr; neg: boolean }
  | { k: 'between'; e: Expr; lo: Expr; hi: Expr; neg: boolean }
  | { k: 'agg'; fn: AggFn; arg: Expr | '*' };

export type BinOp =
  | '+' | '-' | '*' | '/' | '%'
  | '=' | '!=' | '<' | '<=' | '>' | '>='
  | 'and' | 'or';

export interface SelectItem {
  expr: Expr | { k: 'star'; table: string | null };
  alias: string | null;
  /** Source text, used as the output column header when there is no alias. */
  text: string;
}

export interface JoinClause {
  kind: 'inner' | 'left';
  table: string;
  alias: string;
  on: Expr;
  onText: string;
}

export interface OrderKey {
  expr: Expr;
  desc: boolean;
  text: string;
}

export interface SelectQuery {
  distinct: boolean;
  items: SelectItem[];
  from: { table: string; alias: string };
  joins: JoinClause[];
  where: { expr: Expr; text: string } | null;
  groupBy: { exprs: Expr[]; texts: string[] } | null;
  having: { expr: Expr; text: string } | null;
  orderBy: OrderKey[];
  limit: { count: number; offset: number } | null;
}

/* ------------------------------- Step trace ------------------------------- */

/** How a displayed row fared in the stage that produced it. */
export type RowStatus = 'in' | 'kept' | 'dropped' | 'padded';

export interface StepRow {
  /** Stable identity for animation continuity, e.g. "orders:2" or "g0". */
  key: string;
  cells: Value[];
  status: RowStatus;
  /** Short per-row annotation, e.g. "amount > 100 → true" or "no match: NULL-padded". */
  note?: string;
}

export interface StepGrid {
  title: string;
  columns: string[];
  rows: StepRow[];
}

export type StepKind =
  | 'from' | 'join' | 'where' | 'group' | 'having'
  | 'select' | 'distinct' | 'order' | 'limit' | 'result';

export interface Step {
  kind: StepKind;
  /** Short label for the timeline chip, e.g. "WHERE". */
  label: string;
  /** The SQL fragment this stage executes, e.g. "WHERE amount > 100". */
  clause: string;
  /** Deterministic plain-English narration of what happened in this stage. */
  narration: string;
  grids: StepGrid[];
}

export class SqlError extends Error {
  constructor(message: string, public pos?: number) {
    super(message);
    this.name = 'SqlError';
  }
}
