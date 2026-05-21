# Claude-capstone

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
Tailwind on the client), 102 tests, deployable as a single Node service. See its
[README](./accessibility-lens/README.md) and
[ASSUMPTIONS](./accessibility-lens/ASSUMPTIONS.md).

### [`mult-streak/`](./mult-streak) and [`mult-streak-edge/`](./mult-streak-edge)

A multiplication-streak game: solve two 2-3 digit factors, ten correct in a row
wins a 24-hour crown, a wrong answer resets the streak. Anonymous cookie identity,
game state in a signed cookie, and a "player stopped" email to the admin via
Resend. `mult-streak` deploys to **Render** (where the idle email is reliable);
`mult-streak-edge` is the same game on **Netlify** (game works fully; email is
Render-only, by the nature of serverless). Both built from the config-driven
deploy pipeline.
