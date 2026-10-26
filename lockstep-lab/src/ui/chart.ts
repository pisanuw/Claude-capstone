export interface Series {
  label: string;
  color: string;
  points: Array<[number, number]>;
  dashed?: boolean;
}

export interface ChartOptions {
  xLabel: string;
  yLabel: string;
  yMax?: number;
  bars?: boolean;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function color(name: string): string {
  return css(name);
}

/** Sizes a canvas for the device pixel ratio and returns a context in CSS pixels. */
export function prepare(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 150;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function drawChart(canvas: HTMLCanvasElement, series: Series[], opts: ChartOptions): void {
  const { ctx, w, h } = prepare(canvas);
  const pad = { l: 46, r: 10, t: 10, b: 34 };
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const x0 = xs.length ? Math.min(...xs) : 0;
  const x1 = xs.length ? Math.max(...xs) : 1;
  const yMax = opts.yMax ?? niceMax(Math.max(0, ...ys) * 1.05);
  const px = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const py = (y: number) => h - pad.b - (y / yMax) * (h - pad.t - pad.b);
  const fg = css('--muted');
  ctx.font = '11px system-ui, sans-serif';
  ctx.strokeStyle = css('--border');
  ctx.fillStyle = fg;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (yMax * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, py(y));
    ctx.lineTo(w - pad.r, py(y));
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(y * 100) / 100), pad.l - 6, py(y));
  }
  const xticks = [...new Set(xs)].sort((a, b) => a - b);
  const step = Math.max(1, Math.ceil(xticks.length / 10));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  xticks.forEach((x, i) => {
    if (i % step === 0) ctx.fillText(String(x), px(x), h - pad.b + 4);
  });
  ctx.fillText(opts.xLabel, (pad.l + w - pad.r) / 2, h - 14);
  ctx.save();
  ctx.translate(11, (pad.t + h - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(opts.yLabel, 0, -6);
  ctx.restore();

  const n = series.length;
  series.forEach((s, si) => {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    if (opts.bars) {
      const slot = (w - pad.l - pad.r) / Math.max(1, xticks.length);
      const bw = Math.max(1, (slot * 0.8) / n);
      for (const [x, y] of s.points) {
        const left = px(x) - (slot * 0.8) / 2 + si * bw;
        ctx.fillRect(left, py(y), bw - 1, h - pad.b - py(y));
      }
      return;
    }
    ctx.lineWidth = 2;
    ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of s.points) {
      ctx.beginPath();
      ctx.arc(px(x), py(y), 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}
