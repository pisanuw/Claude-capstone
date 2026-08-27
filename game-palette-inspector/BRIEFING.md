# BRIEFING

## Purpose

Game Palette Inspector: a fully client-side web tool for game developers to audit a palette (or a screenshot) for color-vision-deficiency safety and WCAG contrast, and to repair failing colors without changing their hue. Implements idea `2026-06-19-1` from the Daily Project Ideas site (Weekend tier).

## Architecture

React 18 + Vite, no backend, no runtime dependencies beyond React. Static hosting only.

```
index.html                     fonts (Chakra Petch, IBM Plex Sans/Mono), meta
src/main.jsx                   entry
src/App.jsx                    state (useReducer), URL-hash sync, masthead, layout
src/styles.css                 all styling incl. print stylesheet
src/color/color.js             hex, sRGB linearization, WCAG luminance/contrast,
                               OKLab/OKLCH, gamut clamping, deltaE
src/color/cvd.js               Machado 2009 matrices (severity 0.6 and 1.0),
                               single-color and full-ImageData simulation with LUTs
src/color/extract.js           dominant-palette extraction from a screenshot
                               (downsample, 15-bit histogram, greedy OKLab dedupe)
src/color/analyze.js           suggestFix (OKLCH lightness binary search) and
                               findConfusions (per-type pairwise deltaE)
src/components/PaletteBench    chips, add, presets, drag-drop upload
src/components/VisionLab       contact sheet + 9-tile image simulation grid
src/components/ContrastMatrix  pairwise WCAG grid with target select
src/components/ConfusionPanel  flagged pairs with worst vision type
src/components/FixPanel        per-color and apply-all repairs
src/report/exportPng.js        canvas-rendered downloadable PNG report
tests/color.test.mjs           node --test suite (11 tests), no test framework
```

## Key decisions and rationale

1. **Zero runtime deps.** The idea's suggested `chroma-js`, `color-blind`, and `html2canvas` were all replaced by ~500 lines of hand-rolled, unit-tested math. Smaller bundle (56 kB gzip total), no supply-chain surface, and the code doubles as teaching material.
2. **Matrices verified, not remembered.** The Machado severity 0.6 and 1.0 matrices were verified byte-for-byte against the `colour-science` reference dataset before shipping. They are applied in linear sRGB (a common implementation mistake is applying them to gamma-encoded values).
3. **OKLab for perception, WCAG for compliance.** Contrast uses the legal/standards math; confusion detection uses perceptual distance, because contrast ratio says nothing about hue collapse.
4. **Honest impossibility.** `suggestFix` returns null when no lightness of the hue can reach the target (mathematically true for 7:1 against backgrounds with relative luminance near 0.179; the maximum achievable contrast against any color bottoms out at about 4.58:1 there). The UI explains this instead of silently failing.
5. **Fix by lightness only.** Hue and chroma are held (chroma gamut-clamped per lightness step), so applied fixes keep the art direction. This is the tool's differentiator versus generic contrast checkers.
6. **The interface dogfoods.** Neutral dark gray workspace so swatches read true, a protan/deutan-safe cyan accent, and every pass/fail state carries a glyph, never color alone.
7. **Shareable state.** Palette, background index, and target live in the URL hash (`#p=hex.hex...&bg=0&t=4.5`); `history.replaceState` avoids history spam. Images are not serialized.
8. **`base: './'` in Vite** so the same build works on Netlify root and GitHub Pages subpaths.

## Thresholds (tunable in `src/color/analyze.js`)

- `CONFUSABLE = 0.10` OKLab distance: below this a pair is flagged.
- `NEAR_IDENTICAL = 0.04`: below this the pair is tagged critical.
- Extraction dedupe distance `0.09`, sample canvas max edge 144 px, max 12 palette colors.

## Verification performed (2026-08-19 session)

- 11 unit tests pass (`npm test`): hex parsing, WCAG anchors (white/black = 21:1, red luminance 0.2126), OKLab round trips within 1/255, gamut clamp preserves hue, CVD matrices preserve white/gray, red-green collapse under deutan/protan, fix reaches target and keeps hue, AAA impossibility case, confusion flagging.
- Playwright (removed after use) verified in headless Chromium: rendering with zero console errors, preset switching, screenshot upload extracting all planted scene colors, apply-all leading to the all-pass empty state, PNG export downloading a valid 2400 px wide report, mobile 375 px layout, and the print stylesheet.

## Deployment

`netlify.toml` and `.github/workflows/deploy.yml` (Pages via Actions, runs tests before build) are included. No secrets required anywhere.

## Future ideas

- Per-pair fix suggestions in the Confusion report (currently fixes target the background only).
- Simulate the uploaded screenshot at full resolution with a worker for large images.
- Palette import from Aseprite `.gpl` / Lospec JSON.
- A "second channel" checklist generator (shape/icon suggestions) for flagged pairs.
