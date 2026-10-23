import { describe, expect, it } from 'vitest';
import { runSource, type RunResult } from '../src/core/interp';
import { PRESETS } from '../src/core/presets';
import { generate } from '../src/core/quiz';
import { enumerate, enabled, initialState, step, TooManyStates, type State } from '../src/core/schedule';

/** Every interleaving of every event, no memo, no reduction: the reference answer. */
function bruteForce(run: RunResult): string[] {
  const out = new Set<string>();
  const go = (s: State, text: string) => {
    let moved = false;
    for (let i = 0; i < run.procs.length; i++) {
      if (!enabled(run, s, i)) continue;
      moved = true;
      const n = { pc: [...s.pc], reaped: [...s.reaped] };
      const e = step(run, n, i);
      go(n, e.kind === 'out' ? text + e.text : text);
    }
    if (!moved) out.add(text);
  };
  go(initialState(run), '');
  return [...out].sort();
}

const extra = [
  `if (fork() == 0) { printf("a\\n"); exit(0); }
   if (fork() == 0) { printf("b\\n"); exit(0); }
   wait(NULL); printf("p\\n"); wait(NULL); printf("q\\n");`,
  `pid_t a = fork(); if (a == 0) { if (fork() == 0) { printf("g\\n"); exit(0); } printf("a\\n"); exit(0); }
   pid_t b = fork(); if (b == 0) { printf("b\\n"); exit(0); }
   waitpid(a, NULL, 0); printf("p\\n");`,
  `if (fork() == 0) { fork(); printf("c\\n"); wait(NULL); printf("d\\n"); } else { printf("p\\n"); }`,
  `for (int i = 0; i < 2; i++) { if (fork() == 0) { printf("%d\\n", i); } else { wait(NULL); } } printf("e\\n");`,
];

describe('reduced search matches brute force', () => {
  const cases: [string, RunResult][] = [
    ...PRESETS.filter((p) => p.id !== 'loop3').map((p): [string, RunResult] => [p.id, runSource(p.code, { mode: p.mode })]),
    ...extra.map((src, i): [string, RunResult] => [`extra${i}`, runSource(src, { mode: 'line' })]),
    ...generate(11, 12)
      .map((q, i): [string, RunResult] => [`quiz${i}`, runSource(q.code, { mode: q.mode })])
      .filter(([, r]) => r.procs.length <= 6),
  ];
  for (const [name, r] of cases) {
    it(name, () => {
      expect(enumerate(r).outputs).toEqual(bruteForce(r));
    });
  }
});

describe('scale', () => {
  it('collapses symmetric processes: 16 processes, one output, few states', () => {
    const r = runSource('for (int i = 0; i < 4; i++) { fork(); printf("hi\\n"); }', { mode: 'line' });
    const e = enumerate(r);
    expect(r.procs).toHaveLength(16);
    expect(e.outputs).toHaveLength(1);
    expect(e.states).toBeLessThan(1000);
  });

  it('gives up cleanly past the state budget', () => {
    const r = runSource('for (int i = 0; i < 3; i++) { fork(); printf("%d", getpid()); }', { mode: 'none' });
    expect(() => enumerate(r, 10, 50)).toThrow(TooManyStates);
  });
});
