// Runs a parsed program once per process. A process is identified by the
// fork decisions on its history: the root is [], the child created by the
// root's first fork is [true], the root's second child is [false, true], and
// so on. Running a process means re-executing main() from the top, following
// the recorded decisions until the process "starts", and recording events
// only from then on. Re-execution reproduces every variable and the stdio
// buffer the child inherits, so fork() can happen anywhere, even inside
// `fork() && fork()`.
//
// Each process is deterministic once its fork decisions are fixed, so the
// only nondeterminism left is the scheduler's choice of which ready process
// runs next. That is handled in schedule.ts.

import { parse, type Expr, type Program, type Stmt } from './parser';

export type BufMode = 'line' | 'full' | 'none';

export type OutCause = 'newline' | 'fflush' | 'exit' | 'full' | 'unbuffered' | 'write' | 'stderr' | 'exec';

export interface OutEvent {
  kind: 'out';
  text: string;
  line: number;
  cause: OutCause;
  /** Leading characters of `text` that were already in the buffer when this process was forked. */
  inherited: number;
}
export interface ForkEvent {
  kind: 'fork';
  child: number;
  line: number;
}
export interface WaitEvent {
  kind: 'wait';
  /** Process index waited for, or null for wait()/waitpid(-1): any child. */
  target: number | null;
  line: number;
}
export interface ExitEvent {
  kind: 'exit';
  code: number;
  line: number;
  /** Buffered text thrown away (by _exit or exec). */
  discarded: string;
}
export type Ev = OutEvent | ForkEvent | WaitEvent | ExitEvent;

export interface Proc {
  index: number;
  pid: number;
  parent: number | null;
  path: boolean[];
  /** Line of the fork() call that created this process. */
  forkLine: number | null;
  events: Ev[];
  exitCode: number;
  /** stdio buffer contents copied from the parent at fork. */
  inheritedBuffer: string;
  children: number[];
}

export interface RunOptions {
  mode: BufMode;
  maxProcs?: number;
  maxSteps?: number;
}

export interface RunResult {
  procs: Proc[];
  mode: BufMode;
}

export class RunError extends Error {
  constructor(
    message: string,
    readonly line: number | null,
  ) {
    super(line === null ? message : `line ${line}: ${message}`);
  }
}

export const ROOT_PID = 1000;
const BUFSIZ = 4096;

const CONSTANTS: Record<string, number> = {
  stdin: 0,
  stdout: 1,
  stderr: 2,
  _IOFBF: 0,
  _IOLBF: 1,
  _IONBF: 2,
  EXIT_SUCCESS: 0,
  EXIT_FAILURE: 1,
  true: 1,
  false: 0,
};

class BreakSig {}
class ContinueSig {}
class ExitSig {
  constructor(
    readonly code: number,
    readonly line: number,
    readonly flush: boolean,
    readonly execOut: string | null = null,
  ) {}
}

const key = (path: boolean[]) => path.map((b) => (b ? '1' : '0')).join('');

/** printf-style formatting for %d %i %u %x %c %s %ld %%. */
export function format(fmt: string, args: (number | string)[], line: number): string {
  let out = '';
  let a = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i] as string;
    if (c !== '%') {
      out += c;
      continue;
    }
    const m = /^%([-0 +]*)(\d*)(l{0,2}|h{0,2}|z)?([diuxXcs%])/.exec(fmt.slice(i));
    if (!m) throw new RunError(`unsupported printf conversion in "${fmt}"`, line);
    i += m[0].length - 1;
    const conv = m[4] as string;
    if (conv === '%') {
      out += '%';
      continue;
    }
    if (a >= args.length) throw new RunError('printf has fewer arguments than conversions', line);
    const v = args[a++] as number | string;
    let s: string;
    if (conv === 's') {
      if (typeof v !== 'string') throw new RunError('%s needs a string argument', line);
      s = v;
    } else {
      if (typeof v !== 'number') throw new RunError(`%${conv} needs a number`, line);
      if (conv === 'c') s = String.fromCharCode(v);
      else if (conv === 'x') s = (v >>> 0).toString(16);
      else if (conv === 'X') s = (v >>> 0).toString(16).toUpperCase();
      else if (conv === 'u') s = String(v >>> 0);
      else s = String(v);
    }
    const width = m[2] ? Number(m[2]) : 0;
    const flags = m[1] as string;
    if (s.length < width) {
      if (flags.includes('-')) s = s.padEnd(width);
      else if (flags.includes('0') && conv !== 's' && conv !== 'c') {
        const neg = s.startsWith('-');
        s = (neg ? '-' : '') + s.slice(neg ? 1 : 0).padStart(width - (neg ? 1 : 0), '0');
      } else s = s.padStart(width);
    }
    out += s;
  }
  return out;
}

const toInt = (n: number) => (Number.isFinite(n) ? Math.trunc(n) | 0 : 0);

interface Child {
  index: number;
  pid: number;
  reaped: boolean;
}

/** One execution of main() for one process. */
class Execution {
  private scopes: Map<string, number>[] = [new Map()];
  private steps = 0;
  private decision = 0;
  private started: boolean;
  private buffer = '';
  private mode: BufMode;
  private inheritedLeft = 0;
  private pid = ROOT_PID;
  private ppid = ROOT_PID - 1;
  private children: Child[] = [];
  readonly events: Ev[] = [];
  inheritedBuffer = '';
  forkLine: number | null = null;

  constructor(
    private readonly runner: Runner,
    private readonly path: boolean[],
    readonly self: Proc,
  ) {
    this.started = path.length === 0;
    this.mode = runner.mode;
    if (this.started) this.self.pid = ROOT_PID;
  }

  run(prog: Program): void {
    let code = 0;
    let line = prog.body.length ? (prog.body[prog.body.length - 1] as Stmt).line : 1;
    let flush = true;
    let execOut: string | null = null;
    try {
      for (const s of prog.body) this.exec(s);
    } catch (e) {
      if (e instanceof ExitSig) {
        code = e.code;
        line = e.line;
        flush = e.flush;
        execOut = e.execOut;
      } else if (e instanceof BreakSig || e instanceof ContinueSig) {
        throw new RunError('break or continue outside a loop', null);
      } else throw e;
    }
    let discarded = '';
    if (flush) this.flush(line, 'exit');
    else {
      discarded = this.buffer;
      this.buffer = '';
    }
    if (execOut) this.emit(execOut, line, 'exec', 0);
    this.self.exitCode = code & 255;
    this.record({ kind: 'exit', code: code & 255, line, discarded });
  }

  private tick(line: number): void {
    if (++this.steps > this.runner.maxSteps) {
      throw new RunError(`more than ${this.runner.maxSteps} steps in one process (infinite loop?)`, line);
    }
  }

  private record(e: Ev): void {
    if (this.started) this.events.push(e);
  }

  private emit(text: string, line: number, cause: OutCause, inherited: number): void {
    if (text) this.record({ kind: 'out', text, line, cause, inherited });
  }

  private flush(line: number, cause: OutCause): void {
    if (!this.buffer) return;
    const inherited = Math.min(this.inheritedLeft, this.buffer.length);
    this.inheritedLeft = 0;
    this.emit(this.buffer, line, cause, inherited);
    this.buffer = '';
  }

  private write(text: string, line: number): void {
    if (this.mode === 'none') {
      this.flush(line, 'unbuffered');
      this.emit(text, line, 'unbuffered', 0);
      return;
    }
    this.buffer += text;
    if (this.mode === 'line' && text.includes('\n')) this.flush(line, 'newline');
    else if (this.buffer.length >= BUFSIZ) this.flush(line, 'full');
  }

  // ---- variables ----

  private lookup(name: string, line: number): Map<string, number> {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i] as Map<string, number>;
      if (s.has(name)) return s;
    }
    throw new RunError(`'${name}' is not declared`, line);
  }

  private get(name: string, line: number): number {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = (this.scopes[i] as Map<string, number>).get(name);
      if (v !== undefined) return v;
    }
    if (name in CONSTANTS) return CONSTANTS[name] as number;
    throw new RunError(`'${name}' is not declared`, line);
  }

  private set(name: string, v: number, line: number): number {
    this.lookup(name, line).set(name, toInt(v));
    return toInt(v);
  }

  private withScope<T>(f: () => T): T {
    this.scopes.push(new Map());
    try {
      return f();
    } finally {
      this.scopes.pop();
    }
  }

  // ---- statements ----

  private exec(s: Stmt): void {
    this.tick(s.line);
    switch (s.k) {
      case 'expr':
        this.eval(s.e);
        return;
      case 'decl':
        for (const v of s.vars) {
          (this.scopes[this.scopes.length - 1] as Map<string, number>).set(v.name, 0);
          if (v.init) this.set(v.name, this.num(v.init), s.line);
        }
        return;
      case 'block':
        this.withScope(() => {
          for (const b of s.body) this.exec(b);
        });
        return;
      case 'if':
        if (this.truthy(s.c)) this.exec(s.then);
        else if (s.else) this.exec(s.else);
        return;
      case 'while':
        while (this.truthy(s.c)) if (this.loopBody(s.body)) break;
        return;
      case 'do':
        do if (this.loopBody(s.body)) break;
        while (this.truthy(s.c));
        return;
      case 'for':
        this.withScope(() => {
          if (s.init) this.exec(s.init);
          while (s.c === null || this.truthy(s.c)) {
            if (this.loopBody(s.body)) break;
            if (s.step) this.eval(s.step);
          }
        });
        return;
      case 'break':
        throw new BreakSig();
      case 'continue':
        throw new ContinueSig();
      case 'return':
        // Only main() exists, so return exits the process (flushing stdio).
        throw new ExitSig(s.e ? this.num(s.e) : 0, s.line, true);
    }
  }

  /** Runs one iteration; returns true on break. */
  private loopBody(body: Stmt): boolean {
    this.tick(body.line);
    try {
      this.exec(body);
    } catch (e) {
      if (e instanceof BreakSig) return true;
      if (e instanceof ContinueSig) return false;
      throw e;
    }
    return false;
  }

  // ---- expressions ----

  private truthy(e: Expr): boolean {
    return this.num(e) !== 0;
  }

  private num(e: Expr): number {
    const v = this.eval(e);
    if (typeof v !== 'number') throw new RunError('a string cannot be used as a number here', e.line);
    return v;
  }

  private eval(e: Expr): number | string {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'str':
        return e.v;
      case 'null':
        return 0;
      case 'var':
        return this.get(e.name, e.line);
      case 'addr':
        this.lookup(e.name, e.line);
        return 0;
      case 'unary': {
        const v = this.num(e.e);
        if (e.op === '!') return v === 0 ? 1 : 0;
        if (e.op === '-') return toInt(-v);
        if (e.op === '~') return ~v;
        return v;
      }
      case 'logic': {
        const a = this.truthy(e.a);
        if (e.op === '&&') return a ? (this.truthy(e.b) ? 1 : 0) : 0;
        return a ? 1 : this.truthy(e.b) ? 1 : 0;
      }
      case 'cond':
        return this.truthy(e.c) ? this.eval(e.a) : this.eval(e.b);
      case 'binary': {
        if (e.op === ',') {
          this.eval(e.a);
          return this.eval(e.b);
        }
        const a = this.num(e.a);
        const b = this.num(e.b);
        return binop(e.op, a, b, e.line);
      }
      case 'assign': {
        const v = this.num(e.e);
        if (e.op === '=') return this.set(e.name, v, e.line);
        return this.set(e.name, binop(e.op.slice(0, -1), this.get(e.name, e.line), v, e.line), e.line);
      }
      case 'incdec': {
        const old = this.get(e.name, e.line);
        const nv = this.set(e.name, e.op === '++' ? old + 1 : old - 1, e.line);
        return e.prefix ? nv : old;
      }
      case 'call':
        return this.call(e);
    }
  }

  private args(e: Extract<Expr, { k: 'call' }>): (number | string)[] {
    return e.args.map((a) => this.eval(a));
  }

  private arity(e: Extract<Expr, { k: 'call' }>, n: number): void {
    if (e.args.length !== n) throw new RunError(`${e.name}() takes ${n} argument${n === 1 ? '' : 's'}`, e.line);
  }

  private call(e: Extract<Expr, { k: 'call' }>): number | string {
    const line = e.line;
    switch (e.name) {
      case 'fork':
        this.arity(e, 0);
        return this.fork(line);
      case 'getpid':
        return this.pid;
      case 'getppid':
        return this.ppid;
      case 'wait': {
        this.arity(e, 1);
        return this.wait(null, e.args[0] as Expr, line);
      }
      case 'waitpid': {
        this.arity(e, 3);
        const target = this.num(e.args[0] as Expr);
        this.eval(e.args[2] as Expr);
        return this.wait(target, e.args[1] as Expr, line);
      }
      case 'exit':
      case '_exit':
      case '_Exit': {
        this.arity(e, 1);
        throw new ExitSig(this.num(e.args[0] as Expr), line, e.name === 'exit');
      }
      case 'printf': {
        const [fmt, ...rest] = this.args(e);
        if (typeof fmt !== 'string') throw new RunError('printf needs a format string', line);
        this.write(format(fmt, rest, line), line);
        return 0;
      }
      case 'fprintf': {
        const [stream, fmt, ...rest] = this.args(e);
        if (typeof fmt !== 'string') throw new RunError('fprintf needs a format string', line);
        const text = format(fmt, rest, line);
        if (stream === 2) this.emit(text, line, 'stderr', 0);
        else this.write(text, line);
        return 0;
      }
      case 'puts': {
        this.arity(e, 1);
        const s = this.eval(e.args[0] as Expr);
        if (typeof s !== 'string') throw new RunError('puts needs a string', line);
        this.write(s + '\n', line);
        return 0;
      }
      case 'putchar': {
        this.arity(e, 1);
        const c = this.num(e.args[0] as Expr);
        this.write(String.fromCharCode(c), line);
        return c;
      }
      case 'write': {
        this.arity(e, 3);
        const [fd, s, n] = this.args(e);
        if (typeof s !== 'string' || typeof n !== 'number') throw new RunError('write(fd, "text", length)', line);
        if (fd !== 1 && fd !== 2) throw new RunError('write() supports fd 1 and 2 only', line);
        this.emit(s.slice(0, n), line, 'write', 0);
        return Math.min(n, s.length);
      }
      case 'fflush':
        this.args(e);
        this.flush(line, 'fflush');
        return 0;
      case 'setbuf': {
        const [, b] = this.args(e);
        if (b === 0) this.mode = 'none';
        return 0;
      }
      case 'setvbuf': {
        const [, , m] = this.args(e);
        this.mode = m === 2 ? 'none' : m === 1 ? 'line' : 'full';
        return 0;
      }
      case 'sleep':
      case 'usleep':
        // Every schedule is explored, so delays change nothing about what is possible.
        this.args(e);
        return 0;
      case 'WEXITSTATUS': {
        this.arity(e, 1);
        return (this.num(e.args[0] as Expr) >> 8) & 255;
      }
      case 'WIFEXITED':
        this.args(e);
        return 1;
      case 'execlp':
      case 'execl':
      case 'execle':
      case 'execv':
      case 'execvp':
        return this.exec_(e);
    }
    throw new RunError(`${e.name}() is not supported`, line);
  }

  private exec_(e: Extract<Expr, { k: 'call' }>): never {
    const raw = this.args(e);
    const argv = raw.slice(1).filter((a): a is string => typeof a === 'string');
    const prog = (argv[0] ?? (typeof raw[0] === 'string' ? raw[0] : 'prog')).split('/').pop() as string;
    let out: string;
    let code = 0;
    if (prog === 'echo') out = argv.slice(1).join(' ') + '\n';
    else if (prog === 'true') out = '';
    else if (prog === 'false') {
      out = '';
      code = 1;
    } else out = `<${argv.join(' ') || prog}>\n`;
    // exec replaces the process image: unflushed stdio output is lost.
    throw new ExitSig(code, e.line, false, out);
  }

  private fork(line: number): number {
    const i = this.decision++;
    if (!this.started) {
      const d = this.path[i] as boolean;
      const childPath = [...this.path.slice(0, i), true];
      if (d) {
        // This process is the child of this fork.
        this.ppid = this.pid;
        this.pid = this.runner.pidOf(childPath);
        this.children = [];
        if (i === this.path.length - 1) {
          this.started = true;
          this.inheritedBuffer = this.buffer;
          this.inheritedLeft = this.buffer.length;
          this.forkLine = line;
          this.self.pid = this.pid;
        }
        return 0;
      }
      const pid = this.runner.pidOf(childPath);
      this.children.push({ index: this.runner.indexOf(childPath), pid, reaped: false });
      return pid;
    }
    const childPath = [...this.path, ...new Array<boolean>(i - this.path.length).fill(false), true];
    const child = this.runner.spawn(childPath, this.self.index);
    this.children.push({ index: child.index, pid: child.pid, reaped: false });
    this.self.children.push(child.index);
    this.record({ kind: 'fork', child: child.index, line });
    return child.pid;
  }

  private wait(target: number | null, statusArg: Expr, line: number): number {
    let child: Child | undefined;
    if (target === null || target === -1) child = this.children.find((c) => !c.reaped);
    else child = this.children.find((c) => c.pid === target && !c.reaped);
    if (!child) return -1;
    child.reaped = true;
    this.record({ kind: 'wait', target: target === null || target === -1 ? null : child.index, line });
    if (statusArg.k === 'addr') this.set(statusArg.name, this.runner.exitCodeOf(child.index) << 8, line);
    return child.pid;
  }
}

class Runner {
  readonly procs: Proc[] = [];
  private byPath = new Map<string, number>();
  private done = new Set<number>();
  readonly maxProcs: number;
  readonly maxSteps: number;
  readonly mode: BufMode;

  constructor(
    private readonly prog: Program,
    opts: RunOptions,
  ) {
    this.mode = opts.mode;
    this.maxProcs = opts.maxProcs ?? 64;
    this.maxSteps = opts.maxSteps ?? 100_000;
  }

  pidOf(path: boolean[]): number {
    return (this.procs[this.indexOf(path)] as Proc).pid;
  }

  indexOf(path: boolean[]): number {
    const i = this.byPath.get(key(path));
    /* c8 ignore next */
    if (i === undefined) throw new RunError('internal: unknown process', null);
    return i;
  }

  spawn(path: boolean[], parent: number | null): Proc {
    if (this.procs.length >= this.maxProcs) {
      throw new RunError(`more than ${this.maxProcs} processes (fork bomb?)`, null);
    }
    const p: Proc = {
      index: this.procs.length,
      pid: ROOT_PID + this.procs.length,
      parent,
      path,
      forkLine: null,
      events: [],
      exitCode: 0,
      inheritedBuffer: '',
      children: [],
    };
    this.procs.push(p);
    this.byPath.set(key(path), p.index);
    return p;
  }

  runProc(index: number): void {
    if (this.done.has(index)) return;
    this.done.add(index);
    const p = this.procs[index] as Proc;
    const ex = new Execution(this, p.path, p);
    ex.run(this.prog);
    p.events = ex.events;
    p.forkLine = ex.forkLine;
    p.inheritedBuffer = ex.inheritedBuffer;
  }

  exitCodeOf(index: number): number {
    this.runProc(index);
    return (this.procs[index] as Proc).exitCode;
  }

  runAll(): void {
    this.spawn([], null);
    for (let i = 0; i < this.procs.length; i++) this.runProc(i);
  }
}

export function runProgram(prog: Program, opts: RunOptions): RunResult {
  const r = new Runner(prog, opts);
  r.runAll();
  return { procs: r.procs, mode: opts.mode };
}

export function runSource(src: string, opts: RunOptions): RunResult {
  return runProgram(parse(src), opts);
}

function binop(op: string, a: number, b: number, line: number): number {
  switch (op) {
    case '+':
      return toInt(a + b);
    case '-':
      return toInt(a - b);
    case '*':
      return Math.imul(a, b);
    case '/':
    case '%':
      if (b === 0) throw new RunError('division by zero', line);
      return op === '/' ? toInt(a / b) : toInt(a % b);
    case '<':
      return a < b ? 1 : 0;
    case '>':
      return a > b ? 1 : 0;
    case '<=':
      return a <= b ? 1 : 0;
    case '>=':
      return a >= b ? 1 : 0;
    case '==':
      return a === b ? 1 : 0;
    case '!=':
      return a !== b ? 1 : 0;
    case '&':
      return a & b;
    case '|':
      return a | b;
    case '^':
      return a ^ b;
    case '<<':
      return a << b;
    case '>>':
      return a >> b;
  }
  /* c8 ignore next */
  throw new RunError(`unknown operator ${op}`, line);
}
