# AI-log

Verbatim user instructions are logged here before work begins.

## 2026-08-19

> Choose one of the projects under Weekend at https://daily-project-ideas.netlify.app/ and implement it.
>
> I will provide the GitHub repo and I for later. Do not ask any questions.

Claude's choice: **Game Palette Inspector** (idea id `2026-06-19-1`, Side Project, Weekend tier).

Rationale for this pick: fully client-side (no API keys, zero runtime cost, free static hosting), well-defined verifiable math (WCAG contrast, Machado CVD matrices, OKLab), fills a real gap for game developers, and fits a single-session build at an employer-grade bar.

Work performed this session:

- Scaffolded Vite + React app (no runtime dependencies beyond React; all color math hand-rolled).
- Implemented color engine: hex parsing, sRGB linearization, WCAG relative luminance and contrast, OKLab/OKLCH conversions, gamut clamping.
- Implemented colorblindness simulation: Machado et al. (2009) matrices for 8 vision types (protanomaly/-opia, deuteranomaly/-opia, tritanomaly/-opia, achromatomaly, achromatopsia), applied in linear RGB, for both single colors and full images.
- Implemented palette extraction from uploaded screenshots (downsample + histogram quantization + perceptual de-duplication in OKLab).
- Implemented WCAG AA/AAA contrast matrix for all color pairs.
- Implemented CVD confusion detection (pairs that are distinct normally but collapse under a deficiency, measured by OKLab distance).
- Implemented one-click suggested replacement palette (OKLCH lightness search preserving hue) plus per-color apply.
- Implemented PNG report export (canvas-rendered) and print-to-PDF report stylesheet.
- Shareable palettes via URL hash.
- Unit tests via `node --test` for the color engine; production build verified.

## 2026-08-19 (publish)

Verbatim user instruction (credential redacted):

> https://github.com/pisanuw/c1
> github_pat_[REDACTED]
> Publish at the above url

Work: pushed project to pisanuw/c1 main, enabled GitHub Pages (Actions source), verified live deploy.

## 2026-08-19 (netlify)

Verbatim user instruction (credential redacted):

> Use nfp_[REDACTED] to put it on netlify

Work: created site game-palette-inspector.netlify.app via API, zip-deployed the production build, verified live. Repo not linked for auto-deploys (UI step; netlify.toml is ready for it).
