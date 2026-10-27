import { describe, expect, it } from 'vitest';
import { runSource, type BufMode, type Ev, type RunResult } from '../src/core/interp';
import { parse } from '../src/core/parser';
import { PRESETS } from '../src/core/presets';
import {
  check,
  enumerate,
  findHang,
  HANG,
  initialState,
  isPossible,
  show,
  simulate,
  statuses,
  stuckReasons,
} from '../src/core/schedule';

const run = (src: string, mode: BufMode = 'line') => runSource(src, { mode });
const outputs = (src: string, mode: BufMode = 'line') => enumerate(run(src, mode)).outputs;
const kinds = (r: RunResult, i: number) => r.procs[i]?.events.map((e: Ev) => e.kind);
const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return runSource(p.code, { mode: p.mode });
};

describe('parser: arrays, strings and sizeof', () => {
  it('parses array declarations, initialisers and subscripts', () => {
    const p = parse('int fd[2], n = 1; char buf[8]; char msg[] = "hi"; char *s = "x"; int a[] = {1, 2, 3,}; a[1] = 5; a[n]++; --a[0];');
    expect(p.body[0]).toMatchObject({ k: 'decl', vars: [{ name: 'fd', array: true, char: false }, { name: 'n', array: false }] });
    expect(p.body[2]).toMatchObject({ vars: [{ name: 'msg', array: true, size: null, char: true }] });
    expect(p.body[3]).toMatchObject({ vars: [{ name: 's', ptr: true, char: false }] });
    expect(p.body[4]).toMatchObject({ vars: [{ init: { k: 'list' } }] });
    expect(p.body[5]).toMatchObject({ e: { k: 'assign', name: 'a', index: { k: 'num', v: 1 } } });
    expect(p.body[6]).toMatchObject({ e: { k: 'incdec', prefix: false, index: { k: 'var' } } });
    expect(p.body[7]).toMatchObject({ e: { k: 'incdec', prefix: true, index: { k: 'num' } } });
  });

  it('folds sizeof on types and keeps sizeof on expressions', () => {
    const p = parse('x = sizeof(int); y = sizeof(char); z = sizeof(char *); w = sizeof(long); v = sizeof buf; u = sizeof(void *);');
    const vals = p.body.map((s) => (s.k === 'expr' && s.e.k === 'assign' ? s.e.e : null));
    expect(vals.slice(0, 4)).toMatchObject([{ v: 4 }, { v: 1 }, { v: 8 }, { v: 8 }]);
    expect(vals[4]).toMatchObject({ k: 'sizeof', e: { k: 'var', name: 'buf' } });
    expect(vals[5]).toMatchObject({ k: 'num', v: 8 });
  });

  it('accepts pointer casts such as (char *) NULL', () => {
    expect(parse('execlp("ls", "ls", (char *) NULL);').body[0]).toMatchObject({ e: { k: 'call', args: [{}, {}, { k: 'null' }] } });
    expect(parse('x = (void *) 0;').body[0]).toMatchObject({ e: { e: { k: 'num', v: 0 } } });
  });
});

describe('interpreter: arrays and strings', () => {
  it('runs string helpers and array code', () => {
    const src = `char buf[32]; char *s = "abc"; int a[3] = {4, 5};
      strcpy(buf, s); strcat(buf, "de"); a[2] = strlen(buf); a[0] += 10; a[1]--;
      printf("%s %d %d %d %d %d %d\\n", buf, a[0], a[1], a[2], strcmp("a", "b"), strcmp("b", "a"), strcmp(s, "abc"));
      sprintf(buf, "%d-%s", 7, "x"); printf("%s %d %c\\n", buf, atoi("42z"), s[1]);
      snprintf(buf, 4, "%s", "abcdef"); printf("%s %d %d %d\\n", buf, sizeof(buf), sizeof(a), sizeof "hey");
      int x = 3; printf("%d %d %d\\n", sizeof x, sizeof s, s[9]);`;
    expect(outputs(src)).toEqual(['abcde 14 4 5 -1 1 0\n7-x 42 b\nabc 32 12 4\n4 8 0\n']);
  });

  it('supports execvp with an argv array', () => {
    expect(outputs('char *args[] = {"echo", "from", "argv", NULL}; execvp("echo", args);')).toEqual(['from argv\n']);
  });

  it('reports array mistakes', () => {
    const err = (src: string) => () => run(src);
    expect(err('int a[2]; a[2] = 1;')).toThrow(/out of bounds/);
    expect(err('int a[2]; int b[2]; a = b;')).toThrow(/cannot assign to the array/);
    expect(err('int a[2]; int x; x = a;')).toThrow(/cannot assign an array/);
    expect(err('int a[2]; printf("%d", a + 1);')).toThrow(/array cannot be used as a number/);
    expect(err('char *s = "ab"; s[0] = 1;')).toThrow(/read-only/);
    expect(err('int x = 1; x[0] = 2;')).toThrow(/not an array/);
    expect(err('char b[2] = "toolong";')).toThrow(/does not fit/);
    expect(err('char b[] = 5;')).toThrow(/string initialiser/);
    expect(err('int a[2] = 5;')).toThrow(/initialiser/);
    expect(err('int a[1] = {1, 2};')).toThrow(/too many/);
    expect(err('int a[0];')).toThrow(/bad array size/);
    expect(err('char b[0];')).toThrow(/bad array size/);
    expect(err('char *p = 5;')).toThrow(/needs a string/);
    expect(err('char b[2]; strcpy(b, "abc");')).toThrow(/do not fit/);
    expect(err('int x; strcpy(x, "a");')).toThrow(/char array/);
    expect(err('strlen(3);')).toThrow(/needs a string/);
    expect(err('int a[1]; printf("%d", a);')).toThrow(/int array cannot be passed/);
    expect(err('int x = {1};')).toThrow(/only allowed as an array initialiser/);
    expect(err('char b[4]; b[0] = "x";')).toThrow(/holds a char/);
    expect(err('int a[2]; int b[1]; a[0] = b;')).toThrow(/cannot store an array/);
    expect(err('char *s = "a"; s += 1;')).toThrow(/needs a number/);
    expect(err('char *s = "a"; s++;')).toThrow(/needs a number/);
    expect(err('char *a[1] = {"x"}; a[0] += 1;')).toThrow(/needs a number/);
    expect(err('sprintf(1, "x");')).toThrow(/char array/);
  });
});

describe('interpreter: pipes', () => {
  it('allocates the lowest free descriptors and records pipe events', () => {
    const r = run(`int fd[2]; char b[4]; pipe(fd); printf("%d %d\\n", fd[0], fd[1]);
      write(fd[1], "ab", 2); read(fd[0], b, 1); read(fd[0], b, 4); close(fd[1]); read(fd[0], b, 4);`);
    expect(enumerate(r).outputs).toEqual(['3 4\n']);
    expect(kinds(r, 0)).toEqual(['out', 'pwrite', 'read', 'read', 'close', 'read', 'exit']);
    const reads = r.procs[0]?.events.filter((e) => e.kind === 'read');
    expect(reads).toMatchObject([{ text: 'a', seq: 0 }, { text: 'b', seq: 0 }, { eof: true, text: '' }]);
    expect(r.pipes).toMatchObject([{ line: 1, creator: 0, writer: 0, reader: 0 }]);
  });

  it('returns -1 for bad descriptors and 0 for the terminal', () => {
    const src = `int fd[2]; char b[4]; pipe(fd);
      printf("%d %d %d %d %d\\n", write(fd[0], "x", 1), read(fd[1], b, 1), read(0, b, 4), close(9), write(7, "x", 1));
      printf("%d %d %d %d\\n", dup(9), dup2(9, 5), dup2(fd[0], fd[0]), dup2(fd[0], 2000));
      printf("%d %d %d\\n", dup(fd[0]), read(fd[0], b, 0), write(fd[1], "", 0));`;
    expect(outputs(src)).toEqual(['-1 -1 0 -1 -1\n-1 -1 3 -1\n5 0 0\n']);
  });

  it('sends ints as four bytes', () => {
    const src = `int fd[2]; pipe(fd); int v = -2; int w = 0; write(fd[1], &v, sizeof v); read(fd[0], &w, 4); printf("%d\\n", w);`;
    expect(outputs(src)).toEqual(['-2\n']);
    expect(show(String.fromCharCode(0, 1, 255))).toBe('"\\x00\\x01\\xff"');
  });

  it('a pipe read is ordered after the write it returns', () => {
    const src = `int fd[2]; char c; pipe(fd);
      if (fork() == 0) { close(fd[1]); read(fd[0], &c, 1); printf("child\\n"); exit(0); }
      printf("parent\\n"); write(fd[1], "x", 1);`;
    expect(outputs(src)).toEqual(['parent\nchild\n']);
  });

  it('runs a reader before the writer it depends on', () => {
    // The parent (run first) needs data from a child that has not run yet.
    const r = preset('pipe-reply');
    expect(r.procs[0]?.events.filter((e) => e.kind === 'read')).toMatchObject([{ text: 'ready\0' }]);
    expect(enumerate(r).outputs).toHaveLength(2);
  });

  it('end of file waits for every holder of the write end', () => {
    const r = preset('pipe-holders');
    expect(r.procs[2]?.writeEnds.get(0)).toBe(r.procs[2]?.events.length ? r.procs[2].events.length - 1 : -1);
    expect(enumerate(r).outputs.every((o) => o.indexOf('B exits') < o.indexOf('end of file'))).toBe(true);
  });

  it('blocks forever when a write end is never closed', () => {
    const r = preset('pipe-noclose');
    expect(r.procs[1]?.blocked).toBe(true);
    expect(r.procs[1]?.events.at(-1)).toMatchObject({ kind: 'read', forever: true });
    expect(r.procs[1]?.writeEnds.get(0)).toBe(Infinity);
    expect(enumerate(r).outputs).toEqual(['got [one]\n' + HANG]);
  });

  it('a wait for status on a child that never exits blocks too', () => {
    const r = run(`int fd[2]; int st; char c; pipe(fd);
      if (fork() == 0) { read(fd[0], &c, 1); exit(0); }
      wait(&st); printf("never\\n");`);
    expect(r.procs[0]?.blocked).toBe(true);
    expect(r.procs[0]?.events.at(-1)).toMatchObject({ kind: 'wait', target: 1 });
    expect(enumerate(r).outputs).toEqual([HANG]);
  });

  it('rejects two writers or two readers on one pipe', () => {
    expect(() => run('int fd[2]; pipe(fd); fork(); write(fd[1], "x", 1);')).toThrow(/both write into the pipe from line 1/);
    expect(() => run('int fd[2]; char c; pipe(fd); write(fd[1], "xy", 2); fork(); read(fd[0], &c, 1);')).toThrow(/both read from the pipe/);
  });

  it('checks pipe() and read() arguments', () => {
    expect(() => run('int x; pipe(x);')).toThrow(/int array of 2/);
    expect(() => run('int a[1]; pipe(a);')).toThrow(/int array of 2/);
    expect(() => run('int fd[2]; char b[1]; pipe(fd); write(fd[1], "xyz", 3); read(fd[0], b, 3);')).toThrow(/overflows b/);
    expect(() => run('int fd[2]; pipe(fd); write(fd[1], "x", 1); read(fd[0], 5, 1);')).toThrow(/char array or &variable/);
    expect(() => run('int fd[2]; char *s = "x"; pipe(fd); write(fd[1], &s, 1);')).toThrow(/needs an int variable/);
    expect(() => run('int fd[2]; char *s = "x"; pipe(fd); write(fd[1], "x", 1); read(fd[0], &s, 1);')).toThrow(/needs an int variable/);
  });

  it('dup2 onto stdout sends printf into the pipe, fully buffered', () => {
    const r = preset('pipe-redirect-full');
    expect(r.procs[1]?.events.filter((e) => e.kind === 'pwrite')).toMatchObject([{ text: 'one\ntwo\n', cause: 'exit' }]);
    // An explicit setvbuf keeps line buffering.
    const lb = run(`int fd[2]; char b[16]; pipe(fd);
      if (fork() == 0) { setvbuf(stdout, NULL, _IOLBF, 0); dup2(fd[1], 1); close(fd[1]); printf("a\\n"); printf("b\\n"); exit(0); }
      close(fd[1]); while (read(fd[0], b, 16) > 0) printf("chunk\\n");`);
    expect(enumerate(lb).outputs).toEqual(['chunk\nchunk\n']);
  });

  it('replacing the last copy of a write end with dup2 is a close', () => {
    const r = run('int fd[2]; pipe(fd); dup2(fd[1], 1); close(fd[1]); dup2(fd[0], 1);');
    expect(kinds(r, 0)).toEqual(['close', 'exit']);
  });

  it('stderr and perror bypass a redirected stdout', () => {
    const src = `int fd[2]; pipe(fd); dup2(fd[1], 1); fprintf(stderr, "e\\n"); perror("oops"); write(2, "w\\n", 2); printf("lost?\\n");`;
    expect(outputs(src)).toEqual(['e\noops: error\nw\n']);
  });
});

describe('exec filters', () => {
  const pipeline = (feed: string, cmd: string) => `int fd[2]; pipe(fd);
    if (fork() == 0) { dup2(fd[0], 0); close(fd[0]); close(fd[1]); execlp(${cmd}, (char *) NULL); }
    close(fd[0]); write(fd[1], "${feed}", strlen("${feed}")); close(fd[1]); int st; wait(&st); printf("[%d]\\n", WEXITSTATUS(st));`;
  const cases: [string, string, string][] = [
    ['b\\na\\nb\\nb\\n', '"sort", "sort"', 'a\nb\nb\nb\n[0]\n'],
    ['b\\na\\nc\\n', '"sort", "sort", "-r"', 'c\nb\na\n[0]\n'],
    ['a\\na\\nb\\na\\n', '"uniq", "uniq"', 'a\nb\na\n[0]\n'],
    ['one two\\nthree\\n', '"wc", "wc"', '      2       3      14\n[0]\n'],
    ['one two\\nthree\\n', '"wc", "wc", "-l"', '2\n[0]\n'],
    ['one two\\nthree\\n', '"wc", "wc", "-c"', '14\n[0]\n'],
    ['xa\\nyb\\n', '"grep", "grep", "-v", "a"', 'yb\n[0]\n'],
    ['xa\\nyb\\n', '"grep", "grep", "zz"', '[1]\n'],
    ['1\\n2\\n3\\n', '"head", "head", "-n", "2"', '1\n2\n[0]\n'],
    ['hello\\n', '"tr", "tr", "a-z", "A-Z"', 'HELLO\n[0]\n'],
    ['a b\\n', '"tr", "tr", " ", "\\\\n"', 'a\nb\n[0]\n'],
    ['abc\\n', '"rev", "rev"', 'cba\n[0]\n'],
    ['x\\n', '"cat", "cat"', 'x\n[0]\n'],
    ['x\\n', '"cat", "cat", "file.txt"', '<cat file.txt>\n[0]\n'],
    ['x\\n', '"true", "true"', '[0]\n'],
    ['x\\n', '"false", "false"', '[1]\n'],
    ['x\\n', '"ls", "ls", "-l"', '<ls -l>\n[0]\n'],
  ];
  for (const [feed, cmd, want] of cases) {
    it(cmd, () => expect(outputs(pipeline(feed, cmd))).toEqual([want]));
  }

  it('filters reading the terminal see end of file at once', () => {
    expect(outputs('execlp("wc", "wc", "-l", NULL);')).toEqual(['0\n']);
    expect(outputs('execlp("head", "head", NULL);')).toEqual(['']);
  });
});

describe('schedule with pipes', () => {
  it('lists outputs that end in a deadlock', () => {
    const r = preset('pipe-deadlock');
    expect(enumerate(r).outputs).toEqual(['child waits\nparent waits\n' + HANG, 'parent waits\nchild waits\n' + HANG]);
    const h = findHang(r);
    expect(h?.output).toMatch(/^(child|parent) waits\n(child|parent) waits\n$/);
    const why = stuckReasons(r, h!.state);
    expect(why).toHaveLength(2);
    expect(why[0]).toMatch(/pid 1000 is blocked in read\(\) at line \d+: no more data will arrive/);
    expect(why[0]).toMatch(/pid 1001 still holds a write end \(and never closes it, and is itself blocked in read\(\)/);
  });

  it('findHang is null when every schedule finishes', () => {
    expect(findHang(preset('pipe-hello'))).toBeNull();
    expect(findHang(run('printf("x");'))).toBeNull();
  });

  it('an output that stops at a deadlock is possible, with the reason', () => {
    const r = preset('pipe-parent-noclose');
    const v = check(r, 'child exits\nparent got data\n');
    expect(v.possible).toBe(true);
    expect(v.hang.join(' ')).toMatch(/pid 1000 itself still holds a write end/);
    expect(isPossible(r, 'parent got data\nchild exits\n')).toBe(true);
    const no = check(r, 'child exits\nparent got data\nnever printed\n');
    expect(no.possible).toBe(false);
    expect(no.reasons.join(' ')).toMatch(/deadlocked/);
  });

  it('a wait the interpreter passes can still deadlock in every schedule', () => {
    const r = run(`int fd[2]; char c; pipe(fd);
      if (fork() == 0) { close(fd[1]); read(fd[0], &c, 1); printf("c\\n"); exit(0); }
      printf("p\\n"); wait(NULL); write(fd[1], "x", 1);`);
    expect(enumerate(r).outputs).toEqual(['p\n' + HANG]);
    const why = stuckReasons(r, findHang(r)!.state).join(' ');
    expect(why).toMatch(/wait\(\) at line 3 for a child that never exits/);
    expect(why).toMatch(/until pid 1000 writes "x" into the pipe/);
  });

  it('explains reads blocked on a write', () => {
    const r = preset('pipe-barrier');
    const v = check(r, 'child second\nparent first\n');
    expect(v.possible).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/blocked in read\(\) at line \d+ until pid 1000 writes "x" into the pipe \(line \d+\), and pid 1000 first prints "parent first\\n"/);
    // The reader is the grandchild here: its writer has not been forked yet.
    const relay = preset('pipe-relay');
    const w = check(relay, 'parent sends baton\ngrandchild got baton\n');
    expect(w.reasons.join(' ')).toMatch(/pid 1002 does not exist until pid 1001 forks it at line \d+, and pid 1001 first prints "child got baton\\n"/);
    const pp = preset('pipe-pingpong');
    expect(check(pp, 'ping 0\nping 1\n').reasons.join(' ')).toMatch(/blocked in read\(\)/);
  });

  it('explains reads waiting for end of file', () => {
    const r = preset('pipe-holders');
    const v = check(r, 'read 1 byte\nend of file\nB exits\n');
    expect(v.possible).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/until every write end of the pipe from line \d+ is closed, but pid 1002 still holds a write end \(and keeps it until it exits\)/);
    const e = run(`int fd[2]; char c; pipe(fd);
      if (fork() == 0) { close(fd[1]); while (read(fd[0], &c, 1) > 0) ; printf("eof\\n"); exit(0); }
      printf("closing\\n");
      close(fd[1]);`);
    expect(check(e, 'eof\nclosing\n').reasons.join(' ')).toMatch(/pid 1000 still holds a write end \(and closes it at line 4\)/);
    expect(check(preset('pipe-eof'), 'got [one]\ngot [two]\ngot [three]\n').reasons).toContain(
      'Every schedule that prints this much goes on to print "end of file\\n" (line 18).',
    );
  });

  it('simulates up to the deadlock', () => {
    const r = preset('pipe-noclose');
    const frames = simulate(r, 'parent');
    expect(frames.at(-1)?.output).toBe('got [one]\n');
    expect(frames.at(-1)?.status).toEqual(['blocked', 'blocked']);
    expect(statuses(r, initialState(r))).toEqual(['ready', 'unborn']);
  });

  it('every pipe preset runs and has at least one output', () => {
    const pipes = PRESETS.filter((p) => p.id.startsWith('pipe-'));
    expect(pipes.length).toBeGreaterThanOrEqual(20);
    for (const p of pipes) expect(enumerate(runSource(p.code, { mode: p.mode })).outputs.length).toBeGreaterThan(0);
  });

  it('pipelines give the shell answer', () => {
    expect(enumerate(preset('pipe-echo-wc')).outputs).toEqual(['3\npipeline done\n']);
    expect(enumerate(preset('pipe-three-stage')).outputs).toEqual(['SEPIP OLLEH\n']);
    expect(enumerate(preset('pipe-status')).outputs).toEqual(['pipe says 300, exit status says 44\n']);
    expect(enumerate(preset('pipe-buffer-lands')).outputs).toEqual(['parent got: hi there\n']);
    expect(enumerate(preset('pipe-cat')).outputs).toHaveLength(3);
  });
});
