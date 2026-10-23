import { describe, expect, it } from 'vitest';
import { format, ROOT_PID, runSource, RunError, type BufMode, type Ev, type OutEvent } from '../src/core/interp';

const outs = (src: string, mode: BufMode = 'line') =>
  runSource(src, { mode }).procs.map((p) =>
    p.events.filter((e): e is OutEvent => e.kind === 'out').map((e) => e.text),
  );

describe('format', () => {
  it('supports the usual conversions', () => {
    expect(format('%d|%i|%5d|%-3d|%03d|%s|%c|%x|%X|%u|%ld|%%', [1, -2, 3, 4, -5, 'hi', 65, 255, 255, -1, 7], 1)).toBe(
      '1|-2|    3|4  |-05|hi|A|ff|FF|4294967295|7|%',
    );
  });
  it('rejects mismatched arguments', () => {
    expect(() => format('%d', [], 1)).toThrow(/fewer arguments/);
    expect(() => format('%s', [1], 1)).toThrow(/string/);
    expect(() => format('%d', ['x'], 1)).toThrow(/number/);
    expect(() => format('%f', [1], 1)).toThrow(/unsupported/);
  });
});

describe('processes', () => {
  it('forks in a loop: 2^n processes', () => {
    const r = runSource('for (int i = 0; i < 3; i++) fork(); printf("x\\n");', { mode: 'line' });
    expect(r.procs).toHaveLength(8);
    expect(r.procs.map((p) => p.pid)).toEqual([...Array(8).keys()].map((i) => ROOT_PID + i));
    expect(r.procs[0]?.children).toHaveLength(3);
    expect(r.procs[1]?.parent).toBe(0);
    expect(r.procs[1]?.forkLine).toBe(1);
  });

  it('follows short-circuit evaluation through fork', () => {
    expect(runSource('fork() && fork() || fork(); printf("x");', { mode: 'line' }).procs).toHaveLength(5);
    expect(runSource('(fork() || fork()) && fork();', { mode: 'line' }).procs).toHaveLength(5);
  });

  it('gives each process its own memory and the right pids', () => {
    const src = `int x = 1;
      pid_t p = fork();
      if (p == 0) { x++; printf("c %d %d %d\\n", x, getpid(), getppid()); }
      else { x--; printf("p %d %d %d\\n", x, getpid(), p); }`;
    expect(outs(src)).toEqual([[`p 0 ${ROOT_PID} ${ROOT_PID + 1}\n`], [`c 2 ${ROOT_PID + 1} ${ROOT_PID}\n`]]);
  });

  it('grandchildren see their own parent', () => {
    const src = 'if (fork() == 0) { if (fork() == 0) printf("%d", getppid()); }';
    expect(outs(src)[2]).toEqual([String(ROOT_PID + 1)]);
  });

  it('records fork, wait and exit events in program order', () => {
    const r = runSource('if (fork() == 0) exit(2); wait(NULL); printf("done\\n");', { mode: 'line' });
    expect(r.procs[0]?.events.map((e: Ev) => e.kind)).toEqual(['fork', 'wait', 'out', 'exit']);
    expect(r.procs[1]?.events.map((e: Ev) => e.kind)).toEqual(['exit']);
    expect(r.procs[1]?.exitCode).toBe(2);
  });

  it('wait with no children returns -1 without an event', () => {
    const r = runSource('int r = wait(NULL); printf("%d", r);', { mode: 'none' });
    expect(r.procs[0]?.events.map((e) => e.kind)).toEqual(['out', 'exit']);
    expect(outs('int r = wait(NULL); printf("%d", r);')).toEqual([['-1']]);
  });

  it('waitpid targets one child and reports its status', () => {
    const src = `int s;
      pid_t a = fork();
      if (a == 0) exit(1);
      pid_t b = fork();
      if (b == 0) exit(7);
      waitpid(b, &s, 0);
      printf("%d %d\\n", WEXITSTATUS(s), WIFEXITED(s));`;
    const r = runSource(src, { mode: 'line' });
    const w = r.procs[0]?.events.find((e) => e.kind === 'wait');
    expect(w).toMatchObject({ kind: 'wait', target: 2 });
    expect(outs(src)[0]).toEqual(['7 1\n']);
    expect(outs('int r = waitpid(42, NULL, 0); printf("%d", r);')).toEqual([['-1']]);
    expect(runSource('fork(); waitpid(-1, NULL, 0);', { mode: 'line' }).procs[0]?.events[1]).toMatchObject({ target: null });
  });

  it('exit status of a child that has not run yet is computed on demand', () => {
    const src = 'int s; if (fork() == 0) { if (fork() == 0) exit(4); wait(&s); exit(WEXITSTATUS(s) + 1); } wait(&s); printf("%d", WEXITSTATUS(s));';
    expect(outs(src)[0]).toEqual(['5']);
  });
});

describe('stdio buffering', () => {
  it('copies unflushed text into the child', () => {
    const r = runSource('printf("a"); fork(); printf("b\\n");', { mode: 'line' });
    expect(r.procs.map((p) => p.inheritedBuffer)).toEqual(['', 'a']);
    const child = r.procs[1]?.events[0] as OutEvent;
    expect(child).toMatchObject({ text: 'ab\n', inherited: 1, cause: 'newline' });
  });

  it('line mode flushes on newline, full mode only at exit', () => {
    const src = 'printf("1\\n"); fork(); printf("2\\n");';
    expect(outs(src, 'line')).toEqual([['1\n', '2\n'], ['2\n']]);
    expect(outs(src, 'full')).toEqual([['1\n2\n'], ['1\n2\n']]);
    expect(outs(src, 'none')).toEqual([['1\n', '2\n'], ['2\n']]);
  });

  it('flushes when the buffer fills', () => {
    const r = runSource('for (int i = 0; i < 1100; i++) printf("abcd");', { mode: 'full', maxSteps: 10_000 });
    const ev = r.procs[0]?.events[0] as OutEvent;
    expect(ev.cause).toBe('full');
    expect(ev.text).toHaveLength(4096);
  });

  it('fflush, setbuf and setvbuf change when text appears', () => {
    expect(outs('printf("a"); fflush(stdout); fork();', 'full')).toEqual([['a'], []]);
    expect(outs('setbuf(stdout, NULL); printf("a"); fork();', 'full')).toEqual([['a'], []]);
    expect(outs('setvbuf(stdout, NULL, _IONBF, 0); printf("a"); fork();', 'full')).toEqual([['a'], []]);
    expect(outs('setvbuf(stdout, NULL, _IOLBF, 0); printf("a\\n"); fork();', 'full')).toEqual([['a\n'], []]);
    expect(outs('setvbuf(stdout, NULL, _IOFBF, 0); printf("a\\n"); fork();', 'line')).toEqual([['a\n'], ['a\n']]);
    expect(outs('setbuf(stdout, 0); setbuf(stdout, 1); printf("a"); fork();', 'full')).toEqual([['a'], []]);
  });

  it('_exit and exec discard the buffer, exit flushes it', () => {
    const r = runSource('printf("A"); if (fork() == 0) _exit(0); wait(NULL); printf("B\\n");', { mode: 'line' });
    expect(r.procs[1]?.events).toEqual([{ kind: 'exit', code: 0, line: 1, discarded: 'A' }]);
    expect(outs('printf("A"); exit(0);')).toEqual([['A']]);
    expect(outs('printf("x "); execlp("echo", "echo", "hi", "there", NULL); printf("never");')).toEqual([['hi there\n']]);
    expect(outs('execlp("ls", "ls", "-l", NULL);')).toEqual([['<ls -l>\n']]);
    expect(outs('execl("/bin/date", "date", NULL);')).toEqual([['<date>\n']]);
    expect(runSource('execlp("false", "false", NULL);', { mode: 'line' }).procs[0]?.exitCode).toBe(1);
    expect(outs('execlp("true", "true", NULL);')).toEqual([[]]);
  });

  it('write and stderr bypass the buffer', () => {
    expect(outs('printf("A"); write(1, "BCD", 2); fprintf(stderr, "E"); fprintf(stdout, "F\\n");')).toEqual([['BC', 'E', 'AF\n']]);
    expect(outs('puts("p"); putchar(113); putchar(10);')).toEqual([['p\n', 'q\n']]);
  });
});

describe('language', () => {
  it('evaluates expressions like C', () => {
    const src = `int a = 7, b = 2, c;
      c = a / b; printf("%d ", c);
      c = -a % b; printf("%d ", c);
      c = a << 2 | 1; printf("%d ", c);
      c = a & 3 ^ 1; printf("%d ", c);
      c = a >> 1; printf("%d ", c);
      c = !a + ~0 + +b; printf("%d ", c);
      a += 3; a -= 1; a *= 2; a /= 3; a %= 4; printf("%d ", a);
      c = a++ + ++a; printf("%d ", c);
      c = b-- - --b; printf("%d ", c);
      c = (a > b) + (a >= b) + (a <= b) + (a != b) + (a < b); printf("%d ", c);
      c = 1 || x; c = 0 && x; printf("%d ", c);
      c = 0 ? 1 : 2; printf("%d\\n", c);`;
    expect(outs(src)).toEqual([['3 -1 29 2 3 1 2 6 2 3 0 2\n']]);
  });

  it('scopes loop variables and blocks', () => {
    const src = 'int i = 9; for (int i = 0; i < 2; i++) { int j = i; printf("%d", j); } printf(" %d\\n", i);';
    expect(outs(src)).toEqual([['01 9\n']]);
  });

  it('handles break, continue, while and do-while', () => {
    const src = `int n = 0;
      while (1) { n++; if (n == 2) continue; if (n > 3) break; printf("%d", n); }
      do printf("d"); while (0);
      printf("\\n");`;
    expect(outs(src)).toEqual([['13d\n']]);
  });

  it('return in main exits with its value', () => {
    const r = runSource('int main() { printf("a"); return 3; printf("b"); }', { mode: 'line' });
    expect(r.procs[0]?.exitCode).toBe(3);
    expect(outs('int main() { printf("a"); return 3; printf("b"); }')).toEqual([['a']]);
  });

  it('ignores sleep and knows the constants', () => {
    expect(outs('sleep(1); usleep(5); printf("%d%d%d", EXIT_FAILURE, stderr, true);')).toEqual([['121']]);
  });

  it('reports runtime errors', () => {
    const err = (src: string) => () => runSource(src, { mode: 'line' });
    expect(err('x = 1;')).toThrow(/'x' is not declared/);
    expect(err('printf("%d", y);')).toThrow(/'y' is not declared/);
    expect(err('int a = 1 / 0;')).toThrow(/division by zero/);
    expect(err('frobnicate();')).toThrow(/not supported/);
    expect(err('fork(1);')).toThrow(/takes 0 arguments/);
    expect(err('wait();')).toThrow(/takes 1 argument$/);
    expect(err('int a = "s";')).toThrow(/string cannot be used/);
    expect(err('printf(1);')).toThrow(/format string/);
    expect(err('fprintf(stdout, 1);')).toThrow(/format string/);
    expect(err('puts(1);')).toThrow(/puts needs a string/);
    expect(err('write(1, 2, 3);')).toThrow(/write\(fd/);
    expect(err('write(3, "x", 1);')).toThrow(/fd 1 and 2/);
    expect(err('break;')).toThrow(/outside a loop/);
    expect(err('while (1) {}')).toThrow(/infinite loop/);
    expect(err('while (1) fork();')).toThrow(/fork bomb/);
    try {
      runSource('\n\nint a = 1 % 0;', { mode: 'line' });
    } catch (e) {
      expect(e).toBeInstanceOf(RunError);
      expect((e as RunError).line).toBe(3);
    }
    expect(new RunError('x', null).message).toBe('x');
  });
});
