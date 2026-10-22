// Node shape geometry: size from label, outline polygon for clipping edges,
// and the SVG markup for each Mermaid shape.

import type { NodeShape, Point } from './types';

const PAD_X = 14;
const PAD_Y = 9;
const MIN_W = 36;

export function nodeSize(shape: NodeShape | 'cluster', tw: number, th: number): { width: number; height: number } {
  const h0 = Math.max(th, 14) + 2 * PAD_Y;
  const w0 = Math.max(MIN_W, tw + 2 * PAD_X);
  switch (shape) {
    case 'stadium':
      return { width: Math.max(w0, tw + h0 + 4), height: h0 };
    case 'subroutine':
      return { width: w0 + 16, height: h0 };
    case 'cylinder':
      return { width: w0, height: h0 + 14 };
    case 'circle':
    case 'doublecircle': {
      const d = Math.max(h0 + 8, Math.ceil(Math.hypot(tw, th)) + 18) + (shape === 'doublecircle' ? 10 : 0);
      return { width: d, height: d };
    }
    case 'diamond': {
      const a = (tw + 10) / 2 + (th + 10);
      const b = (tw + 10) / 4 + (th + 10) / 2;
      return { width: Math.ceil(2 * a), height: Math.ceil(Math.max(2 * b, h0 + 10)) };
    }
    case 'hexagon':
      return { width: w0 + Math.ceil((2 * h0) / 3), height: h0 };
    case 'parallelogram':
    case 'parallelogram-alt':
    case 'trapezoid':
    case 'trapezoid-alt':
      return { width: w0 + Math.ceil(h0 * 0.8), height: h0 };
    case 'asymmetric':
      return { width: w0 + Math.ceil(h0 / 3), height: h0 };
    default:
      return { width: w0, height: h0 };
  }
}

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): Point[] {
  const out: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = from + ((to - from) * k) / steps;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Outline polygon relative to the node centre, clockwise in screen space. */
export function outline(shape: NodeShape | 'cluster', w: number, h: number): Point[] {
  const x = w / 2;
  const y = h / 2;
  switch (shape) {
    case 'circle':
    case 'doublecircle':
      return arc(0, 0, x, 0, Math.PI * 2, 32).slice(0, 32);
    case 'stadium': {
      const r = y;
      return [...arc(x - r, 0, r, -Math.PI / 2, Math.PI / 2, 8), ...arc(-x + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, 8)];
    }
    case 'diamond':
      return [
        { x: 0, y: -y },
        { x, y: 0 },
        { x: 0, y },
        { x: -x, y: 0 },
      ];
    case 'hexagon': {
      const i = h / 3;
      return [
        { x: -x + i, y: -y },
        { x: x - i, y: -y },
        { x, y: 0 },
        { x: x - i, y },
        { x: -x + i, y },
        { x: -x, y: 0 },
      ];
    }
    case 'parallelogram': {
      const i = h * 0.4;
      return [
        { x: -x + i, y: -y },
        { x, y: -y },
        { x: x - i, y },
        { x: -x, y },
      ];
    }
    case 'parallelogram-alt': {
      const i = h * 0.4;
      return [
        { x: -x, y: -y },
        { x: x - i, y: -y },
        { x, y },
        { x: -x + i, y },
      ];
    }
    case 'trapezoid': {
      const i = h * 0.4;
      return [
        { x: -x + i, y: -y },
        { x: x - i, y: -y },
        { x, y },
        { x: -x, y },
      ];
    }
    case 'trapezoid-alt': {
      const i = h * 0.4;
      return [
        { x: -x, y: -y },
        { x, y: -y },
        { x: x - i, y },
        { x: -x + i, y },
      ];
    }
    case 'asymmetric':
      return [
        { x: -x, y: -y },
        { x, y: -y },
        { x, y },
        { x: -x, y },
        { x: -x + h / 3, y: 0 },
      ];
    default:
      return [
        { x: -x, y: -y },
        { x, y: -y },
        { x, y },
        { x: -x, y },
      ];
  }
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Where the ray from the node centre towards `target` leaves the outline.
 * All shapes are star-shaped around their centre, so the nearest hit is the
 * border crossing. Returns the centre itself for a degenerate ray.
 */
export function clipToOutline(centre: Point, poly: Point[], target: Point): Point {
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { ...centre };
  let best = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = cross(dx, dy, ex, ey);
    if (Math.abs(den) < 1e-12) continue;
    // centre + t*d = centre + a + u*e
    const t = cross(a.x, a.y, ex, ey) / den;
    const u = cross(a.x, a.y, dx, dy) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
  }
  if (!Number.isFinite(best)) return { ...centre };
  return { x: centre.x + dx * best, y: centre.y + dy * best };
}

function pts(poly: Point[], cx: number, cy: number): string {
  return poly.map((p) => `${r(cx + p.x)},${r(cy + p.y)}`).join(' ');
}

export function r(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** SVG elements (no wrapper) drawing the shape centred at (cx, cy). */
export function shapeSvg(shape: NodeShape, cx: number, cy: number, w: number, h: number, attrs: string): string {
  const x = cx - w / 2;
  const y = cy - h / 2;
  switch (shape) {
    case 'rect':
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="2" ${attrs}/>`;
    case 'round':
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="9" ${attrs}/>`;
    case 'stadium':
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}" ${attrs}/>`;
    case 'subroutine':
      return (
        `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" ${attrs}/>` +
        `<path d="M${r(x + 8)},${r(y)}V${r(y + h)}M${r(x + w - 8)},${r(y)}V${r(y + h)}" ${attrs} fill="none"/>`
      );
    case 'cylinder': {
      const ry = 7;
      const rx = w / 2;
      return (
        `<path d="M${r(x)},${r(y + ry)}A${r(rx)},${ry} 0 0 1 ${r(x + w)},${r(y + ry)}V${r(y + h - ry)}` +
        `A${r(rx)},${ry} 0 0 1 ${r(x)},${r(y + h - ry)}Z" ${attrs}/>` +
        `<path d="M${r(x)},${r(y + ry)}A${r(rx)},${ry} 0 0 0 ${r(x + w)},${r(y + ry)}" ${attrs} fill="none"/>`
      );
    }
    case 'circle':
      return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(w / 2)}" ${attrs}/>`;
    case 'doublecircle':
      return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(w / 2)}" ${attrs}/><circle cx="${r(cx)}" cy="${r(cy)}" r="${r(w / 2 - 5)}" ${attrs}/>`;
    default:
      return `<polygon points="${pts(outline(shape, w, h), cx, cy)}" ${attrs}/>`;
  }
}
