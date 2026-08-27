// Core color math. No dependencies.
// rgb objects are { r, g, b } with 0-255 integers.
// linear triples are [R, G, B] with 0-1 floats in linear-light sRGB.

/** Parse '#abc', 'abc', '#aabbcc', 'aabbcc'. Returns {r,g,b} or null. */
export function parseHex(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }) {
  const h = (v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** sRGB electro-optical transfer: 0-1 encoded -> 0-1 linear. */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 0-1 linear -> 0-1 encoded sRGB. */
export function linearToSrgb(c) {
  c = clamp01(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToLinear({ r, g, b }) {
  return [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
}

export function linearToRgb([R, G, B]) {
  return {
    r: Math.round(linearToSrgb(R) * 255),
    g: Math.round(linearToSrgb(G) * 255),
    b: Math.round(linearToSrgb(B) * 255),
  };
}

/** WCAG 2.x relative luminance (0 black - 1 white). */
export function relativeLuminance(rgb) {
  const [R, G, B] = rgbToLinear(rgb);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG 2.x contrast ratio, 1-21. Order of arguments does not matter. */
export function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_TARGETS = {
  aaNormal: 4.5,
  aaLarge: 3.0,
  aaaNormal: 7.0,
  aaaLarge: 4.5,
};

export function wcagLevels(ratio) {
  return {
    aaNormal: ratio >= WCAG_TARGETS.aaNormal,
    aaLarge: ratio >= WCAG_TARGETS.aaLarge,
    aaaNormal: ratio >= WCAG_TARGETS.aaaNormal,
    aaaLarge: ratio >= WCAG_TARGETS.aaaLarge,
  };
}

// ---------------------------------------------------------------------------
// OKLab / OKLCH (Bjorn Ottosson, 2020). Used for perceptual distance and for
// adjusting lightness while preserving hue when suggesting replacements.
// ---------------------------------------------------------------------------

export function linearToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToLinear({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function rgbToOklab(rgb) {
  return linearToOklab(rgbToLinear(rgb));
}

export function rgbToOklch(rgb) {
  const { L, a, b } = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

function oklchToLinear({ L, C, H }) {
  const rad = (H * Math.PI) / 180;
  return oklabToLinear({ L, a: C * Math.cos(rad), b: C * Math.sin(rad) });
}

function inGamut(lin) {
  const eps = 1e-6;
  return lin.every((c) => c >= -eps && c <= 1 + eps);
}

/**
 * OKLCH -> sRGB. If the requested chroma is out of gamut at this lightness,
 * chroma is reduced (binary search) until the color fits, preserving hue.
 */
export function oklchToRgb({ L, C, H }) {
  L = clamp01(L);
  let lin = oklchToLinear({ L, C, H });
  if (inGamut(lin)) return { rgb: linearToRgb(lin), clipped: false };
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    lin = oklchToLinear({ L, C: mid, H });
    if (inGamut(lin)) lo = mid;
    else hi = mid;
  }
  lin = oklchToLinear({ L, C: lo, H });
  return { rgb: linearToRgb(lin.map(clamp01)), clipped: true };
}

/**
 * Perceptual distance in OKLab (Euclidean). Scale: black vs white = 1.0.
 * Differences below ~0.02 are near the just-noticeable threshold for
 * side-by-side swatches; game elements seen at a glance need much more.
 */
export function deltaEok(rgb1, rgb2) {
  const c1 = rgbToOklab(rgb1);
  const c2 = rgbToOklab(rgb2);
  return Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b);
}

/** Readable text color (black or white) for a given background swatch. */
export function readableOn(rgb) {
  return contrastRatio(rgb, { r: 0, g: 0, b: 0 }) >=
    contrastRatio(rgb, { r: 255, g: 255, b: 255 })
    ? '#000000'
    : '#ffffff';
}
