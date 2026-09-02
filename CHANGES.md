# Changes

Format: `YYYY-MM-DD [type] description` (max 200 chars). Types: decision, plan, doc, scope, code, note.

2026-06-10 [note] Initialized. Two projects shipped: accessibility-lens (WCAG analyzer) and mult-streak/mult-streak-edge (multiplication game on Render + Netlify).
2026-06-10 [code] security(F1): mult-streak + mult-streak-edge config.ts now throws at boot when COOKIE_SECRET missing in production; insecure fallback restricted to non-production only.
2026-06-10 [code] security(F3): accessibility-lens fetchPage.ts: replace redirect:follow with manual hop-by-hop redirect following; each Location URL re-validated by assertSafeUrl; added 100.64.0.0/10 block.
2026-06-10 [code] test: added config.test.ts for mult-streak + mult-streak-edge; 6 redirect/CGN-range tests added to accessibility-lens fetchPage.test.ts; all test suites green.
2026-06-10 [code] ci: rewrote ci.yml - removed stale "move this file" comment, added jobs for mult-streak and mult-streak-edge (were uncovered), no path filters.
2026-06-10 [code] ci: added eslint + typescript-eslint + globals to mult-streak and mult-streak-edge devDeps; created eslint.config.js for each; removed stale eslint-disable in store.ts.
2026-06-10 [doc] ci: added CI badge to README.md.
2026-06-10 [decision] history: adopt Conventional Commits going forward; commit-msg hook added in .git-hooks/commit-msg; git core.hooksPath set.
2026-06-10 [doc] readme: fixed test counts (102→107 accessibility-lens, 34→42 mult-streak/edge); removed stale "activate CI" note; added live URL for accessibility-lens.
2026-06-10 [doc] metadata: added root LICENSE (MIT); set GitHub repo description and 8 topics; created CLAUDE.md with commit convention and project overview.

2026-06-10 [code] security: hardened assertSafeUrl to block IPv6 ULA/link-local (fc00::/7, fe80::/10), IPv4-mapped IPv6 (::ffff:*), and decimal IPv4 encodings; fixed pre-existing [::1] bypass (Node.js URL parser keeps brackets); added 5 new tests.
2026-06-10 [code] security: added schema version field (v:1) to GameState in mult-streak and mult-streak-edge; decodeState rejects cookies where v !== 1, degrading old cookies gracefully; added 3 version tests per package.

2026-06-12 [feat] mult-streak + mult-streak-edge: added factoring mode (factor composites 1000-1000000 into prime factorization). Mode selector shown at streak=0; cookie schema bumped to v:2. 77 tests each, 97.87% coverage.

2026-08-20 [code] schema-storyteller: pinned netlify siteId + accountSlug in deploy/target.yml so deploy skips the create-site fallback once NETLIFY_AUTH_TOKEN is rotated.

2026-08-20 [code] migration-diff-narrator: new package (idea 2026-08-17 n1). Rule-based schema diff for SQL DDL + TS interfaces, 74 vitest tests, 97% stmt coverage; deterministic severity rules replace the suggested Claude API calls.

2026-08-20 [code] shortcut-sprint: new package (idea 2026-08-13 n1). SM-2 shortcut trainer for VS Code/DevTools/Figma/Vim + custom JSON sets, 78 vitest tests, 98.6% stmt coverage; localStorage replaces the suggested Supabase backend.

2026-08-20 [code] ci: deploy workflow now deploys only the target.ymls changed in the push; full redeploy on manual dispatch, runner/workflow changes, or uncomputable diffs.
2026-08-20 [code] ci: shortcut-sprint source changes now select its deployment target so bundled shortcut updates reach Netlify.

2026-08-21 [code] ui-diff-lens: new package (idea 2026-08-16 n1). Classified screenshot diff: YIQ pixel diff + AA detection, clustering, 7-type heuristic classifier; 56 vitest tests, 96.4% stmt coverage.
2026-08-21 [decision] ui-diff-lens: replaced the idea's Claude Vision classification with deterministic heuristics (displacement search, opacity fit, edge correlation); free, offline, private.

2026-08-21 [code] code-review-gauntlet: new package (idea 2026-08-11 n1). Timed bug-spotting game: seeded mutation engine, 11 templates/51 defects, daily challenge, skill radar; 46 vitest tests, 99.8% stmt coverage.
2026-08-21 [decision] code-review-gauntlet: replaced the idea's Claude puzzle generation with a seeded single-line mutation engine and the Supabase leaderboard with a date-seeded daily + localStorage profile.

2026-08-21 [code] sound-sketchpad: new package (idea 2026-08-09 n1). Text-to-sound-effect synthesizer: word-to-DSP lexicon (20 bases, 18 modifiers), pure sample renderer, WAV export; 59 vitest tests, 100% stmt coverage.
2026-08-21 [decision] sound-sketchpad: replaced the idea's Claude API code generation with a deterministic keyword lexicon + seeded DSP engine; same words always yield the same sound, free and offline.

2026-08-21 [code] sql-replay: new package (idea 2026-07-30 n1). Step-by-step SQL SELECT replay: tokenizer/parser/3VL evaluator/staged executor emitting a narrated Step trace; 86 vitest tests, 99.7% stmt coverage.
2026-08-21 [decision] sql-replay: replaced the idea's optional Claude narrator with deterministic per-stage narration generated from execution stats, and Framer Motion with CSS animations; zero runtime deps.

2026-08-23 [code] har-detective: new package (idea 2026-08-21 n1). Client-side HAR analyzer: forgiving parser, 10 deterministic detectors, SVG waterfall, Markdown report; 56 vitest tests, 100% stmt coverage.
2026-08-23 [decision] har-detective: replaced the idea's Claude API analysis with hand-written rule detectors (N+1, caching, compression, redirects, serialized calls, duplicates, errors, TTFB, payload size, HTTP/1.x churn); the HAR never leaves the browser.

2026-08-25 [code] code-analogy-forge: new package (idea 2026-08-25 n1). Audience-calibrated CS analogies: 14 concepts x 3 domains x 4 audiences (168 hand-written texts), keyword + code-shape detector with body-scoped self-call analysis, localStorage library, serverless share links, Markdown export; 61 vitest tests, 99.8% stmt coverage.
2026-08-25 [decision] code-analogy-forge: replaced the idea's Claude API generation with a curated deterministic corpus and Supabase with localStorage + hash-encoded read-only share links; free, offline, reproducible, honest "not detected" outside its 14 concepts.
2026-08-25 [code] code-analogy-forge: fixed audience toggle highlight not moving on click (aria-pressed was set only at creation); verified in headless Chromium, redeployed.
2026-08-25 [code] code-analogy-forge: example button replaced by a 10-example menu (one per concept family, test-pinned to rank its intended concept first); 'function' keyword no longer fires on JS syntax; 74 vitest tests.
2026-08-25 [code] ci: code-analogy-forge source changes now select its deployment target, same as shortcut-sprint.

2026-08-25 [code] code-analogy-forge: corpus grown 14 -> 25 concepts (closures, pointers/references, exceptions, caching, threads/parallelism, Big-O, git, APIs, encryption, binary numbers, graphs): 132 new analogy texts, detector rules for each, examples menu now one per concept (25); 97 vitest tests, 99.9% stmt coverage.

2026-08-26 [code] code-analogy-forge: corpus grown 25 -> 47 concepts (linked lists, sets, heaps, hashing, state machines, boolean logic, scope, abstraction, regex, floating point, compilers, databases, HTTP, DNS, packets, events, debugging, testing, refactoring, GC, randomness, operating systems): 264 new texts, detector rules and a pinned example per concept, menus grouped into ten optgroups; 125 vitest tests, 99.9% stmt coverage.

2026-08-27 [scope] game-palette-inspector: moved in from standalone pisanuw/c1 via git subtree (history preserved). Netlify siteId pinned to the existing site, so the public URL is unchanged.
2026-08-27 [code] ci: added game-palette-inspector job (install/test/build only; app is plain JS with node --test, so no lint/typecheck/coverage scripts exist).
2026-08-27 [scope] pathfinding-playground: moved in from standalone pisanuw/pathfinding-playground via git subtree (history preserved). Netlify siteId pinned to the existing site, so the public URL is unchanged.
2026-08-27 [code] ci: added pathfinding-playground job (install/test/build only; plain JS with vitest, no lint/typecheck/coverage scripts).

2026-08-28 [code] type-witness: new package (idea 2026-08-02 n1). In-browser TypeScript inference visualizer: real compiler (pinned 5.6.3) in a Web Worker over an in-memory FS with the 57-file ES2022 lib closure bundled raw; post-order AST walk emits narrated steps (literals, widening, generic bindings via guarded internal signature.target/mapper, contextual params, narrowing, return inference) with diagnostics threaded in after the offending step; hover-type witness view, autoplay, major-step filter, URL-hash share links. 62 vitest tests, 97.6% stmt coverage.
2026-08-28 [decision] type-witness: the idea had no LLM to replace; kept it fully client-side by bundling the compiler + libs (~1 MB gzipped worker chunk, the one real cost) instead of any server. React swapped for the monorepo's vanilla TS + Vite house pattern.

2026-09-02 [code] cron-cartographer: new package (idea 2026-09-02 n1). Cron/RRULE/GitHub-Actions/plain-English schedule visualizer: calendar heatmap of every firing over 30/90/365 days, dual time-zone pickers backed by exact Intl offset-transition tables (DST gaps reported as skipped, fall-back ambiguity fires once at the earlier instant), plain-English descriptions, next-25 table, query-param share links. 74 vitest tests, 92% stmt coverage.
2026-09-02 [decision] cron-cartographer: replaced the idea's Claude API NL-to-cron with a deterministic rule set that annotates every assumption and returns null honestly, and replaced cronstrue/cron-parser with a hand-written engine; zero runtime dependencies.
