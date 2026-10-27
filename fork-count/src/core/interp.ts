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
//
// Pipes keep that property by allowing one writing and one reading process
// per pipe, and by delivering each write() as a unit: a read returns the
// unread part of the oldest write, up to the requested size. The bytes a
// process reads are then the same in every schedule, only *when* it reads
// them varies. A reader may need data from a process that has not run yet,
// so the runner iterates: a process that reads past the data known so far is
// suspended and re-run once more has been written. When nothing can make
// progress, a pipe whose write ends are all held by finished processes is at
// end of file, and anything still waiting after that is blocked forever.

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
/** Bytes written into a pipe (directly, or by flushing stdout after dup2). */
export interface PipeWriteEvent {
  kind: 'pwrite';
  pipe: number;
  /** Index of this write among the pipe's writes. */
  seq: number;
  text: string;
  line: number;
  cause: OutCause;
}
export interface ReadEvent {
  kind: 'read';
  pipe: number;
  /** The write whose bytes this read returns (or is waiting for). */
  seq: number;
  /** Returned 0: every write end was closed and the pipe was empty. */
  eof: boolean;
  text: string;
  line: number;
  /** Never returns: no data arrives and some write end is never closed. */
  forever: boolean;
}
/** The process closed its last descriptor for the write end of a pipe. */
export interface CloseEvent {
  kind: 'close';
  pipe: number;
  line: number;
}
export type Ev = OutEvent | ForkEvent | WaitEvent | ExitEvent | PipeWriteEvent | ReadEvent | CloseEvent;

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
  /**
   * Pipes whose write end this process holds at some point, mapped to the
   * index of the event that releases its last copy (a close, or the exit);
   * Infinity when it never does.
   */
  writeEnds: Map<number, number>;
  /** The process ends blocked in read() or wait() instead of exiting. */
  blocked: boolean;
}

export interface PipeInfo {
  id: number;
  /** Line of the pipe() call. */
  line: number;
  /** Process that created it. */
  creator: number;
  writer: number | null;
  reader: number | null;
  /** Where each write happens: process and event index. */
  writes: { proc: number; idx: number }[];
}

export interface RunOptions {
  mode: BufMode;
  maxProcs?: number;
  maxSteps?: number;
}

export interface RunResult {
  procs: Proc[];
  mode: BufMode;
  pipes: PipeInfo[];
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
  STDIN_FILENO: 0,
  STDOUT_FILENO: 1,
  STDERR_FILENO: 2,
  BUFSIZ: 8192,
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
  ) {}
}
/** The process blocks forever; its last recorded event never completes. */
class BlockSig {}
/** The process needs data (or an exit status) that is not known yet: re-run it later. */
class Suspend {}

/** An int array, or an array of strings such as an argv. */
interface IntArr {
  t: 'arr';
  v: (number | string)[];
}
/** A char array: bytes as char codes. */
interface CharBuf {
  t: 'buf';
  v: number[];
}
type Val = number | string | IntArr | CharBuf;

/** An open file descriptor: the terminal, or one end of a pipe. */
type Fd = { k: 'tty' } | { k: 'pipe'; pipe: number; w: boolean };

const cstr = (b: CharBuf): string => {
  const end = b.v.indexOf(0);
  return String.fromCharCode(...(end < 0 ? b.v : b.v.slice(0, end)));
};

/** Little-endian bytes of a 32-bit int, as write(fd, &x, sizeof x) sends them. */
const intBytes = (v: number, n: number) =>
  String.fromCharCode(...[0, 1, 2, 3].slice(0, Math.max(0, Math.min(n, 4))).map((k) => (v >>> (8 * k)) & 255));

const bytesInt = (s: string) => {
  let v = 0;
  for (let k = 0; k < Math.min(4, s.length); k++) v |= (s.charCodeAt(k) & 255) << (8 * k);
  return v | 0;
};

const key = (path: boolean[]) => path.map((b) => (b ? '1' : '0')).join('');

/** printf-style formatting for %d %i %u %x %c %s %ld %%. */
export function format(fmt: string, args: (number | string)[], line: number): string {
  args = args.map((a) => (typeof a === 'string' && a.includes('\0') ? a.slice(0, a.indexOf('\0')) : a));
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

type CallExpr = Extract<Expr, { k: 'call' }>;

/** One execution of main() for one process. */
class Execution {
  private scopes: Map<string, Val>[] = [new Map()];
  private steps = 0;
  private decision = 0;
  private started: boolean;
  private buffer = '';
  private mode: BufMode;
  /** stdio picks its buffering on first use: a pipe on fd 1 makes a line-buffered stdout fully buffered. */
  private stdioReady = false;
  private inheritedLeft = 0;
  private pid = ROOT_PID;
  private ppid = ROOT_PID - 1;
  private children: Child[] = [];
  private fds = new Map<number, Fd>([
    [0, { k: 'tty' }],
    [1, { k: 'tty' }],
    [2, { k: 'tty' }],
  ]);
  /** Identity of the process being replayed, for naming the pipes it creates. */
  private ident = '';
  private identIndex = 0;
  private pipesMade = 0;
  /** Per pipe: the next unread write and the offset into it. */
  private cursors = new Map<number, { seq: number; off: number }>();
  private writesMade = new Map<number, number>();
  private execDiscarded: string | null = null;
  readonly events: Ev[] = [];
  readonly writeEnds = new Map<number, number>();
  inheritedBuffer = '';
  forkLine: number | null = null;
  blocked = false;

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
    try {
      for (const s of prog.body) this.exec(s);
    } catch (e) {
      if (e instanceof ExitSig) {
        code = e.code;
        line = e.line;
        flush = e.flush;
      } else if (e instanceof BlockSig) {
        this.blocked = true;
        return;
      } else if (e instanceof BreakSig || e instanceof ContinueSig) {
        throw new RunError('break or continue outside a loop', null);
      } else throw e;
    }
    let discarded = '';
    if (flush) this.flush(line, 'exit');
    else {
      discarded = this.execDiscarded ?? this.buffer;
      this.buffer = '';
    }
    this.self.exitCode = code & 255;
    this.record({ kind: 'exit', code: code & 255, line, discarded });
    for (const [pipe, at] of this.writeEnds) if (at === Infinity) this.writeEnds.set(pipe, this.events.length - 1);
  }

  /** Pipes whose write end this execution holds right now. */
  heldWriteEnds(): Set<number> {
    const out = new Set<number>();
    for (const f of this.fds.values()) if (f.k === 'pipe' && f.w) out.add(f.pipe);
    return out;
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

  /** write(2) on a descriptor: the terminal prints, a pipe queues the bytes. Returns -1 on a bad descriptor. */
  private fdWrite(fd: number, text: string, line: number, cause: OutCause, inherited = 0): number {
    const f = this.fds.get(fd);
    if (!f || (f.k === 'pipe' && !f.w)) return -1;
    if (!text) return 0;
    if (f.k === 'tty') this.emit(text, line, cause, inherited);
    else {
      const seq = this.writesMade.get(f.pipe) ?? 0;
      if (this.started) {
        this.writesMade.set(f.pipe, seq + 1);
        this.runner.pipeWrite(f.pipe, seq, text, this.self.index);
        this.record({ kind: 'pwrite', pipe: f.pipe, seq, text, line, cause });
      }
    }
    return text.length;
  }

  private flush(line: number, cause: OutCause): void {
    if (!this.buffer) return;
    const inherited = Math.min(this.inheritedLeft, this.buffer.length);
    this.inheritedLeft = 0;
    this.fdWrite(1, this.buffer, line, cause, inherited);
    this.buffer = '';
  }

  private write(text: string, line: number): void {
    if (!this.stdioReady) {
      this.stdioReady = true;
      if (this.mode === 'line' && this.fds.get(1)?.k !== 'tty') this.mode = 'full';
    }
    if (this.mode === 'none') {
      this.flush(line, 'unbuffered');
      this.fdWrite(1, text, line, 'unbuffered');
      return;
    }
    this.buffer += text;
    if (this.mode === 'line' && text.includes('\n')) this.flush(line, 'newline');
    else if (this.buffer.length >= BUFSIZ) this.flush(line, 'full');
  }

  // ---- file descriptors and pipes ----

  private lowestFreeFd(): number {
    let fd = 0;
    while (this.fds.has(fd)) fd++;
    return fd;
  }

  private writeCopies(pipe: number): number {
    let n = 0;
    for (const f of this.fds.values()) if (f.k === 'pipe' && f.w && f.pipe === pipe) n++;
    return n;
  }

  /** Removes a descriptor; records a close event when it was the last copy of a write end. */
  private dropFd(fd: number, line: number): void {
    const f = this.fds.get(fd);
    this.fds.delete(fd);
    if (f?.k === 'pipe' && f.w && this.writeCopies(f.pipe) === 0 && this.started) {
      this.record({ kind: 'close', pipe: f.pipe, line });
      this.writeEnds.set(f.pipe, this.events.length - 1);
    }
  }

  private pipe(e: CallExpr): number {
    this.arity(e, 1);
    const arg = e.args[0] as Expr;
    const arr = arg.k === 'var' ? this.getVal(arg.name, arg.line) : null;
    if (!arr || typeof arr !== 'object' || arr.t !== 'arr' || arr.v.length < 2) {
      throw new RunError('pipe() needs an int array of 2, as in int fd[2]; pipe(fd);', e.line);
    }
    const id = this.runner.pipeFor(`${this.ident}#${this.pipesMade++}`, e.line, this.identIndex);
    const r = this.lowestFreeFd();
    this.fds.set(r, { k: 'pipe', pipe: id, w: false });
    const w = this.lowestFreeFd();
    this.fds.set(w, { k: 'pipe', pipe: id, w: true });
    arr.v[0] = r;
    arr.v[1] = w;
    if (this.started) this.writeEnds.set(id, Infinity);
    return 0;
  }

  /** read(2) from a pipe: the unread part of the oldest write, at most n bytes; '' at end of file. */
  private pipeRead(pipe: number, n: number, line: number): string {
    if (n <= 0) return '';
    const cur = this.cursors.get(pipe) ?? { seq: 0, off: 0 };
    const known = this.runner.pipeData(pipe);
    if (this.started) this.runner.noteReader(pipe, this.self.index);
    if (cur.seq < known.length) {
      const msg = known[cur.seq] as string;
      const text = msg.slice(cur.off, cur.off + n);
      const seq = cur.seq;
      const off = cur.off + text.length;
      this.cursors.set(pipe, off >= msg.length ? { seq: seq + 1, off: 0 } : { seq, off });
      this.record({ kind: 'read', pipe, seq, eof: false, text, line, forever: false });
      return text;
    }
    if (this.runner.atEof(pipe)) {
      this.record({ kind: 'read', pipe, seq: cur.seq, eof: true, text: '', line, forever: false });
      return '';
    }
    if (!this.runner.forever) throw new Suspend();
    this.record({ kind: 'read', pipe, seq: cur.seq, eof: false, text: '', line, forever: true });
    throw new BlockSig();
  }

  /** Reads descriptor fd: the terminal has no input (end of file at once). Returns null for a bad descriptor. */
  private fdRead(fd: number, n: number, line: number): string | null {
    const f = this.fds.get(fd);
    if (!f || (f.k === 'pipe' && f.w)) return null;
    if (f.k === 'tty') return '';
    return this.pipeRead(f.pipe, n, line);
  }

  /** Bytes of a write() source: a string, a char buffer, or &int. */
  private bytesOf(arg: Expr, n: number, line: number): string {
    if (arg.k === 'addr') {
      const v = this.getVal(arg.name, line);
      if (typeof v !== 'number') throw new RunError(`write(fd, &${arg.name}, …) needs an int variable`, line);
      return intBytes(v, n);
    }
    const v = this.eval(arg);
    // A C string literal ends in a NUL, which write(fd, s, strlen(s) + 1) sends too.
    if (typeof v === 'string') return (v + '\0').slice(0, n);
    if (typeof v === 'object' && v.t === 'buf') return String.fromCharCode(...v.v.slice(0, n));
    throw new RunError('write() needs a string, a char array or &variable', line);
  }

  /** Stores bytes read into a char buffer or an int variable (&x). */
  private storeBytes(arg: Expr, text: string, line: number): void {
    if (arg.k === 'addr') {
      const v = this.getVal(arg.name, line);
      if (typeof v !== 'number') throw new RunError(`read(fd, &${arg.name}, …) needs an int variable`, line);
      if (text) this.set(arg.name, bytesInt(text), line);
      return;
    }
    const v = arg.k === 'var' ? this.getVal(arg.name, line) : null;
    if (!v || typeof v !== 'object' || v.t !== 'buf') throw new RunError('read() needs a char array or &variable to read into', line);
    if (text.length > v.v.length) throw new RunError(`read() of ${text.length} bytes overflows ${arg.k === 'var' ? arg.name : 'the buffer'}`, line);
    for (let k = 0; k < text.length; k++) v.v[k] = text.charCodeAt(k);
  }

  // ---- variables ----

  private lookup(name: string, line: number): Map<string, Val> {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i] as Map<string, Val>;
      if (s.has(name)) return s;
    }
    throw new RunError(`'${name}' is not declared`, line);
  }

  private getVal(name: string, line: number): Val {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = (this.scopes[i] as Map<string, Val>).get(name);
      if (v !== undefined) return v;
    }
    if (name in CONSTANTS) return CONSTANTS[name] as number;
    throw new RunError(`'${name}' is not declared`, line);
  }

  private set(name: string, v: Val, line: number): Val {
    const scope = this.lookup(name, line);
    const old = scope.get(name);
    if (typeof old === 'object') throw new RunError(`cannot assign to the array '${name}'`, line);
    if (typeof v === 'object') throw new RunError('cannot assign an array; copy it element by element', line);
    const nv = typeof v === 'number' ? toInt(v) : v;
    scope.set(name, nv);
    return nv;
  }

  private element(name: string, index: Expr, line: number): { get: () => number | string; set: (v: Val) => number | string } {
    const arr = this.getVal(name, line);
    const i = this.num(index);
    if (typeof arr === 'string') {
      return {
        get: () => (i >= 0 && i < arr.length ? arr.charCodeAt(i) : 0),
        set: () => {
          throw new RunError('string literals are read-only; copy into a char array first', line);
        },
      };
    }
    if (typeof arr !== 'object') throw new RunError(`'${name}' is not an array`, line);
    if (i < 0 || i >= arr.v.length) throw new RunError(`${name}[${i}] is out of bounds (size ${arr.v.length})`, line);
    if (arr.t === 'buf') {
      return {
        get: () => arr.v[i] as number,
        set: (v) => {
          if (typeof v !== 'number') throw new RunError(`${name}[${i}] holds a char`, line);
          arr.v[i] = toInt(v) & 255;
          return arr.v[i] as number;
        },
      };
    }
    return {
      get: () => arr.v[i] as number | string,
      set: (v) => {
        if (typeof v === 'object') throw new RunError('cannot store an array in an array element', line);
        arr.v[i] = typeof v === 'number' ? toInt(v) : v;
        return arr.v[i] as number | string;
      },
    };
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

  private declare(v: Extract<Stmt, { k: 'decl' }>['vars'][number], line: number): void {
    const scope = this.scopes[this.scopes.length - 1] as Map<string, Val>;
    if (!v.array) {
      scope.set(v.name, 0);
      if (v.init) {
        const x = v.ptr ? this.eval(v.init) : this.num(v.init);
        if (v.ptr && typeof x !== 'string' && x !== 0) throw new RunError(`char *${v.name} needs a string`, line);
        this.set(v.name, x, line);
      }
      return;
    }
    let size = v.size ? this.num(v.size) : -1;
    if (v.char) {
      let init: string | null = null;
      if (v.init) {
        const s = this.eval(v.init);
        if (typeof s !== 'string') throw new RunError(`char ${v.name}[] needs a string initialiser`, line);
        init = s;
      }
      if (size < 0) size = (init ?? '').length + 1;
      if (size <= 0 || size > 1 << 20) throw new RunError(`bad array size ${size}`, line);
      const buf: CharBuf = { t: 'buf', v: new Array<number>(size).fill(0) };
      if (init !== null) {
        if (init.length > size) throw new RunError(`"${init}" does not fit in ${v.name}[${size}]`, line);
        for (let k = 0; k < init.length; k++) buf.v[k] = init.charCodeAt(k);
      }
      scope.set(v.name, buf);
      return;
    }
    let items: (number | string)[] = [];
    if (v.init) {
      if (v.init.k !== 'list') throw new RunError(`${v.name}[] needs a { … } initialiser`, line);
      items = v.init.items.map((it) => {
        const x = this.eval(it);
        if (typeof x === 'object') throw new RunError('arrays of arrays are not supported', line);
        return x;
      });
    }
    if (size < 0) size = items.length;
    if (size <= 0 || size > 1 << 20) throw new RunError(`bad array size ${size}`, line);
    if (items.length > size) throw new RunError(`too many initialisers for ${v.name}[${size}]`, line);
    const arr: IntArr = { t: 'arr', v: new Array<number | string>(size).fill(0) };
    items.forEach((x, k) => (arr.v[k] = x));
    scope.set(v.name, arr);
  }

  private exec(s: Stmt): void {
    this.tick(s.line);
    switch (s.k) {
      case 'expr':
        this.eval(s.e);
        return;
      case 'decl':
        for (const v of s.vars) this.declare(v, s.line);
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
    if (typeof v !== 'number') {
      throw new RunError(typeof v === 'string' ? 'a string cannot be used as a number here' : 'an array cannot be used as a number here', e.line);
    }
    return v;
  }

  /** A string argument: a literal, a char * or a char array (up to its NUL). */
  private text(e: Expr, what: string): string {
    const v = this.eval(e);
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v.t === 'buf') return cstr(v);
    throw new RunError(`${what} needs a string`, e.line);
  }

  private buf(e: Expr, what: string): CharBuf {
    const v = e.k === 'var' ? this.getVal(e.name, e.line) : null;
    if (!v || typeof v !== 'object' || v.t !== 'buf') throw new RunError(`${what} needs a char array to write into`, e.line);
    return v;
  }

  private storeString(b: CharBuf, s: string, line: number): void {
    if (s.length + 1 > b.v.length) throw new RunError(`${s.length + 1} bytes do not fit in a char array of ${b.v.length}`, line);
    for (let k = 0; k < s.length; k++) b.v[k] = s.charCodeAt(k);
    b.v[s.length] = 0;
  }

  private eval(e: Expr): Val {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'str':
        return e.v;
      case 'null':
        return 0;
      case 'var':
        return this.getVal(e.name, e.line);
      case 'index':
        return this.element(e.name, e.i, e.line).get();
      case 'list':
        throw new RunError('{ … } is only allowed as an array initialiser', e.line);
      case 'sizeof': {
        if (e.e.k === 'str') return e.e.v.length + 1;
        if (e.e.k !== 'var') return 4;
        const v = this.getVal(e.e.name, e.line);
        if (typeof v === 'number') return 4;
        if (typeof v === 'string') return 8;
        return v.t === 'buf' ? v.v.length : 4 * v.v.length;
      }
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
        const v = e.op === '=' ? this.eval(e.e) : this.num(e.e);
        if (e.index) {
          const el = this.element(e.name, e.index, e.line);
          if (e.op === '=') return el.set(v);
          const old = el.get();
          if (typeof old !== 'number') throw new RunError(`${e.op} needs a number`, e.line);
          return el.set(binop(e.op.slice(0, -1), old, v as number, e.line));
        }
        if (e.op === '=') return this.set(e.name, v, e.line);
        const old = this.getVal(e.name, e.line);
        if (typeof old !== 'number') throw new RunError(`${e.op} needs a number`, e.line);
        return this.set(e.name, binop(e.op.slice(0, -1), old, v as number, e.line), e.line);
      }
      case 'incdec': {
        const cell = e.index
          ? this.element(e.name, e.index, e.line)
          : { get: () => this.getVal(e.name, e.line), set: (v: Val) => this.set(e.name, v, e.line) };
        const old = cell.get();
        if (typeof old !== 'number') throw new RunError(`${e.op} needs a number`, e.line);
        const nv = cell.set(e.op === '++' ? old + 1 : old - 1);
        return e.prefix ? nv : old;
      }
      case 'call':
        return this.call(e);
    }
  }

  /** Arguments for printf-like calls: char arrays become their string. */
  private args(e: CallExpr): (number | string)[] {
    return e.args.map((a) => {
      const v = this.eval(a);
      if (typeof v !== 'object') return v;
      if (v.t === 'buf') return cstr(v);
      throw new RunError('an int array cannot be passed here', a.line);
    });
  }

  private arity(e: CallExpr, n: number): void {
    if (e.args.length !== n) throw new RunError(`${e.name}() takes ${n} argument${n === 1 ? '' : 's'}`, e.line);
  }

  private call(e: CallExpr): Val {
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
        if (stream === 2) this.fdWrite(2, text, line, 'stderr');
        else this.write(text, line);
        return 0;
      }
      case 'sprintf':
      case 'snprintf': {
        const dst = this.buf(e.args[0] as Expr, e.name);
        const skip = e.name === 'snprintf' ? 2 : 1;
        const [fmt, ...rest] = this.args({ ...e, args: e.args.slice(skip) });
        if (typeof fmt !== 'string') throw new RunError(`${e.name} needs a format string`, line);
        let out = format(fmt, rest, line);
        if (e.name === 'snprintf') out = out.slice(0, Math.max(0, this.num(e.args[1] as Expr) - 1));
        this.storeString(dst, out, line);
        return out.length;
      }
      case 'perror': {
        this.arity(e, 1);
        this.fdWrite(2, `${this.text(e.args[0] as Expr, 'perror')}: error\n`, line, 'stderr');
        return 0;
      }
      case 'puts': {
        this.arity(e, 1);
        this.write(this.text(e.args[0] as Expr, 'puts') + '\n', line);
        return 0;
      }
      case 'putchar': {
        this.arity(e, 1);
        const c = this.num(e.args[0] as Expr);
        this.write(String.fromCharCode(c), line);
        return c;
      }
      case 'strlen':
        this.arity(e, 1);
        return this.text(e.args[0] as Expr, 'strlen').split('\0')[0]?.length ?? 0;
      case 'strcmp': {
        this.arity(e, 2);
        const a = this.text(e.args[0] as Expr, 'strcmp');
        const b = this.text(e.args[1] as Expr, 'strcmp');
        return a < b ? -1 : a > b ? 1 : 0;
      }
      case 'strcpy':
      case 'strcat': {
        this.arity(e, 2);
        const dst = this.buf(e.args[0] as Expr, e.name);
        const src = this.text(e.args[1] as Expr, e.name);
        this.storeString(dst, e.name === 'strcat' ? cstr(dst) + src : src, line);
        return 0;
      }
      case 'atoi': {
        this.arity(e, 1);
        return toInt(parseInt(this.text(e.args[0] as Expr, 'atoi'), 10) || 0);
      }
      case 'pipe':
        return this.pipe(e);
      case 'close': {
        this.arity(e, 1);
        const fd = this.num(e.args[0] as Expr);
        if (!this.fds.has(fd)) return -1;
        // Like C, close(1) leaves stdio's buffer alone: it goes wherever fd 1 points when it is flushed.
        this.dropFd(fd, line);
        return 0;
      }
      case 'dup':
      case 'dup2': {
        this.arity(e, e.name === 'dup' ? 1 : 2);
        const from = this.num(e.args[0] as Expr);
        const f = this.fds.get(from);
        if (!f) return -1;
        const to = e.name === 'dup' ? this.lowestFreeFd() : this.num(e.args[1] as Expr);
        if (to === from) return to;
        if (to < 0 || to > 1023) return -1;
        // Copy first, so replacing the last copy of a write end with another copy of it is not a close.
        const old = this.fds.get(to);
        this.fds.set(to, { ...f });
        if (old?.k === 'pipe' && old.w && this.writeCopies(old.pipe) === 0 && this.started) {
          this.record({ kind: 'close', pipe: old.pipe, line });
          this.writeEnds.set(old.pipe, this.events.length - 1);
        }
        return to;
      }
      case 'read': {
        this.arity(e, 3);
        const fd = this.num(e.args[0] as Expr);
        const n = this.num(e.args[2] as Expr);
        const got = this.fdRead(fd, n, line);
        if (got === null) return -1;
        this.storeBytes(e.args[1] as Expr, got, line);
        return got.length;
      }
      case 'write': {
        this.arity(e, 3);
        const fd = this.num(e.args[0] as Expr);
        const n = this.num(e.args[2] as Expr);
        return this.fdWrite(fd, this.bytesOf(e.args[1] as Expr, n, line), line, fd === 2 ? 'stderr' : 'write');
      }
      case 'fflush':
        this.args(e);
        this.flush(line, 'fflush');
        return 0;
      case 'setbuf': {
        const [, b] = this.args(e);
        if (b === 0) this.mode = 'none';
        this.stdioReady = true;
        return 0;
      }
      case 'setvbuf': {
        const [, , m] = this.args(e);
        this.mode = m === 2 ? 'none' : m === 1 ? 'line' : 'full';
        this.stdioReady = true;
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

  private exec_(e: CallExpr): never {
    const raw: (number | string)[] = [];
    for (const a of e.args) {
      const v = this.eval(a);
      if (typeof v === 'object' && v.t === 'arr') raw.push(...v.v.slice(0, v.v.indexOf(0) < 0 ? undefined : v.v.indexOf(0)));
      else raw.push(typeof v === 'object' ? cstr(v) : v);
    }
    const argv = raw.slice(1).filter((a): a is string => typeof a === 'string');
    const prog = (argv[0] ?? (typeof raw[0] === 'string' ? raw[0] : 'prog')).split('/').pop() as string;
    // exec replaces the process image: unflushed stdio output is lost.
    this.execDiscarded = this.buffer;
    this.buffer = '';
    const code = this.stub(prog, argv.slice(1), e.line);
    throw new ExitSig(code, e.line, false);
  }

  /** All of standard input, read the way a filter would: until end of file. */
  private readStdin(line: number, each?: (chunk: string) => void): string {
    let all = '';
    for (;;) {
      const chunk = this.fdRead(0, 4096, line) ?? '';
      if (!chunk) return all;
      each?.(chunk);
      all += chunk;
    }
  }

  /** The programs exec can run: small filters, enough for textbook pipelines. Returns the exit status. */
  private stub(prog: string, args: string[], line: number): number {
    const out = (text: string) => this.fdWrite(1, text, line, 'exec');
    const lines = (s: string) => (s ? s.replace(/\n$/, '').split('\n') : []);
    switch (prog) {
      case 'echo':
        out(args.join(' ') + '\n');
        return 0;
      case 'true':
        return 0;
      case 'false':
        return 1;
      case 'cat':
        if (args.length) break;
        this.readStdin(line, out);
        return 0;
      case 'wc': {
        const s = this.readStdin(line);
        const counts = { l: (s.match(/\n/g) ?? []).length, w: s.split(/\s+/).filter(Boolean).length, c: s.length };
        const flag = args.find((a) => /^-[lwc]$/.test(a));
        out(flag ? `${counts[flag[1] as 'l' | 'w' | 'c']}\n` : `${[counts.l, counts.w, counts.c].map((n) => String(n).padStart(7)).join(' ')}\n`);
        return 0;
      }
      case 'sort': {
        const ls = lines(this.readStdin(line)).sort();
        if (args.includes('-r')) ls.reverse();
        out(ls.map((l) => l + '\n').join(''));
        return 0;
      }
      case 'uniq': {
        const ls = lines(this.readStdin(line)).filter((l, k, a) => k === 0 || a[k - 1] !== l);
        out(ls.map((l) => l + '\n').join(''));
        return 0;
      }
      case 'grep': {
        const pat = args.find((a) => !a.startsWith('-')) ?? '';
        const invert = args.includes('-v');
        const ls = lines(this.readStdin(line)).filter((l) => l.includes(pat) !== invert);
        out(ls.map((l) => l + '\n').join(''));
        return ls.length ? 0 : 1;
      }
      case 'head': {
        const k = args.indexOf('-n');
        const n = k >= 0 ? Number(args[k + 1]) : 10;
        out(lines(this.readStdin(line)).slice(0, n).map((l) => l + '\n').join(''));
        return 0;
      }
      case 'tr': {
        const from = trSet(args[0] ?? '');
        const to = trSet(args[1] ?? '');
        const s = this.readStdin(line);
        out([...s].map((c) => (from.includes(c) ? (to[Math.min(from.indexOf(c), to.length - 1)] ?? c) : c)).join(''));
        return 0;
      }
      case 'rev':
        out(lines(this.readStdin(line)).map((l) => [...l].reverse().join('') + '\n').join(''));
        return 0;
    }
    out(`<${[prog, ...args].join(' ')}>\n`);
    return 0;
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
        this.ident = key(childPath);
        this.identIndex = this.runner.indexOf(childPath);
        this.pipesMade = 0;
        if (i === this.path.length - 1) {
          this.started = true;
          this.inheritedBuffer = this.buffer;
          this.inheritedLeft = this.buffer.length;
          this.forkLine = line;
          this.self.pid = this.pid;
          for (const pipe of this.heldWriteEnds()) this.writeEnds.set(pipe, Infinity);
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
    if (statusArg.k === 'addr') {
      const code = this.runner.exitCodeOf(child.index);
      if (code === null) {
        // The child never exits, so neither does this wait.
        this.record({ kind: 'wait', target: child.index, line });
        throw new BlockSig();
      }
      this.set(statusArg.name, code << 8, line);
    }
    child.reaped = true;
    this.record({ kind: 'wait', target: target === null || target === -1 ? null : child.index, line });
    return child.pid;
  }
}

/** tr's character sets: a-z ranges and \n. */
function trSet(s: string): string[] {
  const chars = [...s.replace(/\\n/g, '\n')];
  const out: string[] = [];
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k] as string;
    if (chars[k + 1] === '-' && k + 2 < chars.length) {
      const end = (chars[k + 2] as string).charCodeAt(0);
      for (let x = c.charCodeAt(0); x <= end; x++) out.push(String.fromCharCode(x));
      k += 2;
    } else out.push(c);
  }
  return out;
}

interface PipeState {
  key: string;
  line: number;
  creator: number;
  data: string[];
  writer: number | null;
  reader: number | null;
  eof: boolean;
}

class Runner {
  readonly procs: Proc[] = [];
  private byPath = new Map<string, number>();
  private status: ('new' | 'suspended' | 'done')[] = [];
  /** Write ends each suspended process holds where it stopped. */
  private holds: Set<number>[] = [];
  private pipes: PipeState[] = [];
  private pipeIds = new Map<string, number>();
  /** Bumped whenever something a suspended process might be waiting for changes. */
  private version = 0;
  /** Set once nothing can progress: unsatisfiable reads then block for good. */
  forever = false;
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
    const have = this.byPath.get(key(path));
    if (have !== undefined) return this.procs[have] as Proc;
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
      writeEnds: new Map(),
      blocked: false,
    };
    this.procs.push(p);
    this.status.push('new');
    this.holds.push(new Set());
    this.byPath.set(key(path), p.index);
    this.version++;
    return p;
  }

  pipeFor(k: string, line: number, creator: number): number {
    let id = this.pipeIds.get(k);
    if (id === undefined) {
      id = this.pipes.length;
      this.pipes.push({ key: k, line, creator, data: [], writer: null, reader: null, eof: false });
      this.pipeIds.set(k, id);
    }
    return id;
  }

  private pipeAt(id: number): PipeState {
    return this.pipes[id] as PipeState;
  }

  private pidName(i: number): string {
    return `pid ${(this.procs[i] as Proc).pid}`;
  }

  pipeWrite(id: number, seq: number, text: string, proc: number): void {
    const p = this.pipeAt(id);
    if (p.writer !== null && p.writer !== proc) {
      throw new RunError(
        `${this.pidName(p.writer)} and ${this.pidName(proc)} both write into the pipe from line ${p.line}; the order their bytes arrive in depends on the scheduler, which Fork Count does not model. Give each writer its own pipe.`,
        p.line,
      );
    }
    p.writer = proc;
    if (seq >= p.data.length) this.version++;
    p.data[seq] = text;
  }

  noteReader(id: number, proc: number): void {
    const p = this.pipeAt(id);
    if (p.reader !== null && p.reader !== proc) {
      throw new RunError(
        `${this.pidName(p.reader)} and ${this.pidName(proc)} both read from the pipe from line ${p.line}; which one gets each write depends on the scheduler, which Fork Count does not model. Give each reader its own pipe.`,
        p.line,
      );
    }
    p.reader = proc;
  }

  pipeData(id: number): readonly string[] {
    return this.pipeAt(id).data;
  }

  atEof(id: number): boolean {
    return this.pipeAt(id).eof;
  }

  /** Runs process index (again, if it was suspended). Returns true once it has run to the end. */
  runProc(index: number): boolean {
    if (this.status[index] === 'done') return true;
    const p = this.procs[index] as Proc;
    p.children = [];
    const ex = new Execution(this, p.path, p);
    try {
      ex.run(this.prog);
    } catch (e) {
      if (e instanceof Suspend) {
        this.status[index] = 'suspended';
        this.holds[index] = ex.heldWriteEnds();
        return false;
      }
      throw e;
    }
    p.events = ex.events;
    p.forkLine = ex.forkLine;
    p.inheritedBuffer = ex.inheritedBuffer;
    p.writeEnds = ex.writeEnds;
    p.blocked = ex.blocked;
    this.status[index] = 'done';
    this.version++;
    return true;
  }

  /** Exit status of a child, or null if it never exits. Suspends the caller while that is unknown. */
  exitCodeOf(index: number): number | null {
    if (!this.runProc(index)) throw new Suspend();
    const p = this.procs[index] as Proc;
    return p.blocked ? null : p.exitCode;
  }

  runAll(): PipeInfo[] {
    this.spawn([], null);
    for (let pass = 0; ; pass++) {
      /* c8 ignore next */
      if (pass > 10_000) throw new RunError('the pipes never settle', null);
      const before = this.version;
      for (let i = 0; i < this.procs.length; i++) this.runProc(i);
      if (this.status.every((s) => s === 'done')) break;
      if (this.version !== before) continue;
      // Stuck. A pipe none of the stopped processes can write to is at end of file.
      const stopped = this.status.flatMap((s, i) => (s === 'done' ? [] : [i]));
      let changed = false;
      for (const [id, pipe] of this.pipes.entries()) {
        if (pipe.eof || stopped.some((i) => (this.holds[i] as Set<number>).has(id))) continue;
        pipe.eof = true;
        changed = true;
      }
      if (changed) this.version++;
      else this.forever = true;
    }
    return this.pipes.map((p, id) => {
      const writes: PipeInfo['writes'] = [];
      this.procs.forEach((proc) =>
        proc.events.forEach((e, idx) => {
          if (e.kind === 'pwrite' && e.pipe === id) writes[e.seq] = { proc: proc.index, idx };
        }),
      );
      return { id, line: p.line, creator: p.creator, writer: p.writer, reader: p.reader, writes };
    });
  }
}

export function runProgram(prog: Program, opts: RunOptions): RunResult {
  const r = new Runner(prog, opts);
  const pipes = r.runAll();
  return { procs: r.procs, mode: opts.mode, pipes };
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
