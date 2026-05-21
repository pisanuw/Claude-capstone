# Accessibility Lens

**See your page through four kinds of eyes.** Paste a public URL and Accessibility
Lens fetches the markup, runs a deterministic subset of WCAG 2.1 checks, and
replays the page the way users with **low vision**, **color blindness**,
**keyboard-only navigation**, and **screen readers** actually experience it, with a
concrete suggested fix for every issue.

Most accessibility checkers hand you a wall of WCAG codes. This one is built as a
teaching tool: it tries to make the failures *visceral*. The signature feature is a
screen-reader view that strips away all layout and shows the page as the linear
stream of roles and text a blind user hears.

> Built as a capstone from the `daily-project-ideas` prompt for 2026-05-12
> ("Code Blindfold"). See [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) for the full set of
> design decisions and known limitations.

## What it checks

Eleven high-signal rules, each mapped to the disability profiles it affects:

| Rule | WCAG | Affects |
| --- | --- | --- |
| Image missing alt text | 1.1.1 | screen reader, low vision |
| Page language not declared | 3.1.1 | screen reader |
| Missing or empty page title | 2.4.2 | screen reader |
| Form control without a label | 4.1.2 | screen reader, low vision |
| Broken heading structure | 1.3.1 | screen reader |
| Unclear or empty link text | 2.4.4 | screen reader |
| Button without an accessible name | 4.1.2 | screen reader, keyboard |
| Zoom disabled by viewport meta | 1.4.4 | low vision |
| Duplicate id attribute | 4.1.1 | screen reader |
| Positive tabindex disrupts focus order | 2.4.3 | keyboard |
| Low color contrast (inline styles) | 1.4.3 | low vision, color blindness |

The optional Claude integration rewrites the offending snippet into a corrected
one; without an API key the app still gives a solid rule-based fix for each issue.

## Architecture

A TypeScript monorepo using npm workspaces.

```
accessibility-lens/
  server/   Express API + the pure analysis engine
    src/engine/   rules, contrast math, screen-reader linearizer  (no I/O, fully tested)
    src/ai/       AiProvider interface, Anthropic + heuristic implementations
    src/api/      scan use case
    src/app.ts    Express app factory (serves the built client + /api)
  client/   React + Vite + Tailwind UI
    src/components/  scan form, score summary, profile tabs, simulations
```

Design principles at work: the engine is **pure and deterministic** (HTML in,
report out, no network or clock), I/O lives at the edges, the LLM sits behind an
interface so it is **optional and mockable**, and everything testable is tested.

## Run it locally

Requires Node 20+.

```bash
cd accessibility-lens
npm install

# Terminal 1: API on :3000
npm run dev:server

# Terminal 2: UI on :5173 (proxies /api to :3000)
npm run dev:client
```

Open http://localhost:5173.

To run the production single-service build (Express serves the built UI and the
API from one port):

```bash
npm run build
npm start            # serves on http://localhost:3000
```

## Configuration

All configuration is via environment variables, documented in
[`.env.example`](./.env.example). **The app runs fully with none of them set.** The
only meaningful one is `ANTHROPIC_API_KEY`, which upgrades the suggested fixes from
rule-based text to Claude-written code rewrites.

```bash
cp .env.example .env   # then edit if you want AI fixes
```

## Deploy to a public URL

It is a single Node service, so any host that runs Node works. Two ready paths:

- **Render**: this repo includes [`render.yaml`](./render.yaml). Create a new
  Blueprint pointing at the repo; Render builds and serves it. Add
  `ANTHROPIC_API_KEY` in the dashboard if you want AI fixes.
- **Docker** (Railway, Fly, Cloud Run, anything): the included
  [`Dockerfile`](./Dockerfile) is a multi-stage build that produces a slim
  production image.

  ```bash
  docker build -t accessibility-lens .
  docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-... accessibility-lens
  ```

Health check: `GET /api/health`.

## Quality gates

```bash
npm run lint        # ESLint, both workspaces
npm run typecheck   # tsc --noEmit, both workspaces
npm test            # Vitest, both workspaces
npm run coverage    # with coverage thresholds enforced
```

Current state: **102 tests passing**. Server coverage ~96% (threshold 85%), client
~96% (threshold 70%). A ready-to-use GitHub Actions workflow lives at
[`ci/github-actions-ci.yml`](./ci/github-actions-ci.yml); move it to
`.github/workflows/ci.yml` at the repo root to activate it (it runs lint,
typecheck, coverage, and build on every push).

## Limitations (the honest list)

This analyzes server-delivered HTML, not a rendered browser DOM, so it does not see
content injected by client-side JavaScript, and the contrast check only inspects
inline styles. It is a fast, deployable, deterministic *complement* to a real audit
and a manual screen-reader walkthrough, not a replacement. The full reasoning is in
[`ASSUMPTIONS.md`](./ASSUMPTIONS.md).

## License

MIT. See [`LICENSE`](./LICENSE).
