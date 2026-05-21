# Changes

Append-only project journal. One line per entry: `YYYY-MM-DD [type] description`.
Types: decision, plan, doc, scope, code, note.

2026-05-21 decision Chose idea #2 "Code Blindfold" from ideas day 2026-05-12; implemented as "Accessibility Lens".
2026-05-21 decision Static-HTML fetch + jsdom instead of Playwright, for instant startup and serverless-friendly deploy.
2026-05-21 decision LLM is an optional enhancement behind AiProvider; app fully functional with no API key (HeuristicProvider).
2026-05-21 plan TypeScript monorepo (npm workspaces): server (engine + Express API) and client (React + Vite + Tailwind).
2026-05-21 code Built 11 deterministic WCAG rules, contrast math, and a screen-reader linearizer; all pure and unit-tested.
2026-05-21 code Added SSRF guard (assertSafeUrl) on the page fetcher; blocks loopback, link-local, metadata, private ranges.
2026-05-21 code React UI with four disability-profile simulations and per-issue fix cards; UI itself built to WCAG (focus rings, ARIA tabs, non-color cues).
2026-05-21 code 102 tests passing (server 88 at ~96% coverage, client 14 at ~96%); thresholds enforced in CI.
2026-05-21 doc Wrote README, ASSUMPTIONS, .env.example; added Dockerfile, render.yaml, and GitHub Actions CI.
