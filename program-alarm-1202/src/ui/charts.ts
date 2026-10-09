import { TICK_SECONDS } from '../core/jobs';
import { initialLander } from '../core/descent';
import type { RunSummary, SimState } from '../core/sim';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function setup(canvas: HTMLCanvasElement, height: number): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, canvas.clientWidth);
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, height);
  return { ctx, w, h: height };
}

/** Altitude (left axis) and sink rate vs target (right axis) over mission time. */
export function drawDescent(canvas: HTMLCanvasElement, s: SimState): void {
  const { ctx, w, h } = setup(canvas, 240);
  const pad = { l: 44, r: 40, t: 10, b: 24 };
  const span = Math.max(120, Math.ceil((s.tick * TICK_SECONDS) / 20) * 20);
  const alt0 = initialLander().altitude;
  const maxSink = 35;
  const x = (tick: number) => pad.l + ((tick * TICK_SECONDS) / span) * (w - pad.l - pad.r);
  const yAlt = (a: number) => pad.t + (1 - a / alt0) * (h - pad.t - pad.b);
  const ySink = (v: number) => pad.t + (1 - Math.min(maxSink, v) / maxSink) * (h - pad.t - pad.b);

  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = cssVar('--muted');
  ctx.strokeStyle = cssVar('--grid');
  ctx.lineWidth = 1;
  for (let t = 0; t <= span; t += 20) {
    const px = x(t / TICK_SECONDS);
    ctx.beginPath();
    ctx.moveTo(px, pad.t);
    ctx.lineTo(px, h - pad.b);
    ctx.stroke();
    ctx.fillText(`${t}s`, px - 8, h - 8);
  }
  for (const a of [0, 500, 1000, 1500]) {
    ctx.fillText(`${a}m`, 4, yAlt(a) + 4);
  }
  for (const v of [0, 10, 20, 30]) {
    ctx.fillText(`${v}`, w - pad.r + 6, ySink(v) + 4);
  }

  ctx.fillStyle = cssVar('--gd');
  for (const g of s.guidanceTicks) ctx.fillRect(x(g) - 0.5, h - pad.b - 6, 1.5, 6);
  ctx.fillStyle = cssVar('--alarm');
  for (const a of s.alarmTicks) {
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x(a.tick) - 2, pad.t, 4, h - pad.t - pad.b);
    ctx.globalAlpha = 1;
    ctx.fillText(String(a.code), x(a.tick) + 3, pad.t + 10);
  }

  const line = (color: string, f: (i: number) => number, dash: number[] = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    s.history.forEach((_, i) => (i === 0 ? ctx.moveTo(x(i), f(i)) : ctx.lineTo(x(i), f(i))));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line(cssVar('--alt'), (i) => yAlt(s.history[i].altitude));
  line(cssVar('--tgt'), (i) => ySink(-s.history[i].target), [5, 4]);
  line(cssVar('--vel'), (i) => ySink(Math.max(0, -s.history[i].velocity)));
}

/** One row per scheduler: guidance-update ticks, alarm marks and the end marker. */
export function drawTimelines(canvas: HTMLCanvasElement, runs: RunSummary[], names: string[]): void {
  const rowH = 44;
  const { ctx, w, h } = setup(canvas, runs.length * rowH + 26);
  const padL = 8;
  const maxTick = Math.max(...runs.map((r) => r.outcome.tick), 1);
  const span = Math.ceil((maxTick * TICK_SECONDS) / 20) * 20;
  const x = (tick: number) => padL + ((tick * TICK_SECONDS) / span) * (w - padL * 2);
  ctx.font = '11px system-ui, sans-serif';
  runs.forEach((r, row) => {
    const y0 = row * rowH;
    ctx.fillStyle = cssVar('--fg');
    ctx.fillText(names[row] ?? r.scheduler, padL, y0 + 13);
    ctx.fillStyle = cssVar('--grid');
    ctx.fillRect(padL, y0 + 30, x(r.outcome.tick) - padL, 1);
    ctx.fillStyle = cssVar('--gd');
    for (const g of r.guidanceTicks) ctx.fillRect(x(g) - 0.5, y0 + 20, 1.5, 12);
    ctx.fillStyle = cssVar('--alarm');
    for (const a of r.alarmTicks) ctx.fillRect(x(a.tick) - 1.5, y0 + 17, 3, 18);
    ctx.fillStyle = r.outcome.kind === 'landed' ? cssVar('--good') : cssVar('--bad');
    ctx.beginPath();
    ctx.arc(x(r.outcome.tick), y0 + 26, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = cssVar('--muted');
  for (let t = 0; t <= span; t += 20) ctx.fillText(`${t}s`, Math.min(w - 24, x(t / TICK_SECONDS)), h - 6);
}
