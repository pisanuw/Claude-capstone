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
self-call analysis for recursion) picks the concept; a curated corpus of 25
concepts x 3 domains x 4 audience variants (300 hand-written texts) replaces
the idea's suggested Claude API generation, and a localStorage library with tags, search, Markdown export,
and serverless read-only share links replaces Supabase; a 25-example menu
covers every concept. Deployed on **Netlify**
(static site, no backend).

Live: [code-analogy-forge.netlify.app](https://code-analogy-forge.netlify.app).
See its [README](./code-analogy-forge/README.md).
