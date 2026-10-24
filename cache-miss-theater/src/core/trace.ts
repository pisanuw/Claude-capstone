// Runs a parsed kernel and records every array access as an exact byte
// address. Scalars live in registers (no memory traffic); array elements are
// laid out row-major from each array's base address. Array contents are not
// tracked: reading an element yields an unknown value, so an index or loop
// bound that depends on array contents is reported as an error.
//
// Evaluation order: for `x = e` the reads in e happen left to right, then the
// write to x. For `x op= e` and `x++` the read of x comes first, then e, then
// the write. That is the order most textbook traces use.

import { parse, ParseError, type Expr, type Stmt } from './parser';

export class RunError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
  }
}

export interface ArrayInfo {
  name: string;
  type: string;
  elemSize: number;
  dims: number[];
  base: number;
  bytes: number;
  /** Index into the trace's array table, also used for colours. */
  id: number;
}

export interface Trace {
  arrays: ArrayInfo[];
  /** #defines and top-level scalars with constant initialisers that are never assigned again, in source order. */
  constants: { name: string; value: number }[];
  length: number;
  addr: Float64Array;
  array: Uint16Array;
  elem: Uint32Array;
  write: Uint8Array;
  line: Uint32Array;
}

export interface TraceOptions {
  /** Replace the value of a #define or top-level scalar constant. */
  overrides?: Record<string, number>;
  /** Default 2,000,000 accesses. */
  maxAccesses?: number;
  /** Default 50,000,000 interpreter steps. */
  maxSteps?: number;
  /** First array's base address when none is given with `@`. Default 0x10000. */
  baseAddress?: number;
  /** Alignment of automatically placed arrays. Default 64 bytes. */
  align?: number;
}

export const MAX_ACCESSES = 2_000_000;

class Buf {
  addr = new Float64Array(1024);
  array = new Uint16Array(1024);
  elem = new Uint32Array(1024);
  write = new Uint8Array(1024);
  line = new Uint32Array(1024);
  n = 0;
  push(addr: number, array: number, elem: number, write: boolean, line: number): void {
    if (this.n === this.addr.length) {
      const grow = <T extends Float64Array | Uint16Array | Uint32Array | Uint8Array>(a: T): T => {
        const b = new (a.constructor as new (n: number) => T)(a.length * 2);
        b.set(a);
        return b;
      };
      this.addr = grow(this.addr);
      this.array = grow(this.array);
      this.elem = grow(this.elem);
      this.write = grow(this.write);
      this.line = grow(this.line);
    }
    const i = this.n++;
    this.addr[i] = addr;
    this.array[i] = array;
    this.elem[i] = elem;
    this.write[i] = write ? 1 : 0;
    this.line[i] = line;
  }
}

const UNKNOWN = NaN;

function int(v: number, what: string, line: number): number {
  if (Number.isNaN(v)) throw new RunError(`${what} depends on array contents, which are not simulated`, line);
  if (!Number.isFinite(v)) throw new RunError(`${what} is not a finite number`, line);
  return Math.trunc(v);
}

export function elementLabel(a: ArrayInfo, elem: number): string {
  const idx: number[] = [];
  let rest = elem;
  for (let d = a.dims.length - 1; d >= 0; d--) {
    const n = a.dims[d] as number;
    idx.unshift(rest % n);
    rest = Math.floor(rest / n);
  }
  return `${a.name}${idx.map((i) => `[${i}]`).join('')}`;
}

export function buildTrace(src: string, opts: TraceOptions = {}): Trace {
  const program = parse(src);
  const overrides = opts.overrides ?? {};
  const maxAccesses = opts.maxAccesses ?? MAX_ACCESSES;
  const maxSteps = opts.maxSteps ?? 50_000_000;
  const align = opts.align ?? 64;
  let nextBase = opts.baseAddress ?? 0x10000;

  const arrays = new Map<string, ArrayInfo>();
  const constants: { name: string; value: number }[] = [];
  const modified = new Set<string>();
  const scopes: Map<string, number>[] = [new Map()];
  const buf = new Buf();
  let steps = 0;
  let depth = 0;

  const tick = (line: number) => {
    if (++steps > maxSteps) throw new RunError(`stopped after ${maxSteps.toLocaleString('en-US')} steps; make the loops smaller`, line);
  };
  const lookup = (name: string): Map<string, number> | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) if ((scopes[i] as Map<string, number>).has(name)) return scopes[i];
    return undefined;
  };

  function address(e: Extract<Expr, { k: 'index' }>): { a: ArrayInfo; elem: number } {
    const a = arrays.get(e.name);
    if (!a) {
      if (lookup(e.name)) throw new RunError(`'${e.name}' is a scalar, not an array`, e.line);
      throw new RunError(`unknown array '${e.name}'; declare it first, e.g. double ${e.name}[64];`, e.line);
    }
    if (e.idx.length !== a.dims.length)
      throw new RunError(`'${e.name}' has ${a.dims.length} dimension${a.dims.length > 1 ? 's' : ''} but is indexed with ${e.idx.length}`, e.line);
    let elem = 0;
    const shown: number[] = [];
    e.idx.forEach((ix, d) => {
      const v = int(evalExpr(ix), `the index of ${e.name}`, e.line);
      shown.push(v);
      const n = a.dims[d] as number;
      if (v < 0 || v >= n) {
        throw new RunError(`${e.name}${shown.map((s) => `[${s}]`).join('')}${'[…]'.repeat(e.idx.length - shown.length)} is out of bounds (dimension ${d + 1} has size ${n})`, e.line);
      }
      elem = elem * n + v;
    });
    return { a, elem };
  }

  function access(a: ArrayInfo, elem: number, write: boolean, line: number): void {
    if (buf.n >= maxAccesses) throw new RunError(`more than ${maxAccesses.toLocaleString('en-US')} memory accesses; make the arrays or loops smaller`, line);
    buf.push(a.base + elem * a.elemSize, a.id, elem, write, line);
  }

  function read(target: Expr): number {
    if (target.k === 'index') {
      const { a, elem } = address(target);
      access(a, elem, false, target.line);
      return UNKNOWN;
    }
    const name = (target as Extract<Expr, { k: 'var' }>).name;
    const s = lookup(name);
    if (!s) {
      if (arrays.has(name)) throw new RunError(`array '${name}' used without an index`, target.line);
      throw new RunError(`unknown variable '${name}'`, target.line);
    }
    return s.get(name) as number;
  }

  function store(target: Expr, v: number, at: { a: ArrayInfo; elem: number } | null): void {
    if (target.k === 'index') {
      const { a, elem } = at ?? address(target);
      access(a, elem, true, target.line);
      return;
    }
    const name = (target as Extract<Expr, { k: 'var' }>).name;
    const s = lookup(name);
    if (!s) throw new RunError(`unknown variable '${name}'; declare it first`, target.line);
    s.set(name, v);
    // A scalar the program changes is not a constant worth sweeping.
    if (s === scopes[0] || depth === 0) modified.add(name);
  }

  function arith(op: string, l: number, r: number, line: number): number {
    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/':
        if (r === 0) throw new RunError('division by zero', line);
        return Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r;
      case '%':
        if (r === 0) throw new RunError('division by zero', line);
        return l % r;
      case '<': return +(l < r);
      case '<=': return +(l <= r);
      case '>': return +(l > r);
      case '>=': return +(l >= r);
      case '==': return +(l === r);
      case '!=': return +(l !== r);
      case '&': return l & r;
      case '|': return l | r;
      case '^': return l ^ r;
      case '<<': return l << r;
      case '>>': return l >> r;
    }
    /* c8 ignore next */
    throw new RunError(`unsupported operator ${op}`, line);
  }

  function evalExpr(e: Expr): number {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'var':
      case 'index':
        return read(e);
      case 'unary': {
        const v = evalExpr(e.e);
        if (e.op === '-') return -v;
        if (e.op === '+') return v;
        if (e.op === '!') return Number.isNaN(v) ? UNKNOWN : +!v;
        return ~v;
      }
      case 'binary': {
        if (e.op === ',') {
          evalExpr(e.l);
          return evalExpr(e.r);
        }
        if (e.op === '&&' || e.op === '||') {
          const l = evalExpr(e.l);
          if (Number.isNaN(l)) throw new RunError(`a condition depends on array contents, which are not simulated`, e.line);
          if (e.op === '&&' ? !l : l) return +!!l;
          return +!!int(evalExpr(e.r), 'a condition', e.line);
        }
        const l = evalExpr(e.l);
        const r = evalExpr(e.r);
        if (Number.isNaN(l) || Number.isNaN(r)) return UNKNOWN;
        return arith(e.op, l, r, e.line);
      }
      case 'cond':
        return int(evalExpr(e.c), 'a ?: condition', e.line) ? evalExpr(e.t) : evalExpr(e.f);
      case 'call': {
        const vs = e.args.map(evalExpr);
        if (vs.some(Number.isNaN)) return UNKNOWN;
        if (e.name === 'abs') return Math.abs(vs[0] as number);
        return e.name === 'min' ? Math.min(vs[0] as number, vs[1] as number) : Math.max(vs[0] as number, vs[1] as number);
      }
      case 'assign': {
        if (e.op === '=') {
          const v = evalExpr(e.e);
          store(e.target, v, null);
          return v;
        }
        const at = e.target.k === 'index' ? address(e.target) : null;
        let old: number;
        if (at) {
          access(at.a, at.elem, false, e.target.line);
          old = UNKNOWN;
        } else old = read(e.target);
        const r = evalExpr(e.e);
        const v = Number.isNaN(old) || Number.isNaN(r) ? UNKNOWN : arith(e.op.slice(0, -1), old, r, e.line);
        store(e.target, v, at);
        return v;
      }
      case 'incdec': {
        const at = e.target.k === 'index' ? address(e.target) : null;
        let old: number;
        if (at) {
          access(at.a, at.elem, false, e.target.line);
          old = UNKNOWN;
        } else old = read(e.target);
        const v = old + (e.op === '++' ? 1 : -1);
        store(e.target, v, at);
        return e.prefix ? v : old;
      }
    }
  }

  function declare(s: Extract<Stmt, { k: 'decl' }>): void {
    for (const d of s.vars) {
      if (arrays.has(d.name) || (scopes.at(-1) as Map<string, number>).has(d.name))
        throw new RunError(`'${d.name}' is declared twice`, d.line);
      if (d.dims.length) {
        const dims = d.dims.map((x) => int(evalExpr(x), `the size of ${d.name}`, d.line));
        if (dims.some((n) => n <= 0)) throw new RunError(`array '${d.name}' needs positive sizes`, d.line);
        const count = dims.reduce((a, b) => a * b, 1);
        const bytes = count * s.elemSize;
        if (count > 64 * 1024 * 1024) throw new RunError(`array '${d.name}' is too large (${count.toLocaleString('en-US')} elements)`, d.line);
        let base: number;
        if (d.at) {
          base = int(evalExpr(d.at), `the address of ${d.name}`, d.line);
          if (base < 0) throw new RunError(`array '${d.name}' needs a non-negative address`, d.line);
        } else base = Math.ceil(nextBase / align) * align;
        nextBase = Math.max(nextBase, base + bytes);
        const info: ArrayInfo = { name: d.name, type: s.type, elemSize: s.elemSize, dims, base, bytes, id: arrays.size };
        for (const other of arrays.values())
          if (base < other.base + other.bytes && other.base < base + bytes)
            throw new RunError(`array '${d.name}' overlaps '${other.name}' in memory`, d.line);
        arrays.set(d.name, info);
        continue;
      }
      let v = d.init ? evalExpr(d.init) : 0;
      if (depth === 0 && d.name in overrides) v = overrides[d.name] as number;
      if (depth === 0 && d.init && !Number.isNaN(v)) constants.push({ name: d.name, value: v });
      (scopes.at(-1) as Map<string, number>).set(d.name, v);
    }
  }

  function exec(s: Stmt): void {
    tick(s.line);
    switch (s.k) {
      case 'empty':
        return;
      case 'define': {
        if (lookup(s.name) || arrays.has(s.name)) throw new RunError(`'${s.name}' is already defined`, s.line);
        const v = s.name in overrides ? (overrides[s.name] as number) : int(evalExpr(s.e), `#define ${s.name}`, s.line);
        constants.push({ name: s.name, value: v });
        (scopes[0] as Map<string, number>).set(s.name, v);
        return;
      }
      case 'decl':
        declare(s);
        return;
      case 'expr':
        evalExpr(s.e);
        return;
      case 'block':
        scopes.push(new Map());
        depth++;
        try {
          for (const b of s.body) exec(b);
        } finally {
          scopes.pop();
          depth--;
        }
        return;
      case 'if':
        if (int(evalExpr(s.cond), 'the if condition', s.line)) exec(s.then);
        else if (s.else) exec(s.else);
        return;
      case 'while':
        depth++;
        try {
          while (int(evalExpr(s.cond), 'the loop condition', s.line)) {
            tick(s.line);
            exec(s.body);
          }
        } finally {
          depth--;
        }
        return;
      case 'for':
        scopes.push(new Map());
        depth++;
        try {
          if (s.init) exec(s.init);
          while (s.cond === null || int(evalExpr(s.cond), 'the loop condition', s.line)) {
            tick(s.line);
            exec(s.body);
            if (s.step) evalExpr(s.step);
          }
        } finally {
          scopes.pop();
          depth--;
        }
        return;
    }
  }

  // A top-level function body counts as top level for constants.
  for (const s of program) {
    if (s.k === 'block') for (const b of s.body) exec(b);
    else exec(s);
  }

  const n = buf.n;
  return {
    arrays: [...arrays.values()],
    constants: constants.filter((c) => !modified.has(c.name)),
    length: n,
    addr: buf.addr.slice(0, n),
    array: buf.array.slice(0, n),
    elem: buf.elem.slice(0, n),
    write: buf.write.slice(0, n),
    line: buf.line.slice(0, n),
  };
}

export { ParseError };
