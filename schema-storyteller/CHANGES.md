# Changes

Format: `YYYY-MM-DD [type] description` (max 200 chars). Types: decision, plan, doc, scope, code, note.

2026-08-20 [note] Initialized schema-storyteller from daily-project-ideas 2026-08-20 n1 (Weekend tier).
2026-08-20 [decision] Replaced the idea's suggested client-side Claude API calls with a deterministic parser + fixed rule set, so the narrative and review are free, offline, reproducible, and explainable.
2026-08-20 [code] Built three parsers (SQL DDL, Prisma, JSON Schema) normalizing into one IR; classification (join/lookup roles, cardinality), rule-based lint (9 rules), template narrator, and Markdown export.
2026-08-20 [code] Vanilla-TS + Vite SPA UI with format auto-detect, four samples, copy/download Markdown. 71 vitest tests, 88% branch coverage; typecheck + eslint clean.
