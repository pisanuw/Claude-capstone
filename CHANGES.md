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
