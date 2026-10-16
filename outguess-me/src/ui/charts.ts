/** Small hand-rolled SVG charts. Colours come from CSS custom properties. */

import { coinBand, rollingAccuracy, runningAccuracy, type RunHistogramRow } from '../core/stats';

const W = 640;
const H = 240;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

function x(i: number, n: number): number {
  return PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, n);
}
function y(v: number): number {
  return PAD.t + (H - PAD.t - PAD.b) * (1 - v);
}

function path(points: [number, number][]): string {
  return points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
}

/**
 * Running hit rate (and a 20-press rolling rate) against the band a
 * coin-flipping oracle would stay inside 95% of the time.
 */
export function accuracyChart(correct: readonly boolean[], target: number): string {
  const n = Math.max(target, correct.length, 1);
  const band: [number, number][] = [];
  const bandLow: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    const [lo, hi] = coinBand(i);
    band.push([x(i, n), y(hi)]);
    bandLow.push([x(i, n), y(lo)]);
  }
  const bandPath = path(band) + bandLow.reverse().map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join('') + 'Z';
  const run = runningAccuracy(correct).map((v, i): [number, number] => [x(i + 1, n), y(v)]);
  const roll = rollingAccuracy(correct, 20).map((v, i): [number, number] => [x(i + 1, n), y(v)]);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (v) =>
        `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
        `<text x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${v * 100}%</text>`,
    )
    .join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => Math.round(f * n))
    .map((i) => `<text x="${x(i, n)}" y="${H - 8}" text-anchor="middle" class="tick">${i}</text>`)
    .join('');
  const last = run[run.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Oracle hit rate over the game compared with a coin-flip band">
    ${grid}${ticks}
    <path d="${bandPath}" class="band"/>
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0.5)}" y2="${y(0.5)}" class="half"/>
    ${roll.length > 1 ? `<path d="${path(roll)}" class="roll"/>` : ''}
    ${run.length > 1 ? `<path d="${path(run)}" class="run"/>` : ''}
    ${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="4" class="run-dot"/>` : ''}
  </svg>`;
}

/** Observed run lengths beside what a fair coin would give for the same number of runs. */
export function runChart(rows: readonly RunHistogramRow[]): string {
  const w = 320;
  const h = 160;
  const pl = 28;
  const pb = 22;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.observed, r.expected)));
  const slot = (w - pl - 4) / rows.length;
  const bh = (v: number) => ((h - pb - 8) * v) / max;
  const bars = rows
    .map((r, i) => {
      const x0 = pl + i * slot;
      const label = i === rows.length - 1 ? `${r.length}+` : String(r.length);
      return (
        `<rect x="${(x0 + slot * 0.12).toFixed(1)}" y="${(h - pb - bh(r.observed)).toFixed(1)}" width="${(slot * 0.38).toFixed(1)}" height="${bh(r.observed).toFixed(1)}" class="obs"><title>${r.observed} runs of length ${label}</title></rect>` +
        `<rect x="${(x0 + slot * 0.5).toFixed(1)}" y="${(h - pb - bh(r.expected)).toFixed(1)}" width="${(slot * 0.38).toFixed(1)}" height="${bh(r.expected).toFixed(1)}" class="exp"><title>a coin would give about ${r.expected.toFixed(1)}</title></rect>` +
        `<text x="${(x0 + slot / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" class="tick">${label}</text>`
      );
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Run length histogram, yours against a fair coin">
    <line x1="${pl}" x2="${w - 4}" y1="${h - pb}" y2="${h - pb}" class="grid"/>
    <text x="${pl - 6}" y="16" text-anchor="end" class="tick">${max.toFixed(0)}</text>
    ${bars}
  </svg>`;
}
