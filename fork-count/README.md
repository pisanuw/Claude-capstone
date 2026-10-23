# Fork Count

"How many times is hello printed?" is on nearly every operating systems exam,
and most students guess. Paste a short fork/wait/exit/printf snippet and Fork
Count runs every process it creates, draws the process tree, and enumerates
every output the scheduler could produce, stdio buffers copied at fork
included. Type an output and it says whether some schedule prints it; if none
does, it names the happens-before edge that rules it out. A generator turns
templates into new exam questions whose answers are checked against every
schedule.

Live: [fork-count.netlify.app](https://fork-count.netlify.app)

Built from idea 2026-10-09 n2 in
[`pisanuw/daily-project-ideas`](https://github.com/pisanuw/daily-project-ideas).

![The buffered-output example: program, summary, process tree and one child-first schedule](desktop.png)

## What it does

1. **Interpreter.** A hand-written lexer and recursive-descent parser for a C
   subset: one `main()`, `int`/`pid_t` variables, `if`/`else`, `for`,
   `while`, `do`, `break`, `continue`, `return`, and C's operators other than
   pointers and arrays. Calls: `fork`, `wait`, `waitpid`, `exit`, `_exit`,
   `printf`, `fprintf(stdout|stderr)`, `puts`, `putchar`, `write(1|2, …)`,
   `fflush`, `setbuf`/`setvbuf`, `getpid`, `getppid`, `sleep` (ignored),
   `WEXITSTATUS`, and `execlp`/`execl`/`execvp` stubs. `#include` lines are
   skipped, so textbook snippets paste in unchanged.
2. **Processes by re-execution.** A process is named by its fork decisions
   (the root is `[]`, its first child `[true]`, its second `[false, true]`).
   Running a process re-executes `main()` from the top, following those
   decisions until the process starts, then records its events. That
   reproduces the child's variables and stdio buffer exactly, so `fork()` can
   sit anywhere, including `fork() && fork() || fork()`.
3. **stdio buffering.** Line-buffered (terminal), fully buffered (file or
   pipe, 4096 bytes) or unbuffered, switchable in the UI or by
   `setbuf`/`setvbuf` in the code. Text still buffered at fork is printed by
   both copies, `_exit` and `exec` throw it away, `write` and `stderr` skip
   it. The summary points out every write that contains inherited text.
4. **Every schedule.** Happens-before is program order, parent fork before
   child, and child exit before the `wait` that reaps it. The search branches
   only on which ready process writes next. Forks, exits and satisfiable waits
   run eagerly (they are invisible and only enable more steps), and states are
   memoised on a canonical form where processes with identical futures are
   interchangeable, so `for (i = 0; i < 4; i++) { fork(); printf("hi\n"); }`
   (16 processes, 30 writes) needs about 200 states instead of millions.
5. **Is this output possible?** Exact, whatever the number of outputs. A
   no comes with reasons: the character count that every run prints, the
   longest prefix some schedule can produce, and for each write that would fit
   next, the chain of edges blocking it ("pid 1000 is blocked in wait() at line
   12 until one of its children exits, and pid 1001 still has to print
   "child\n""). A yes comes with a schedule that prints it.
6. **Process tree and one schedule.** An SVG tree with fork lines on the edges,
   stepped through a parent-first, child-first or seeded random schedule, with
   each process shown as not yet forked, runnable, blocked in wait, zombie,
   orphan, or reaped.
7. **Exam questions.** Seven templates (fork loops, print before fork,
   short-circuit forks, wait/no wait, nested forks, loop counters, parent vs
   child) mutated by a seeded RNG. A "how many times" question is kept only
   when the count is the same in every schedule; a "which outputs are
   possible" question gets two real outputs and wrong ones built by swapping,
   dropping or doubling lines, each checked exactly. Export as Markdown or QTI
   1.2 (numerical and multiple-answers items, the dialect Canvas imports).

Thirteen examples cover the classics: three forks in a loop, the duplicated
`hello world`, the same loop redirected to a pipe, `wait`, short-circuit
forks, the loop counter, separate memory, `exit` vs `_exit`, `exec`,
`waitpid` on one child, exit status, `write` vs `printf`, and an orphan. The
program and buffering mode live in the URL fragment for sharing.

## Design decisions

- **No LLM and no D3.** The idea's stack listed D3 for the tree; a 25-line
  tidy layout and plain SVG do the job, and the bundle is about 52 kB.
- **Re-execution instead of cloning interpreter state.** Copying a tree-walking
  interpreter mid-expression is fiddly; replaying the deterministic prefix is
  short and obviously correct, and programs this size run in microseconds.
- **Search budget.** Enumeration stops at 50,000 canonical states or 2 million
  set insertions (about a third of a second), and lists at most 2,000 outputs
  (the count is then shown as "at least"). Past the budget the tree and
  single schedules still work.
- **Soundness check.** The test suite compares the reduced search against a
  brute-force enumerator (every interleaving of every event, no memo) on all
  presets, generated questions and extra wait/waitpid programs.

## Limitations

- pids are numbered in the order Fork Count discovers processes, not the order
  a kernel would hand them out, and `getppid()` returns the original parent
  even after the parent exits (a real orphan sees init, or a subreaper). Output
  that prints pids is therefore one consistent labelling, not every possible
  one.
- `wait(NULL)` may reap any finished child in the schedule search, but the
  value it returns to the program is the oldest unreaped child. Programs that
  branch on which pid `wait` returned are explored for that one case only.
- Each `write` is atomic and there is no shared memory, signals, pipes, files,
  `vfork`, threads or helper functions. `exec` is a stub: `echo` prints its
  arguments, other programs print a `<program args>` placeholder line.
- The QTI export follows the Canvas QTI 1.2 dialect but has not been imported
  into a live Canvas course yet.

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run lint
npm run typecheck
npm run coverage   # vitest, 94 tests, thresholds 85%
npm run build      # dist/
```

Core logic lives in `src/core` (parser, interpreter, schedule search, quiz,
tree layout, share links) and is unit tested; `src/ui` is the DOM layer.
