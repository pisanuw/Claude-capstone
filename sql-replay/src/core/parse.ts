import { tokenize, type Token } from './tokenize';
import {
  SqlError,
  type AggFn,
  type Expr,
  type JoinClause,
  type OrderKey,
  type SelectItem,
  type SelectQuery,
} from './types';

const AGG_FNS: AggFn[] = ['count', 'sum', 'avg', 'min', 'max'];
const RESERVED = new Set([
  'select', 'distinct', 'as', 'from', 'join', 'inner', 'left', 'outer', 'on',
  'where', 'group', 'by', 'having', 'order', 'asc', 'desc', 'limit', 'offset',
  'and', 'or', 'not', 'in', 'like', 'between', 'is', 'null', 'true', 'false',
]);

class Parser {
  private tokens: Token[];
  private i = 0;

  constructor(private sql: string) {
    this.tokens = tokenize(sql);
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.tokens[this.i];
    if (t.type !== 'eof') this.i++;
    return t;
  }

  private isKw(kw: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'ident' && t.text === kw;
  }

  private takeKw(kw: string): boolean {
    if (this.isKw(kw)) { this.next(); return true; }
    return false;
  }

  private expectKw(kw: string): void {
    if (!this.takeKw(kw)) {
      const t = this.peek();
      throw new SqlError(`Expected ${kw.toUpperCase()} but found ${describe(t)}`, t.pos);
    }
  }

  private expectPunct(p: string): void {
    const t = this.peek();
    if (t.type === 'punct' && t.text === p) { this.next(); return; }
    throw new SqlError(`Expected "${p}" but found ${describe(t)}`, t.pos);
  }

  private isPunct(p: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'punct' && t.text === p;
  }

  /** Source text between two token indexes (inclusive start, exclusive end). */
  private slice(fromTokenIdx: number, toTokenIdx: number): string {
    const start = this.tokens[fromTokenIdx].pos;
    const endTok = this.tokens[Math.min(toTokenIdx, this.tokens.length - 1)];
    const end = toTokenIdx >= this.tokens.length - 1 && endTok.type === 'eof'
      ? this.sql.length
      : endTok.pos;
    return this.sql.slice(start, end).trim();
  }

  parseQuery(): SelectQuery {
    this.expectKw('select');
    const distinct = this.takeKw('distinct');
    const items = this.parseSelectList();
    this.expectKw('from');
    const from = this.parseTableRef();
    const joins: JoinClause[] = [];
    for (;;) {
      let kind: 'inner' | 'left' | null = null;
      if (this.isKw('join')) { this.next(); kind = 'inner'; }
      else if (this.isKw('inner') && this.isKw('join', 1)) { this.next(); this.next(); kind = 'inner'; }
      else if (this.isKw('left')) {
        this.next();
        this.takeKw('outer');
        this.expectKw('join');
        kind = 'left';
      }
      if (!kind) break;
      const ref = this.parseTableRef();
      this.expectKw('on');
      const onStart = this.i;
      const on = this.parseExpr();
      joins.push({ kind, table: ref.table, alias: ref.alias, on, onText: this.slice(onStart, this.i) });
    }
    let where: SelectQuery['where'] = null;
    if (this.takeKw('where')) {
      const start = this.i;
      const expr = this.parseExpr();
      where = { expr, text: this.slice(start, this.i) };
    }
    let groupBy: SelectQuery['groupBy'] = null;
    if (this.isKw('group')) {
      this.next();
      this.expectKw('by');
      const exprs: Expr[] = [];
      const texts: string[] = [];
      do {
        const start = this.i;
        exprs.push(this.parseExpr());
        texts.push(this.slice(start, this.i));
      } while (this.takePunct(','));
      groupBy = { exprs, texts };
    }
    let having: SelectQuery['having'] = null;
    if (this.takeKw('having')) {
      const start = this.i;
      const expr = this.parseExpr();
      having = { expr, text: this.slice(start, this.i) };
    }
    const orderBy: OrderKey[] = [];
    if (this.isKw('order')) {
      this.next();
      this.expectKw('by');
      do {
        const start = this.i;
        const expr = this.parseExpr();
        const text = this.slice(start, this.i);
        let desc = false;
        if (this.takeKw('desc')) desc = true;
        else this.takeKw('asc');
        orderBy.push({ expr, desc, text });
      } while (this.takePunct(','));
    }
    let limit: SelectQuery['limit'] = null;
    if (this.takeKw('limit')) {
      const count = this.parseNonNegativeInt('LIMIT');
      let offset = 0;
      if (this.takeKw('offset')) offset = this.parseNonNegativeInt('OFFSET');
      limit = { count, offset };
    }
    const t = this.peek();
    if (t.type !== 'eof') {
      throw new SqlError(`Unexpected ${describe(t)} after end of query`, t.pos);
    }
    return { distinct, items, from, joins, where, groupBy, having, orderBy, limit };
  }

  private takePunct(p: string): boolean {
    if (this.isPunct(p)) { this.next(); return true; }
    return false;
  }

  private parseNonNegativeInt(clause: string): number {
    const t = this.peek();
    if (t.type !== 'number' || !/^\d+$/.test(t.text)) {
      throw new SqlError(`${clause} expects a whole number, found ${describe(t)}`, t.pos);
    }
    this.next();
    return parseInt(t.text, 10);
  }

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    do {
      const t = this.peek();
      if (t.type === 'op' && t.text === '*') {
        this.next();
        items.push({ expr: { k: 'star', table: null }, alias: null, text: '*' });
        continue;
      }
      if (t.type === 'ident' && !RESERVED.has(t.text) && this.isPunct('.', 1)) {
        const t2 = this.peek(2);
        if (t2.type === 'op' && t2.text === '*') {
          this.next(); this.next(); this.next();
          items.push({ expr: { k: 'star', table: t.raw }, alias: null, text: `${t.raw}.*` });
          continue;
        }
      }
      const start = this.i;
      const expr = this.parseExpr();
      const text = this.slice(start, this.i);
      let alias: string | null = null;
      if (this.takeKw('as')) {
        alias = this.parseIdentifier('alias');
      } else if (this.peek().type === 'ident' && !RESERVED.has(this.peek().text)) {
        alias = this.next().raw;
      }
      items.push({ expr, alias, text });
    } while (this.takePunct(','));
    if (items.length === 0) throw new SqlError('SELECT list is empty');
    return items;
  }

  private parseIdentifier(what: string): string {
    const t = this.peek();
    if (t.type !== 'ident' || RESERVED.has(t.text)) {
      throw new SqlError(`Expected ${what} name, found ${describe(t)}`, t.pos);
    }
    this.next();
    return t.raw;
  }

  private parseTableRef(): { table: string; alias: string } {
    const table = this.parseIdentifier('table');
    let alias = table;
    if (this.takeKw('as')) alias = this.parseIdentifier('alias');
    else if (this.peek().type === 'ident' && !RESERVED.has(this.peek().text)) alias = this.next().raw;
    return { table, alias };
  }

  /* ------------------------------ expressions ------------------------------ */

  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let l = this.parseAnd();
    while (this.takeKw('or')) {
      const r = this.parseAnd();
      l = { k: 'bin', op: 'or', l, r };
    }
    return l;
  }

  private parseAnd(): Expr {
    let l = this.parseNot();
    while (this.takeKw('and')) {
      const r = this.parseNot();
      l = { k: 'bin', op: 'and', l, r };
    }
    return l;
  }

  private parseNot(): Expr {
    if (this.takeKw('not')) {
      return { k: 'not', e: this.parseNot() };
    }
    return this.parsePredicate();
  }

  private parsePredicate(): Expr {
    const e = this.parseAdditive();
    const t = this.peek();
    if (t.type === 'op' && ['=', '!=', '<', '<=', '>', '>='].includes(t.text)) {
      this.next();
      const r = this.parseAdditive();
      return { k: 'bin', op: t.text as '=', l: e, r };
    }
    let neg = false;
    if (this.isKw('not') && (this.isKw('in', 1) || this.isKw('like', 1) || this.isKw('between', 1))) {
      this.next();
      neg = true;
    }
    if (this.takeKw('in')) {
      this.expectPunct('(');
      const list: Expr[] = [];
      do {
        list.push(this.parseAdditive());
      } while (this.takePunct(','));
      this.expectPunct(')');
      return { k: 'in', e, list, neg };
    }
    if (this.takeKw('like')) {
      const pat = this.parseAdditive();
      return { k: 'like', e, pat, neg };
    }
    if (this.takeKw('between')) {
      const lo = this.parseAdditive();
      this.expectKw('and');
      const hi = this.parseAdditive();
      return { k: 'between', e, lo, hi, neg };
    }
    if (this.takeKw('is')) {
      const isNeg = this.takeKw('not');
      this.expectKw('null');
      return { k: 'isnull', e, neg: isNeg };
    }
    // `neg` is only ever set when the next keyword is IN/LIKE/BETWEEN, so one
    // of the branches above has always consumed it by the time we get here.
    return e;
  }

  private parseAdditive(): Expr {
    let l = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.text === '+' || t.text === '-')) {
        this.next();
        const r = this.parseMultiplicative();
        l = { k: 'bin', op: t.text, l, r };
      } else return l;
    }
  }

  private parseMultiplicative(): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.text === '*' || t.text === '/' || t.text === '%')) {
        this.next();
        const r = this.parseUnary();
        l = { k: 'bin', op: t.text, l, r };
      } else return l;
    }
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.type === 'op' && t.text === '-') {
      this.next();
      const e = this.parseUnary();
      if (e.k === 'lit' && typeof e.v === 'number') return { k: 'lit', v: -e.v };
      return { k: 'bin', op: '-', l: { k: 'lit', v: 0 }, r: e };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === 'number') {
      this.next();
      return { k: 'lit', v: parseFloat(t.text) };
    }
    if (t.type === 'string') {
      this.next();
      return { k: 'lit', v: t.text };
    }
    if (this.isPunct('(')) {
      this.next();
      const e = this.parseExpr();
      this.expectPunct(')');
      return e;
    }
    if (t.type === 'ident') {
      if (t.text === 'null') { this.next(); return { k: 'lit', v: null }; }
      if (t.text === 'true') { this.next(); return { k: 'lit', v: true }; }
      if (t.text === 'false') { this.next(); return { k: 'lit', v: false }; }
      if (AGG_FNS.includes(t.text as AggFn) && this.isPunct('(', 1)) {
        const fn = t.text as AggFn;
        this.next(); this.next();
        let arg: Expr | '*';
        const inner = this.peek();
        if (inner.type === 'op' && inner.text === '*') {
          if (fn !== 'count') throw new SqlError(`${fn.toUpperCase()}(*) is not valid; only COUNT(*) is`, inner.pos);
          this.next();
          arg = '*';
        } else {
          arg = this.parseExpr();
        }
        this.expectPunct(')');
        return { k: 'agg', fn, arg };
      }
      if (!RESERVED.has(t.text)) {
        this.next();
        if (this.isPunct('.')) {
          this.next();
          const col = this.parseIdentifier('column');
          return { k: 'col', table: t.raw, name: col };
        }
        return { k: 'col', table: null, name: t.raw };
      }
    }
    throw new SqlError(`Expected an expression, found ${describe(t)}`, t.pos);
  }
}

function describe(t: Token): string {
  if (t.type === 'eof') return 'end of query';
  return `"${t.raw}"`;
}

/** Parse a single SQL SELECT statement into an AST. Throws SqlError on invalid input. */
export function parse(sql: string): SelectQuery {
  if (!sql.trim()) throw new SqlError('Type a SELECT query to replay');
  return new Parser(sql).parseQuery();
}
