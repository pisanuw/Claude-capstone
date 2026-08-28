# Claude-capstone

[![CI](https://github.com/pisanuw/Claude-capstone/actions/workflows/ci.yml/badge.svg)](https://github.com/pisanuw/Claude-capstone/actions/workflows/ci.yml)

Capstone projects built by Claude from prompts in
[`pisanuw/daily-project-ideas`](https://github.com/pisanuw/daily-project-ideas).

## Projects

### [`accessibility-lens/`](./accessibility-lens)

**Accessibility Lens** implements idea #2 ("Code Blindfold") from the ideas day of
2026-05-12. Paste a public URL and it analyzes the page against a deterministic
subset of WCAG 2.1, then replays it the way users with low vision, color blindness,
keyboard-only navigation, and screen readers experience it, with a suggested fix for
every issue and optional Claude-generated code rewrites.

TypeScript monorepo (Express + a pure analysis engine on the server, React + Vite +
Tailwind on the client), 107 tests, deployable as a single Node service.
Live: [accessibility-lens-pisanuw.netlify.app](https://accessibility-lens-pisanuw.netlify.app).
See its [README](./accessibility-lens/README.md) and
[ASSUMPTIONS](./accessibility-lens/ASSUMPTIONS.md).

### [`mult-streak/`](./mult-streak) and [`mult-streak-edge/`](./mult-streak-edge)

A multiplication-streak game: solve two 2-3 digit factors, ten correct in a row
wins a 24-hour crown, a wrong answer resets the streak. Anonymous cookie identity,
game state in a signed cookie, and a "player stopped" email to the admin via
Resend. `mult-streak` runs on **Render** behind the shared
[`backend-hub`](./backend-hub) service at `/mult-streak/` (where the idle email
is reliable); `mult-streak-edge` is the same game on **Netlify** (game works
fully; email is Render-only, by the nature of serverless). Both built from the
config-driven deploy pipeline.

### [`backend-hub/`](./backend-hub)

One **Render** web service hosting several low-traffic backends behind path
prefixes, because Render bills per idle service instance. Currently serves
`mult-streak` at `/mult-streak/`; `/chat` (chatwithdigitalme) and `/dsa`
(dsa-instructor) are documented, reserved mount points for future moves.

### [`emoji-lingua/`](./emoji-lingua)

Translate English into emoji and emoji back into English, with a hybrid engine: a
curated dictionary (deterministic, always available) plus optional Claude-powered
translation for context-aware results and interpretive readings. Deployed on
**Netlify** (static page + serverless API).

### [`schema-storyteller/`](./schema-storyteller)

Paste a SQL, Prisma, or JSON Schema and get a plain-English entity-relationship
narrative plus a rule-based review of likely-missing primary keys, foreign-key
indexes, and constraints, exportable as Markdown. Everything runs client-side: a
hand-written parser and a fixed rule set replace the idea's suggested LLM calls,
so the output is free, offline, and reproducible. Deployed on **Netlify**
(static site, no backend).

Live: [schema-storyteller.netlify.app](https://schema-storyteller.netlify.app).
See its [README](./schema-storyteller/README.md).

### [`migration-diff-narrator/`](./migration-diff-narrator)

Paste two versions of a SQL schema or TypeScript interfaces and get an
annotated breaking-change diff: every change classified safe / caution /
breaking with a one-sentence migration note, plus rename detection and a
Markdown-checklist export for PR descriptions. A deterministic rule set
replaces the idea's suggested Claude API classification, so verdicts are
instant, offline, and reproducible. Deployed on **Netlify** (static site, no
backend).

Live: [migration-diff-narrator.netlify.app](https://migration-diff-narrator.netlify.app).
See its [README](./migration-diff-narrator/README.md).

### [`shortcut-sprint/`](./shortcut-sprint)

A Duolingo-style trainer for keyboard shortcuts: a task prompt ("Go to
definition"), you press the shortcut, and an SM-2 spaced-repetition scheduler
decides when you see it again. Bundled libraries for VS Code, Chrome DevTools,
Figma, and Vim (multi-chord sequences included), custom JSON sets uploadable,
per-tool mastery radar chart and a daily streak. Entirely client-side: SM-2
replaces the idea's suggested backend, progress lives in localStorage.
Deployed on **Netlify** (static site, no backend).

Live: [shortcut-sprint.netlify.app](https://shortcut-sprint.netlify.app).
See its [README](./shortcut-sprint/README.md).

### [`ui-diff-lens/`](./ui-diff-lens)

Drag two UI screenshots into the browser and get a classified visual diff:
every changed region labeled as layout shift, spacing nudge, color restyle,
text edit, visibility fade, added, or removed element, each with a confidence
and the measured evidence. A perceptual pixel diff with anti-aliasing
detection, region clustering, and structural heuristics (displacement search,
opacity fit, edge correlation) replace the idea's suggested Claude Vision
calls, so results are deterministic and screenshots never leave the machine.
Exports an annotated PNG or a standalone HTML report. Deployed on **Netlify**
(static site, no backend).

Live: [ui-diff-lens.netlify.app](https://ui-diff-lens.netlify.app).
See its [README](./ui-diff-lens/README.md).

### [`code-review-gauntlet/`](./code-review-gauntlet)

A code-review reflex game: a realistic snippet appears with 1-3 planted
defects and a countdown; click every line you would flag, then get an
annotated explainer of every bug, security hole, and code smell — found or
missed. A seeded mutation engine over 11 hand-written templates (JavaScript,
Python, SQL; 51 catalogued single-line defects) replaces the idea's suggested
Claude API generation, and a date-seeded daily challenge plus localStorage
skill radar replace the suggested Supabase leaderboard, so the game is
deterministic, offline, and free. Deployed on **Netlify** (static site, no
backend).

Live: [code-review-gauntlet.netlify.app](https://code-review-gauntlet.netlify.app).
See its [README](./code-review-gauntlet/README.md).

### [`sound-sketchpad/`](./sound-sketchpad)

**Sound Sketchpad** implements idea #1 ("Procedural Sound Sketchpad") from the
ideas day of 2026-08-09. Describe a sound effect in plain words ("muffled
explosion heard from underground", "tiny retro laser") and hear it synthesized
instantly: a deterministic word-to-DSP recipe book (20 base sounds, 18
modifiers) replaces the idea's suggested Claude API code generation, and a
pure sample-by-sample DSP engine (oscillators, seeded noise, ADSR, biquad
filters, echo, bit crush) replaces Web Audio graphs, so tests assert on the
exact samples the user hears. Oscilloscope, signal-chain view, tuning
sliders, and 16/24-bit WAV export. Deployed on **Netlify** (static site, no
backend).

Live: [sound-sketchpad.netlify.app](https://sound-sketchpad.netlify.app).
See its [README](./sound-sketchpad/README.md).

### [`sql-replay/`](./sql-replay)

**SQL Replay** implements idea #1 ("SQL Replay") from the ideas day of
2026-07-30. Type a SQL SELECT, paste sample CSV data (or use the built-in
demo tables), and watch execution unfold one stage at a time: rows
materialize at FROM, pair up at JOIN (LEFT JOIN survivors get NULL padding),
fail WHERE with the evaluated condition shown, collapse into groups, get
filtered by HAVING, projected, deduplicated, ordered, and trimmed by LIMIT.
A deterministic narrator generates a plain-English sentence per stage from
the real execution stats, replacing the idea's suggested Claude API narrator,
and share links encode the whole workspace into the URL hash. Deployed on
**Netlify** (static site, no backend).

Live: [sql-replay.netlify.app](https://sql-replay.netlify.app).
See its [README](./sql-replay/README.md).

### [`har-detective/`](./har-detective)

**HAR Detective** implements idea #1 ("HAR Detective") from the ideas day of
2026-08-21. Drop a browser HAR file on the page and get an interactive
request waterfall plus a ranked, plain-English performance report: N+1 call
patterns, missing cache headers, uncompressed responses, redirect chains,
serialized API waterfalls, duplicate fetches, failing requests, slow server
think-time, oversized payloads, and HTTP/1.x connection churn. Ten
hand-written deterministic detectors replace the idea's suggested Claude API
analysis, so results are instant, reproducible, and the HAR never leaves the
browser. Deployed on **Netlify** (static site, no backend).

Live: [har-detective.netlify.app](https://har-detective.netlify.app).
See its [README](./har-detective/README.md).

### [`code-analogy-forge/`](./code-analogy-forge)

**Code Analogy Forge** implements idea #1 ("Code Analogy Forge") from the ideas
day of 2026-08-25. Paste code or name a CS concept, pick your audience (curious
child, high school student, CS undergraduate, or non-technical adult), and get
three hand-written analogies from three different everyday domains, each with a
"this maps to that" table. A keyword + code-shape detector (including real
self-call analysis for recursion) picks the concept; a curated corpus of 47
concepts x 3 domains x 4 audience variants (564 hand-written texts) replaces
the idea's suggested Claude API generation, and a localStorage library with tags, search, Markdown export,
and serverless read-only share links replaces Supabase; a 47-example menu
covers every concept, grouped into ten themed sections. Deployed on **Netlify**
(static site, no backend).

Live: [code-analogy-forge.netlify.app](https://code-analogy-forge.netlify.app).
See its [README](./code-analogy-forge/README.md).

### [`prompt-genome/`](./prompt-genome)

**Prompt Genome** implements idea #1 ("Prompt Genome") from the ideas day of
2026-08-23. Paste any AI prompt and see it as a DNA strand of typed,
color-coded genes: role, persona, context, task, constraint, format, example.
A rule-based classifier (explicit section labels plus sentence-level cue
patterns, each gene showing why it got its label) replaces the idea's
suggested Claude API parsing; three hand-written deterministic mutations per
gene type replace "AI suggests three alternatives"; and a word-level LCS diff
of the prompt itself replaces model-response diffing. A lint pass scores the
genome 0-100 (missing task, vague wording, brevity-vs-depth conflicts,
negative-only constraints, and more), genes can be edited, reclassified, and
reordered, a localStorage library keeps reusable genes with tags and search,
and share links carry the whole genome in the URL hash. Deployed on
**Netlify** (static site, no backend).

Live: [prompt-genome.netlify.app](https://prompt-genome.netlify.app).
See its [README](./prompt-genome/README.md).

### [`type-witness/`](./type-witness)

**Type Witness** implements idea #1 ("Type Witness") from the ideas day of
2026-08-02. Paste a TypeScript snippet and watch type inference unfold as an
ordered, narrated story: literal types and let/const widening, generic calls
showing the declared signature, the inferred binding (`T = string`), and the
resolved signature, unannotated callback parameters typed from context,
control-flow narrowing with declared-vs-here detail, inferred return types,
and compiler errors threaded in right after the step where inference went
astray. The real TypeScript compiler (pinned 5.6.3) runs in a Web Worker
against an in-memory file system with the full ES2022 lib closure bundled as
raw text, so analysis is exact, offline, and nothing leaves the browser. Hover
any expression for its type, click to jump to its step, autoplay the story, or
share a snippet via a URL-hash link. Deployed on **Netlify** (static site, no
backend).

Live: [type-witness.netlify.app](https://type-witness.netlify.app).
See its [README](./type-witness/README.md).

### [`game-palette-inspector/`](./game-palette-inspector)

**Game Palette Inspector** implements idea #1 from the ideas day of 2026-06-19.
Check a game palette against WCAG contrast and eight kinds of colour vision
deficiency, then get replacement colours that keep the art style: build a palette
by hand, load a preset, or drop a screenshot and have its eight dominant colours
extracted. The confusion report measures pairs perceptually in OKLab and names the
worst-case vision type; the fix studio repairs a failing colour by binary-searching
OKLCH lightness with hue pinned, and says so honestly when a contrast target is
unreachable. Simulation is Machado, Oliveira and Fernandes (2009) applied in linear
sRGB, verified against the colour-science reference data.

Moved here on 2026-08-27 from the standalone `pisanuw/c1` repo, with its history,
so every capstone project now lives in one place. The Netlify site id is pinned in
its `deploy/target.yml`, so the public URL did not change.

The one deviation from the house layout: this app predates it and is plain
JavaScript with `node --test`, not TypeScript with vitest, so it has no `lint`,
`typecheck`, or `coverage` script and its CI job runs install, test, and build
only. 11 tests, no backend, no runtime dependencies beyond React.
Live: [game-palette-inspector.netlify.app](https://game-palette-inspector.netlify.app).
See its [README](./game-palette-inspector/README.md).

### [`pathfinding-playground/`](./pathfinding-playground)

**Pathfinding Playground** implements idea #1 from the ideas day of 2026-07-26.
Draw a grid map, drop in walls and mud (mud costs 5 to enter), then watch A*,
Dijkstra, BFS, DFS, and greedy best-first think one expansion at a time, each
step narrated from the live algorithm state: which cell got picked, why, and what
its g, h, and f values were. The idea suggested Claude API calls for narration;
every line is instead a template filled with the numbers the algorithm just
computed, so it is free, offline, and cannot drift from what the search did. Each
algorithm is a generator emitting one uniform event trace that the canvas
renderer and the narrator both consume. Compare mode runs two algorithms side by
side, and the whole puzzle (map, start, goal, picks) run-length encodes into the
URL hash, so a class exercise is shareable as a plain link.

Moved here on 2026-08-27 from the standalone `pisanuw/pathfinding-playground`
repo, with its history. The Netlify site id is pinned in its `deploy/target.yml`,
so the public URL did not change.

Like `game-palette-inspector`, this app predates the TypeScript house style: it
is plain JavaScript, and while it does use vitest it has no `lint`, `typecheck`,
or `coverage` script, so its CI job runs install, test, and build only. 20 tests
covering optimality, path validity, maze solvability, and trace determinism.
Live: [pathfinding-playground-pisanuw.netlify.app](https://pathfinding-playground-pisanuw.netlify.app).
See its [README](./pathfinding-playground/README.md).
