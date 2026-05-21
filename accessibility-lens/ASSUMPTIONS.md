# Assumptions and decisions

This project was built autonomously from a one-line brief ("pick an idea from the
first ideas day and implement it well"). Many choices were left to me. This file
records the ones worth revisiting. It is meant to be argued with later.

## Which idea, and why

The first ideas day (`2026-05-12`) offered three options: Prompt Duel, Code
Blindfold, and Ethical Lens. I chose **Code Blindfold**, an accessibility report
tool, and named the implementation **Accessibility Lens**.

Reasoning: the brief demanded good test coverage, deployability to a public site,
and clean handling of secrets. Code Blindfold has a core (WCAG analysis and
screen-reader linearization) that is *pure and deterministic*, so it can be tested
exhaustively without mocking a world. The other two ideas are dominated by
real-time multiplayer sync or three concurrent LLM agents, where the interesting
behavior is inherently non-deterministic and hard to cover with fast unit tests.
The LLM here is an *enhancement*, not the product, which keeps the app useful and
testable with no API key.

## Scope decisions (what this does and does not do)

- **Static HTML only, no headless browser.** The original idea suggested
  Playwright. I fetch raw HTML over HTTP and parse it with jsdom instead. This is
  a deliberate trade: it deploys to any plain Node host (including serverless),
  starts instantly, and needs no system Chromium. The cost is real and documented
  below. Swapping in Playwright later is isolated to `engine/fetchPage.ts`.
  - Limitation: content rendered by client-side JavaScript (most SPAs) is not
    seen. The tool analyzes the server-delivered markup.
- **Contrast checking is best-effort, inline styles only.** Without a browser we
  cannot resolve the full CSS cascade, so the contrast rule only inspects colors
  set via inline `style` attributes and walks inline-style ancestors for the
  background, defaulting to white. It will miss contrast problems defined in
  stylesheets. This is stated in the UI and the rule's doc comment so results are
  never oversold.
- **Rule set is a curated subset of WCAG 2.1**, not a complete audit. Eleven
  high-value, unambiguous rules were chosen (alt text, labels, headings, link
  text, button names, language, title, viewport zoom, duplicate ids, positive
  tabindex, inline contrast). The architecture (one file per rule, registered in
  `rules/index.ts`) makes adding rules a one-file change.
- **The four "simulations" are educational, not clinical.** The color-blindness
  SVG matrices are the common Brettel/Machado approximations; the low-vision blur
  is illustrative. They exist to make the experience *visceral* for students, the
  stated point of the idea, not to certify conformance.

## Scoring model

A 0-100 score derived from per-issue penalties (minor 3, moderate 7, serious 12,
critical 20), clamped to 0. Per-profile scores apply the same penalties but only
count issues affecting that profile. The exact weights are a judgement call and
easy to tune in `engine/analyze.ts`. They are not a recognized WCAG metric.

## Architecture and tooling

- **TypeScript monorepo with npm workspaces** (`server`, `client`). No third
  package for shared types; the client mirrors the report type in
  `client/src/lib/types.ts` with a comment. For a project this size that is
  simpler than publishing a shared package, at the cost of keeping two type
  definitions in sync. Revisit if the API surface grows.
- **Single-service deployment.** In production the Express server serves the built
  React app as static files and the API under `/api`. One deploy unit, one URL, no
  CORS. The client also runs standalone in dev via Vite with a proxy to `:3000`.
- **AI provider behind an interface.** `AiProvider` has a real `AnthropicProvider`
  and a `HeuristicProvider` fallback. With no `ANTHROPIC_API_KEY` the app works
  fully and just uses the deterministic rule-based fixes. `enrichFix` never throws;
  a model failure degrades silently to the rule-based fix.
- **Model choice.** Defaults to `claude-sonnet-4-20250514`, overridable via
  `ANTHROPIC_MODEL`. Only the most severe N issues (default 5, `AI_ENRICH_LIMIT`)
  are sent to the model per scan to bound latency and cost.

## Security

- The server fetches arbitrary user-supplied URLs, a classic SSRF risk. The
  `assertSafeUrl` guard blocks non-HTTP(S) schemes, loopback, link-local, cloud
  metadata, and private IPv4 ranges. This is a pragmatic guard, not a complete
  defense (e.g. it does not resolve DNS to catch rebinding). A hardened
  deployment should also run the fetcher in a network-restricted egress sandbox.
- Request body is capped (64 kB) and fetched pages are capped (4 MB) with a 12 s
  timeout.

## Testing

- Server: Vitest + supertest. Coverage thresholds enforced (85% statements). The
  real Anthropic network call and the process entry point are excluded from
  thresholds and exercised only structurally.
- Client: Vitest + Testing Library + jsdom. The full scan flow, error state, and
  tab switching are tested with a mocked `fetch`.

## Things intentionally left out (candidates for later)

- Persisting and sharing reports (the idea mentioned a shareable link). Would add
  a datastore; deliberately skipped to keep the deploy stateless and free.
- Headless-browser rendering for SPA support.
- Authentication, rate limiting, and per-user API keys.
- A richer accessible-name computation (the current one is a pragmatic subset).
