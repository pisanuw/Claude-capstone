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
Resend. `mult-streak` deploys to **Render** (where the idle email is reliable);
`mult-streak-edge` is the same game on **Netlify** (game works fully; email is
Render-only, by the nature of serverless). Both built from the config-driven
deploy pipeline.

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
