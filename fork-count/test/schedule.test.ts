import { describe, expect, it } from 'vitest';
import { runSource, type BufMode } from '../src/core/interp';
import {
  allChunks,
  bestPrefix,
  check,
  enumerate,
  initialState,
  isPossible,
  normaliseAnswer,
  show,
  simulate,
  statuses,
} from '../src/core/schedule';

const run = (src: string, mode: BufMode = 'line') => runSource(src, { mode });

describe('enumerate', () => {
  it('two independent writers give both orders', () => {
    const r = run('if (fork() == 0) printf("c\\n"); else printf("p\\n");');
    const e = enumerate(r);
    expect(e.outputs).toEqual(['c\np\n', 'p\nc\n']);
    expect(e.schedules).toBe(2n);
    expect(e.truncated).toBe(false);
  });

  it('identical writes collapse into one output', () => {
    const e = enumerate(run('fork(); fork(); fork(); printf("x");'));
    expect(e.outputs).toEqual(['xxxxxxxx']);
    expect(e.schedules).toBe(40320n);
  });

  it('wait orders the parent after the child', () => {
    const e = enumerate(run('if (fork() == 0) { printf("c\\n"); exit(0); } wait(NULL); printf("p\\n");'));
    expect(e.outputs).toEqual(['c\np\n']);
  });

  it('the parent prints before forking, so its child cannot come first', () => {
    const e = enumerate(run('printf("A\\n"); if (fork() == 0) printf("B\\n"); else printf("C\\n");'));
    expect(e.outputs).toEqual(['A\nB\nC\n', 'A\nC\nB\n']);
  });

  it('wait(NULL) is satisfied by any one child', () => {
    const src = `if (fork() == 0) { printf("a\\n"); exit(0); }
      if (fork() == 0) { printf("b\\n"); exit(0); }
      wait(NULL); printf("p\\n"); wait(NULL);`;
    const e = enumerate(run(src));
    expect(e.outputs).toContain('a\np\nb\n');
    expect(e.outputs).toContain('b\np\na\n');
    expect(e.outputs).not.toContain('p\na\nb\n');
    expect(e.outputs).toHaveLength(4);
  });

  it('caps huge output sets and says so', () => {
    const e = enumerate(run('for (int i = 0; i < 3; i++) fork(); printf("%d", getpid());'), 50);
    expect(e.truncated).toBe(true);
    expect(e.outputs.length).toBeLessThanOrEqual(50);
  });

  it('allChunks lists every write once', () => {
    expect(allChunks(run('fork(); printf("x\\n");')).map((c) => [c.proc, c.ev.text])).toEqual([
      [0, 'x\n'],
      [1, 'x\n'],
    ]);
  });
});

describe('check', () => {
  const waitSrc = 'printf("A\\n"); if (fork() == 0) { printf("B\\n"); exit(0); } wait(NULL); printf("C\\n");';

  it('accepts reachable outputs with a witness schedule', () => {
    const r = run('if (fork() == 0) printf("c\\n"); else printf("p\\n");');
    const v = check(r, 'p\nc\n');
    expect(v.possible).toBe(true);
    expect(v.witness.chunks.map((c) => c.text)).toEqual(['p\n', 'c\n']);
    expect(isPossible(r, 'c\np\n')).toBe(true);
    expect(isPossible(r, 'c\n')).toBe(false);
  });

  it('explains a character-count mismatch', () => {
    const v = check(run('fork(); fork(); printf("x");'), 'xxx');
    expect(v.possible).toBe(false);
    expect(v.reasons[0]).toMatch(/"x" appears 4 times in every run but 3 in yours/);
  });

  it('names the fork edge when a child would print before its parent forks it', () => {
    const v = check(run(waitSrc), 'B\nA\nC\n');
    expect(v.possible).toBe(false);
    expect(v.reasons[0]).toMatch(/No schedule can start with/);
    expect(v.reasons[1]).toMatch(/pid 1001 does not exist until pid 1000 forks it at line 1, and pid 1000 first prints "A\\n"/);
  });

  it('names the wait edge', () => {
    const v = check(run(waitSrc), 'A\nC\nB\n');
    expect(v.reasons[0]).toMatch(/first 2 characters/);
    expect(v.reasons[1]).toMatch(/blocked in wait\(\) at line 1 until one of its children exits, and pid 1001 still has to print "B\\n"/);
  });

  it('names program order inside one process', () => {
    const v = check(run('if (fork() == 0) { printf("1\\n"); printf("2\\n"); } else printf("p\\n");'), '2\n1\np\n');
    expect(v.reasons.join(' ')).toMatch(/prints "1\\n" \(line 1\) before that: program order/);
  });

  it('explains a specific waitpid target', () => {
    const src = `pid_t a = fork(); if (a == 0) { printf("A\\n"); exit(0); }
      pid_t b = fork(); if (b == 0) { printf("B\\n"); exit(0); }
      waitpid(b, NULL, 0); printf("P\\n");`;
    const v = check(run(src), 'P\nA\nB\n');
    expect(v.reasons.join(' ')).toMatch(/until pid 1002 exits, and pid 1002 still has to print "B\\n"/);
  });

  it('follows blocked chains through nested processes', () => {
    // The grandchild cannot exist until the child forks it, and the child is
    // blocked in nothing: it prints "c" first.
    const src = 'if (fork() == 0) { printf("c\\n"); if (fork() == 0) printf("g\\n"); }';
    const v = check(run(src), 'g\nc\n');
    expect(v.reasons.join(' ')).toMatch(/pid 1002 does not exist until pid 1001 forks it/);
    // A wait whose child is itself waiting.
    const src2 = `if (fork() == 0) { if (fork() == 0) { printf("g\\n"); exit(0); } wait(NULL); exit(0); }
      wait(NULL); printf("p\\n");`;
    const v2 = check(run(src2), 'p\ng\n');
    expect(v2.reasons.join(' ')).toMatch(/pid 1001 is blocked in wait\(\).*pid 1002 still has to print "g\\n"/);
    // A child that does not exist yet because its parent is blocked.
    const src3 = `if (fork() == 0) { printf("a\\n"); exit(0); } wait(NULL);
      if (fork() == 0) { printf("b\\n"); exit(0); }`;
    expect(check(run(src3), 'b\na\n').reasons.join(' ')).toMatch(/does not exist until pid 1000 forks it at line 2; pid 1000 is blocked in wait/);
  });

  it('writes are atomic', () => {
    const v = check(run('fork(); printf("ab\\n");'), 'a\nbab\n');
    expect(v.possible).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/lands in one piece/);
  });

  it('reports text that no pending write can start', () => {
    const v = check(run('if (fork() == 0) printf("ab"); else printf("ba");'), 'aabb');
    expect(v.reasons.join(' ')).toMatch(/No pending write starts with "a"|lands in one piece/);
    const v2 = check(run('printf("ab"); printf("cd");', 'none'), 'cdab');
    expect(v2.reasons.join(' ')).toMatch(/program order/);
    const v3 = check(run('if (fork() == 0) printf("xy"); else printf("yx");'), 'xxyy');
    expect(v3.possible).toBe(false);
    expect(v3.reasons.length).toBeGreaterThan(1);
  });

  it('bestPrefix finds the longest reachable prefix', () => {
    const r = run(waitSrc);
    expect(bestPrefix(r, 'A\nC\n').matched).toBe(2);
    expect(bestPrefix(r, 'A\nB\nC\n').matched).toBe(6);
  });
});

describe('helpers', () => {
  it('normaliseAnswer handles CRLF and typed escapes', () => {
    expect(normaliseAnswer('a\r\nb\\nc\\t')).toBe('a\nb\nc\t');
  });
  it('show escapes control characters', () => {
    expect(show('a\n\t\\')).toBe('"a\\n\\t\\\\"');
  });
});

describe('simulate', () => {
  const src = 'if (fork() == 0) { printf("c\\n"); return 0; } printf("p\\n"); return 0;';

  it('parent-first and child-first give different orders', () => {
    const r = run(src);
    expect(simulate(r, 'parent').at(-1)?.output).toBe('p\nc\n');
    expect(simulate(r, 'child').at(-1)?.output).toBe('c\np\n');
    const rand = simulate(r, 'random', 7);
    expect(['p\nc\n', 'c\np\n']).toContain(rand.at(-1)?.output);
    expect(simulate(r, 'random', 7)).toEqual(rand);
  });

  it('tracks zombies, orphans and reaping', () => {
    const r = run(src);
    expect(statuses(r, initialState(r))).toEqual(['ready', 'unborn']);
    // Child first: the child exits while the parent is alive: a zombie.
    const child = simulate(r, 'child');
    expect(child.some((f) => f.status[1] === 'zombie')).toBe(true);
    // Parent first: the parent exits, the child is an orphan, then init reaps it.
    const parent = simulate(r, 'parent');
    expect(parent.some((f) => f.status[1] === 'orphan')).toBe(true);
    expect(parent.at(-1)?.status).toEqual(['reaped', 'reaped']);
  });

  it('shows a process blocked in wait', () => {
    const r = run('if (fork() == 0) { printf("c"); exit(0); } wait(NULL);');
    const frames = simulate(r, 'parent');
    expect(frames.some((f) => f.status[0] === 'blocked')).toBe(true);
    expect(frames.at(-1)?.status).toEqual(['reaped', 'reaped']);
  });
});
