/**
 * A small SVG line chart with an x-axis that zooms (wheel, pinch buttons) and
 * pans (drag). Each series is a function sampled across the visible range, so
 * zooming in shows detail instead of stretched pixels.
 */
import { clear, h, s } from './dom';

export interface Series {
  name: string;
  /** CSS colour (a var() token). */
  color: string;
  /** Returns y, or null for a gap. */
  fn: (x: number) => number | null;
  dash?: string;
  /** Draw as a step function: sample densely and keep vertical jumps. */
  step?: boolean;
}

export interface Marker {
  x: number;
  label?: string;
}

export interface ChartOptions {
  xMin: number;
  xMax: number;
  /** Hard limits for panning and zooming. */
  xLimit: [number, number];
  minSpan: number;
  yLabel: string;
  xFormat: (x: number) => string;
  yFormat?: (y: number) => string;
  /** Fixed y range; otherwise fitted to the visible data. */
  yRange?: [number, number];
  height?: number;
  markers?: () => Marker[];
  band?: { from: number; to: number; label: string };
  onRange?: (min: number, max: number) => void;
}

const W = 760;

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

export interface ChartHandle {
  root: HTMLElement;
  redraw(): void;
  setRange(min: number, max: number): void;
  setSeries(series: Series[]): void;
}

export function lineChart(initial: Series[], opts: ChartOptions): ChartHandle {
  let series = initial;
  let xMin = opts.xMin;
  let xMax = opts.xMax;
  const H = opts.height ?? 320;
  const pad = { l: 56, r: 12, t: 12, b: 34 };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const legend = h('div', { class: 'legend' });
  const root = h('div', { class: 'chart-wrap' }, svg, legend);

  function clamp(): void {
    const [lo, hi] = opts.xLimit;
    let span = Math.max(opts.minSpan, Math.min(hi - lo, xMax - xMin));
    if (!Number.isFinite(span)) span = hi - lo;
    if (xMin < lo) xMin = lo;
    xMax = xMin + span;
    if (xMax > hi) {
      xMax = hi;
      xMin = hi - span;
    }
  }

  function draw(): void {
    clamp();
    clear(svg);
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const n = 600;
    const samples = series.map((sr) => {
      const pts: [number, number | null][] = [];
      for (let i = 0; i <= n; i++) {
        const x = xMin + ((xMax - xMin) * i) / n;
        pts.push([x, sr.fn(x)]);
      }
      return pts;
    });
    let [yMin, yMax] = opts.yRange ?? [Infinity, -Infinity];
    if (!opts.yRange) {
      for (const pts of samples) for (const [, y] of pts) if (y !== null) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
      if (!Number.isFinite(yMin)) { yMin = -1; yMax = 1; }
      if (opts.band) { yMin = Math.min(yMin, opts.band.from); yMax = Math.max(yMax, opts.band.to); }
      const padY = (yMax - yMin) * 0.08 || 1;
      yMin -= padY;
      yMax += padY;
    }
    const X = (x: number) => pad.l + ((x - xMin) / (xMax - xMin)) * pw;
    const Y = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * ph;
    svg.append(s('rect', { x: pad.l, y: pad.t, width: pw, height: ph, class: 'plot-bg' }));
    if (opts.band) {
      const y1 = Y(Math.min(yMax, opts.band.to));
      const y2 = Y(Math.max(yMin, opts.band.from));
      if (y2 > y1) svg.append(s('rect', { x: pad.l, y: y1, width: pw, height: y2 - y1, class: 'band' }, s('title', {}, opts.band.label)));
    }
    const yStep = niceStep(yMax - yMin, 6);
    const yFmt = opts.yFormat ?? ((v: number) => String(Number(v.toFixed(6))));
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
      svg.append(s('line', { x1: pad.l, x2: pad.l + pw, y1: Y(v), y2: Y(v), class: Math.abs(v) < yStep / 1e6 ? 'grid zero' : 'grid' }));
      svg.append(s('text', { x: pad.l - 6, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end' }, yFmt(Math.abs(v) < yStep / 1e6 ? 0 : v)));
    }
    const xStep = niceStep(xMax - xMin, 7);
    for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) {
      svg.append(s('line', { x1: X(v), x2: X(v), y1: pad.t, y2: pad.t + ph, class: 'grid' }));
      svg.append(s('text', { x: X(v), y: H - 12, class: 'tick', 'text-anchor': 'middle' }, opts.xFormat(v)));
    }
    svg.append(s('text', { x: 12, y: pad.t + ph / 2, class: 'axis-label', transform: `rotate(-90 12 ${pad.t + ph / 2})`, 'text-anchor': 'middle' }, opts.yLabel));
    for (const m of opts.markers?.() ?? []) {
      if (m.x < xMin || m.x > xMax) continue;
      svg.append(s('line', { x1: X(m.x), x2: X(m.x), y1: pad.t, y2: pad.t + ph, class: 'marker' }, s('title', {}, m.label ?? '')));
    }
    const clip = `clip-${Math.random().toString(36).slice(2)}`;
    svg.append(s('clipPath', { id: clip }, s('rect', { x: pad.l, y: pad.t, width: pw, height: ph })));
    series.forEach((sr, i) => {
      let d = '';
      let pen = false;
      let prevY: number | null = null;
      for (const [x, y] of samples[i]) {
        if (y === null) { pen = false; prevY = null; continue; }
        if (!pen) d += `M${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
        else if (sr.step && prevY !== null && y !== prevY) d += `H${X(x).toFixed(1)}V${Y(y).toFixed(1)}`;
        else d += `L${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
        pen = true;
        prevY = y;
      }
      svg.append(s('path', { d, class: 'line', stroke: sr.color, 'stroke-dasharray': sr.dash ?? '', 'clip-path': `url(#${clip})` }));
    });
    clear(legend);
    for (const sr of series) {
      legend.append(h('span', { class: 'legend-item' }, h('span', { class: 'swatch', style: `background:${sr.color}` }), sr.name));
    }
    svg.setAttribute('aria-label', `${opts.yLabel} from ${opts.xFormat(xMin)} to ${opts.xFormat(xMax)}`);
    opts.onRange?.(xMin, xMax);
  }

  function zoom(factor: number, anchor: number): void {
    xMin = anchor - (anchor - xMin) * factor;
    xMax = anchor + (xMax - anchor) * factor;
    draw();
  }

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const fx = ((ev.clientX - rect.left) / rect.width) * W;
    const anchor = xMin + ((fx - pad.l) / (W - pad.l - pad.r)) * (xMax - xMin);
    zoom(ev.deltaY > 0 ? 1.25 : 0.8, anchor);
  }, { passive: false });

  let drag: { x: number; min: number; max: number } | null = null;
  svg.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, min: xMin, max: xMax };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((ev.clientX - drag.x) / rect.width) * W;
    const shift = (dx / (W - pad.l - pad.r)) * (drag.max - drag.min);
    xMin = drag.min - shift;
    xMax = drag.max - shift;
    draw();
  });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  const zoomIn = h('button', { type: 'button', class: 'small', onclick: () => zoom(0.6, (xMin + xMax) / 2), 'aria-label': 'Zoom in' }, '+');
  const zoomOut = h('button', { type: 'button', class: 'small', onclick: () => zoom(1 / 0.6, (xMin + xMax) / 2), 'aria-label': 'Zoom out' }, '−');
  root.prepend(h('div', { class: 'chart-tools' }, zoomIn, zoomOut, h('small', {}, 'Scroll or use +/− to zoom, drag to pan.')));

  draw();
  return {
    root,
    redraw: draw,
    setRange(min: number, max: number) { xMin = min; xMax = max; draw(); },
    setSeries(next: Series[]) { series = next; draw(); },
  };
}
