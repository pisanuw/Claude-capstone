import { SqlError, type AggFn, type Expr, type Value } from './types';

/** Evaluation environment: resolves column references and (when grouped) aggregates. */
export interface Env {
  col(table: string | null, name: string): Value;
  agg?(fn: AggFn, arg: Expr | '*'): Value;
}

/**
 * Evaluate an expression under SQL three-valued logic: NULL means "unknown",
 * comparisons with NULL yield NULL, and AND/OR follow Kleene logic.
 */
export function evalExpr(e: Expr, env: Env): Value {
  switch (e.k) {
    case 'lit':
      return e.v;
    case 'col':
      return env.col(e.table, e.name);
    case 'not': {
      const v = truthOf(evalExpr(e.e, env));
      return v === null ? null : !v;
    }
    case 'isnull': {
      const v = evalExpr(e.e, env);
      return e.neg ? v !== null : v === null;
    }
    case 'in': {
      const v = evalExpr(e.e, env);
      if (v === null) return null;
      let sawNull = false;
      for (const item of e.list) {
        const w = evalExpr(item, env);
        if (w === null) { sawNull = true; continue; }
        if (compare(v, w) === 0) return !e.neg;
      }
      return sawNull ? null : e.neg;
    }
    case 'like': {
      const v = evalExpr(e.e, env);
      const p = evalExpr(e.pat, env);
      if (v === null || p === null) return null;
      const matched = likeMatch(String(v), String(p));
      return e.neg ? !matched : matched;
    }
    case 'between': {
      const v = evalExpr(e.e, env);
      const lo = evalExpr(e.lo, env);
      const hi = evalExpr(e.hi, env);
      if (v === null || lo === null || hi === null) return null;
      const inRange = compare(v, lo) >= 0 && compare(v, hi) <= 0;
      return e.neg ? !inRange : inRange;
    }
    case 'agg': {
      if (!env.agg) throw new SqlError(`${e.fn.toUpperCase()}(...) is only allowed with GROUP BY or over the whole result`);
      return env.agg(e.fn, e.arg);
    }
    case 'bin':
      return evalBin(e.op, e.l, e.r, env);
  }
}

function evalBin(op: string, le: Expr, re: Expr, env: Env): Value {
  if (op === 'and' || op === 'or') {
    const l = truthOf(evalExpr(le, env));
    // Kleene short-circuit: FALSE AND x is FALSE, TRUE OR x is TRUE.
    if (op === 'and' && l === false) return false;
    if (op === 'or' && l === true) return true;
    const r = truthOf(evalExpr(re, env));
    if (op === 'and') {
      if (r === false) return false;
      return l === null || r === null ? null : true;
    }
    if (r === true) return true;
    return l === null || r === null ? null : false;
  }
  const l = evalExpr(le, env);
  const r = evalExpr(re, env);
  if (l === null || r === null) return null;
  switch (op) {
    case '+': case '-': case '*': case '/': case '%': {
      const a = numeric(l, op);
      const b = numeric(r, op);
      if (op === '/' ) return b === 0 ? null : a / b;
      if (op === '%') return b === 0 ? null : a % b;
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      return a * b;
    }
    case '=': return compare(l, r) === 0;
    case '!=': return compare(l, r) !== 0;
    case '<': return compare(l, r) < 0;
    case '<=': return compare(l, r) <= 0;
    case '>': return compare(l, r) > 0;
    default: return compare(l, r) >= 0;
  }
}

function numeric(v: Value, op: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== '') return n;
  throw new SqlError(`Cannot apply "${op}" to the text value ${fmt(v)}`);
}

/** Interpret a value as a boolean for WHERE/HAVING; null stays unknown. */
export function truthOf(v: Value): boolean | null {
  if (v === null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v.length > 0;
}

/**
 * Compare two non-null values the way this engine sorts and matches them:
 * numbers (and booleans) numerically, everything else as case-sensitive text.
 */
export function compare(a: Value, b: Value): number {
  const an = asNumber(a);
  const bn = asNumber(b);
  if (an !== null && bn !== null) return an < bn ? -1 : an > bn ? 1 : 0;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function asNumber(v: Value): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

/** SQL LIKE with % (any run) and _ (single character), case-insensitive. */
export function likeMatch(text: string, pattern: string): boolean {
  let re = '';
  for (const ch of pattern) {
    if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(text);
}

/** Render a value the way the replay displays it. */
export function fmt(v: Value): string {
  if (v === null) return 'NULL';
  if (typeof v === 'string') return `'${v}'`;
  if (typeof v === 'number' && !Number.isInteger(v)) return String(Math.round(v * 100) / 100);
  return String(v);
}

/** Aggregate a list of values (nulls already filtered out by the caller). */
export function aggregate(fn: AggFn, values: Value[]): Value {
  if (fn === 'count') return values.length;
  if (values.length === 0) return null;
  if (fn === 'sum' || fn === 'avg') {
    let total = 0;
    for (const v of values) total += numeric(v, fn.toUpperCase());
    return fn === 'sum' ? total : total / values.length;
  }
  let best = values[0];
  for (const v of values.slice(1)) {
    const c = compare(v, best);
    if ((fn === 'min' && c < 0) || (fn === 'max' && c > 0)) best = v;
  }
  return best;
}

/** True if the expression contains an aggregate call anywhere. */
export function hasAggregate(e: Expr): boolean {
  switch (e.k) {
    case 'agg': return true;
    case 'lit': case 'col': return false;
    case 'not': return hasAggregate(e.e);
    case 'isnull': return hasAggregate(e.e);
    case 'like': return hasAggregate(e.e) || hasAggregate(e.pat);
    case 'between': return hasAggregate(e.e) || hasAggregate(e.lo) || hasAggregate(e.hi);
    case 'in': return hasAggregate(e.e) || e.list.some(hasAggregate);
    case 'bin': return hasAggregate(e.l) || hasAggregate(e.r);
  }
}
