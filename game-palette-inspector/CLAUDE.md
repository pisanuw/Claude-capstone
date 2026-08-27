# CLAUDE.md

Instructions for AI sessions working in this repository.

1. Before any work begins, append the user's verbatim instructions to `AI-log.md` with a date heading, then a short summary of work performed when done.
2. Update `CHANGES.md` with a dated entry for every substantive change.
3. Run `npm test` and `npm run build` before committing or pushing. Both must pass.
4. Formatting: no em dashes in prose, UI copy, or generated output; use commas, colons, or parentheses. (Does not apply to code identifiers or quoted material.)
5. Keep the project dependency-free at runtime beyond React. Color math changes require accompanying tests in `tests/`.
6. The Machado CVD matrices in `src/color/cvd.js` are verified constants; do not edit them without re-verifying against the colour-science reference dataset.
7. If any credentials (PATs, deploy tokens) are used in a session, flag them for rotation at the end of the session.
8. Read `BRIEFING.md` for architecture and decision rationale before making structural changes.
