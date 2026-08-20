# CHANGES

## 2026-08-19 v1.0.0

Initial implementation of Game Palette Inspector (Daily Project Ideas 2026-06-19-1, Weekend tier).

- Palette bench: hex/picker chips, background marker, three presets, screenshot upload with dominant-palette extraction (max 12 colors).
- Vision lab: palette contact sheet plus full-frame simulation through 8 CVD types (Machado 2009 matrices, verified against the colour-science dataset, applied in linear sRGB).
- Contrast: pairwise WCAG matrix with 3:1 / 4.5:1 / 7:1 target selector.
- Confusion report: OKLab-based detection of pairs that collapse under specific deficiencies, with severity tiers.
- Fix studio: hue-preserving OKLCH lightness repairs, per color and apply-all, with honest handling of mathematically impossible targets.
- Exports: canvas-rendered PNG report, print-to-PDF stylesheet, shareable URL hash.
- Engineering: zero runtime deps beyond React; 11-test node --test suite for the color engine; GitHub Pages workflow and netlify.toml; production build 56 kB gzipped.
