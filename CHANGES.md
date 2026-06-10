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
