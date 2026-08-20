// Palette analysis: contrast repair suggestions and CVD confusion pairs.

import {
  contrastRatio,
  deltaEok,
  parseHex,
  rgbToOklch,
  oklchToRgb,
  toHex,
} from './color.js';
import { CVD_TYPES, simulateColor } from './cvd.js';

/**
 * Suggest a replacement for `fg` that reaches `target` contrast against `bg`
 * while keeping the original hue (and as much chroma as the gamut allows).
 * Strategy: hold OKLCH hue/chroma, move lightness away from the background in
 * whichever direction needs the smaller change. Returns null when no
 * lightness can reach the target in either direction (possible for AAA 7:1
 * against mid-tone backgrounds, where even pure black and white fall short).
 *
 * @returns {{hex:string, ratio:number, direction:'lighter'|'darker', deltaL:number} | null}
 */
export function suggestFix(fgHex, bgHex, target) {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  const { L, C, H } = rgbToOklch(fg);

  const ratioAt = (l) => {
    const { rgb } = oklchToRgb({ L: l, C, H });
    return { rgb, ratio: contrastRatio(rgb, bg) };
  };

  const search = (lo, hi, increasingTowardHi) => {
    // Find the L closest to the original that meets the target within [lo, hi],
    // where contrast is monotonic toward `hi`.
    if (ratioAt(hi).ratio < target) return null;
    let a = lo;
    let b = hi;
    for (let i = 0; i < 28; i++) {
      const mid = (a + b) / 2;
      if (ratioAt(mid).ratio >= target) b = mid;
      else a = mid;
    }
    const { rgb, ratio } = ratioAt(b);
    // Guard against floating point landing a hair under target.
    if (ratio < target) {
      const nudged = ratioAt(Math.min(Math.max(b + (increasingTowardHi ? 1e-4 : -1e-4), 0), 1));
      return { l: b, ...nudged };
    }
    return { l: b, rgb, ratio };
  };

  const current = ratioAt(L);
  if (current.ratio >= target) {
    return { hex: toHex(current.rgb), ratio: current.ratio, direction: 'none', deltaL: 0 };
  }

  const lighter = search(L, 1, true);
  const darker = search(L, 0, false); // monotonic toward 0 on the dark side
  const options = [];
  if (lighter) options.push({ ...lighter, direction: 'lighter', deltaL: Math.abs(lighter.l - L) });
  if (darker) options.push({ ...darker, direction: 'darker', deltaL: Math.abs(darker.l - L) });
  if (options.length === 0) return null;
  options.sort((a, b) => a.deltaL - b.deltaL);
  const best = options[0];
  return { hex: toHex(best.rgb), ratio: best.ratio, direction: best.direction, deltaL: best.deltaL };
}

// Thresholds on OKLab distance (black-white = 1.0).
// Below NEAR_IDENTICAL two game elements read as the same color at a glance;
// below CONFUSABLE they are separable only with effort or side by side.
export const NEAR_IDENTICAL = 0.04;
export const CONFUSABLE = 0.1;

/**
 * Find palette pairs that are clearly distinct with typical vision but
 * collapse under at least one deficiency.
 *
 * @param {string[]} hexes
 * @returns {Array<{i:number, j:number, base:number, worst:{typeId:string, label:string, d:number, a:string, b:string}, severity:'critical'|'warning'}>}
 */
export function findConfusions(hexes) {
  const rgbs = hexes.map(parseHex);
  const sims = {};
  for (const t of CVD_TYPES) {
    sims[t.id] = rgbs.map((rgb) => simulateColor(rgb, t.id));
  }
  const out = [];
  for (let i = 0; i < rgbs.length; i++) {
    for (let j = i + 1; j < rgbs.length; j++) {
      const base = deltaEok(rgbs[i], rgbs[j]);
      if (base < CONFUSABLE) continue; // already a problem for everyone; the matrix shows it
      let worst = null;
      for (const t of CVD_TYPES) {
        const d = deltaEok(sims[t.id][i], sims[t.id][j]);
        if (!worst || d < worst.d) {
          worst = {
            typeId: t.id,
            label: t.label,
            d,
            a: toHex(sims[t.id][i]),
            b: toHex(sims[t.id][j]),
          };
        }
      }
      if (worst.d < CONFUSABLE) {
        out.push({
          i,
          j,
          base,
          worst,
          severity: worst.d < NEAR_IDENTICAL ? 'critical' : 'warning',
        });
      }
    }
  }
  out.sort((a, b) => a.worst.d - b.worst.d);
  return out;
}
