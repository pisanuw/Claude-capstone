# CLAUDE.md

Instructions for AI sessions working in this repo.

## Logging

Before any work: append the user's verbatim instructions to `AI-log.md` with the
date. Redact any credentials. Update `CHANGES.md` with a dated entry when done.

## Commands

- `npm install`
- `npm test` (vitest, pure engine tests, no browser needed)
- `npm run dev` / `npm run build` (static bundle in `dist/`)

## Architecture

- `src/engine/` is framework-free and fully tested: grid model, min-heap, five
  algorithm generators emitting a uniform event trace, rule-based narration,
  URL share encoding, maze generation, playback state reconstruction.
- `src/ui/` is React: canvas renderer with pointer editing, log panel.
- `src/App.jsx` owns state and the playback loop.
- Canvas colors in `src/ui/palette.js` must stay in sync with the CSS tokens in
  `src/styles.css`.

## Invariants to preserve

- Same map in, identical trace out (deterministic neighbor order and
  tie-breaking). There is a test.
- Narration is computed from trace events only. No API calls anywhere.
- Renderer and narrator consume the same events; do not fork the data.

## Deploy

Netlify site `pathfinding-playground-pisanuw`, currently deployed by zipping
`dist/` to the Netlify deploy API. `netlify.toml` exists if the repo gets
linked for CI builds instead.

## Formatting

No em dashes in prose or docs: commas, colons, parentheses.
