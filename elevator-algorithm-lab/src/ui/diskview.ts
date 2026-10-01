import type { SimResult } from '../core/types';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

/**
 * The textbook disk-scheduling diagram: cylinders (floors) across, time
 * downward, one zigzag line per car (head). Requests appear as hollow marks
 * when they arrive and filled marks when served. Drawn up to tick `upTo`.
 */
export function renderDiskView(svg: SVGSVGElement, result: SimResult, upTo: number, width = 640): void {
  const { scenario, frames, events } = result;
  const totalT = Math.max(1, frames.length - 1);
  const padL = 36;
  const padR = 12;
  const padT = 30;
  const padB = 16;
  const plotW = width - padL - padR;
  const plotH = Math.max(200, Math.min(520, totalT * 0.9));
  const height = padT + plotH + padB;
  const x = (floor: number): number => padL + (floor / Math.max(1, scenario.floors - 1)) * plotW;
  const y = (t: number): number => padT + (t / totalT) * plotH;

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.replaceChildren();

  const unit = scenario.kind === 'disk' ? 'cylinder' : 'floor';
  svg.appendChild(svgEl('rect', { x: padL, y: padT, width: plotW, height: plotH, class: 'disk-plot' }));
  const xs = niceStep(scenario.floors - 1, 8);
  for (let f = 0; f <= scenario.floors - 1; f += xs) {
    svg.appendChild(svgEl('line', { x1: x(f), x2: x(f), y1: padT, y2: padT + plotH, class: 'grid-line' }));
    svg.appendChild(svgEl('text', { x: x(f), y: padT - 6, class: 'axis-label', 'text-anchor': 'middle' }, String(f)));
  }
  svg.appendChild(svgEl('text', { x: padL + plotW / 2, y: 10, class: 'axis-title', 'text-anchor': 'middle' }, `${unit} →`));
  const ts = niceStep(totalT, 6);
  for (let t = 0; t <= totalT; t += ts) {
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y(t), y2: y(t), class: 'grid-line' }));
    svg.appendChild(svgEl('text', { x: padL - 4, y: y(t) + 3.5, class: 'axis-label', 'text-anchor': 'end' }, String(t)));
  }
  svg.appendChild(svgEl('text', { x: 4, y: padT + plotH / 2, class: 'axis-title', transform: `rotate(-90 4 ${padT + plotH / 2})`, 'text-anchor': 'middle' }, 'time ↓'));

  // Requests: hollow when they appear, filled when served.
  for (const e of events) {
    if (e.t > upTo) break;
    if (e.type === 'request') {
      svg.appendChild(svgEl('circle', { cx: x(e.floor), cy: y(e.t), r: 2.5, class: 'req-open' }));
    } else if (e.type === 'board' || (e.type === 'alight' && scenario.kind !== 'disk')) {
      svg.appendChild(svgEl('circle', { cx: x(e.floor), cy: y(e.t), r: 2.5, class: e.type === 'board' ? 'req-board' : 'req-alight' }));
    }
  }

  // Head paths.
  for (let c = 0; c < scenario.cars; c++) {
    const pts: string[] = [];
    for (const f of frames) {
      if (f.t > upTo) break;
      pts.push(`${x(f.cars[c].floor).toFixed(1)},${y(f.t).toFixed(1)}`);
    }
    if (pts.length > 0) {
      svg.appendChild(svgEl('polyline', { points: pts.join(' '), class: `head-path car-${c % 4}` }));
    }
  }
  const cur = frames[Math.min(upTo, frames.length - 1)];
  if (cur) {
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y(cur.t), y2: y(cur.t), class: 'now-line' }));
    cur.cars.forEach((car, c) => {
      svg.appendChild(svgEl('circle', { cx: x(car.floor), cy: y(cur.t), r: 4, class: `head-now car-${c % 4}` }));
    });
  }
}
