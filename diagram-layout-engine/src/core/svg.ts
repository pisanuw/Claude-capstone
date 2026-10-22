// Layout -> standalone SVG. Colours come from CSS custom properties (see
// themes.ts) so the same markup renders in any theme; per-node classDef and
// style values are applied inline on top.

import { r, shapeSvg } from './shapes';
import { themeCss } from './themes';
import type { ArrowHead, Layout, StyleMap } from './types';

export type DiffStatus = 'added' | 'removed' | 'changed' | 'same';
export type DiffView = 'before' | 'after' | 'overlay';

export interface SvgOptions {
  theme: string;
  /** Prefix for marker ids so several SVGs can live in one page. */
  idPrefix: string;
  classDefs: Map<string, StyleMap>;
  /** Diff colouring by node / edge / cluster id. */
  diff?: { status: Map<string, DiffStatus>; view: DiffView; labels?: Map<string, string[]> };
  title?: string;
  /** Draw rank/order hints (debug overlay). */
  debug?: boolean;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SHAPE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity'];
const TEXT_PROPS = ['color', 'font-weight', 'font-style', 'font-size'];

function css(style: StyleMap, props: string[]): string {
  const out: string[] = [];
  for (const p of props) {
    if (style[p] === undefined) continue;
    out.push(`${p === 'color' ? 'fill' : p}:${style[p]}`);
  }
  return out.length ? ` style="${esc(out.join(';'))}"` : '';
}

/** Relative luminance of a #rgb, #rrggbb or rgb() colour, or null for anything else. */
export function luminance(color: string): number | null {
  let rgb: number[] | null = null;
  const c = color.trim();
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    rgb = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  } else if ((m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i))) {
    rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (!rgb) return null;
  const [r0, g0, b0] = rgb.map((v) => {
    const x = Math.min(255, v) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
}

/** A custom fill without a text colour gets dark or light text so it stays readable in any theme. */
function withTextColor(style: StyleMap): StyleMap {
  if (!style.fill || style.color) return style;
  const l = luminance(style.fill);
  if (l === null) return style;
  return { ...style, color: l > 0.4 ? '#1b1f2e' : '#f8fafc' };
}

function merged(classes: string[], style: StyleMap, defs: Map<string, StyleMap>): StyleMap {
  const out: StyleMap = { ...(defs.get('default') ?? {}) };
  for (const c of classes) Object.assign(out, defs.get(c) ?? {});
  return withTextColor(Object.assign(out, style));
}

function textLines(lines: string[], cx: number, cy: number, lh: number, cls: string, style: string, anchor = 'middle'): string {
  if (!lines.length) return '';
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  const spans = lines.map((l, k) => `<tspan x="${r(cx)}" y="${r(y0 + k * lh)}">${esc(l)}</tspan>`).join('');
  return `<text class="${cls}" text-anchor="${anchor}" dominant-baseline="central"${style}>${spans}</text>`;
}

function markerDef(id: string, kind: ArrowHead, color: string): string {
  const fill = `fill:${color};stroke:${color}`;
  switch (kind) {
    case 'arrow':
      return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="${fill};stroke-width:1"/></marker>`;
    case 'circle':
      return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><circle cx="5" cy="5" r="4" style="${fill};stroke-width:1"/></marker>`;
    default:
      return `<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1,1L9,9M9,1L1,9" style="fill:none;stroke:${color};stroke-width:2"/></marker>`;
  }
}

export function renderSvg(layout: Layout, opts: SvgOptions): string {
  const P = opts.idPrefix;
  const markers = new Map<string, string>();
  const marker = (kind: ArrowHead, color: string): string => {
    const key = `${kind}|${color}`;
    if (!markers.has(key)) markers.set(key, markerDef(`${P}m${markers.size}`, kind, color));
    return `${P}m${[...markers.keys()].indexOf(key)}`;
  };
  const status = (id: string): DiffStatus => opts.diff?.status.get(id) ?? 'same';
  /** Element hidden as a ghost in this diff view. */
  const ghost = (id: string): boolean => {
    const s = status(id);
    return (opts.diff?.view === 'before' && s === 'added') || (opts.diff?.view === 'after' && s === 'removed');
  };
  const diffClass = (id: string): string => {
    if (!opts.diff) return '';
    if (ghost(id)) return ' dle-ghost';
    const s = status(id);
    return s === 'same' ? '' : ` dle-${s}`;
  };

  const parts: string[] = [];
  for (const c of layout.clusters) {
    const st = merged(c.classes, c.style, opts.classDefs);
    const title = c.title.split('\n').filter(Boolean);
    parts.push(
      `<g class="dle-cluster${diffClass(c.id)}" data-id="${esc(c.id)}"><rect x="${r(c.x)}" y="${r(c.y)}" width="${r(c.width)}" height="${r(c.height)}" rx="6"${css(st, SHAPE_PROPS)}/>` +
        `${textLines(title, c.titleAnchor === 'start' ? c.x + 10 : c.titleAnchor === 'end' ? c.x + c.width - 10 : c.x + c.width / 2, c.y + 14 + ((title.length - 1) * 18) / 2, 18, 'dle-cluster-title', css(st, TEXT_PROPS), c.titleAnchor)}</g>`,
    );
  }
  const clusterSvg = parts.join('');

  const edgeParts: string[] = [];
  const labelParts: string[] = [];
  layout.edges.forEach((e) => {
    if (e.line === 'invisible') return;
    const st = e.style;
    const s = status(e.id);
    const color = opts.diff && !ghost(e.id) && s !== 'same' ? `var(--dle-${s})` : (st.stroke ?? 'var(--dle-edge)');
    const ends =
      (e.head !== 'none' ? ` marker-end="url(#${marker(e.head, color)})"` : '') +
      (e.tail !== 'none' ? ` marker-start="url(#${marker(e.tail, color)})"` : '');
    const inline: string[] = [];
    if (st.stroke) inline.push(`stroke:${st.stroke}`);
    if (st['stroke-width']) inline.push(`stroke-width:${st['stroke-width']}`);
    if (st['stroke-dasharray']) inline.push(`stroke-dasharray:${st['stroke-dasharray']}`);
    if (st.opacity) inline.push(`opacity:${st.opacity}`);
    const styleAttr = inline.length ? ` style="${esc(inline.join(';'))}"` : '';
    edgeParts.push(
      `<g class="dle-edge dle-${e.line}${diffClass(e.id)}" data-id="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}">` +
        `<path class="dle-hit" d="${e.path}"/><path class="dle-edge-path" d="${e.path}"${ends}${styleAttr}/></g>`,
    );
    if (e.labelPos && e.lines.length) {
      const lines = opts.diff?.labels?.get(e.id) ?? e.lines;
      labelParts.push(
        `<g class="dle-edge-label${diffClass(e.id)}" data-id="${esc(e.id)}"><rect x="${r(e.labelPos.x - e.labelWidth / 2)}" y="${r(e.labelPos.y - e.labelHeight / 2)}" width="${r(e.labelWidth)}" height="${r(e.labelHeight)}" rx="3"/>` +
          `${textLines(lines, e.labelPos.x, e.labelPos.y, 18, 'dle-label-text', css(st, TEXT_PROPS))}</g>`,
      );
    }
  });

  const nodeParts: string[] = [];
  for (const n of layout.nodes) {
    const st = merged(n.classes, n.style, opts.classDefs);
    const lines = opts.diff?.labels?.get(n.id) ?? n.lines;
    const debug = opts.debug
      ? `<text class="dle-debug" x="${r(n.x + n.width / 2 + 3)}" y="${r(n.y - n.height / 2 - 3)}">r${n.rank}·o${n.order}</text>`
      : '';
    nodeParts.push(
      `<g class="dle-node dle-shape-${n.shape}${diffClass(n.id)}" data-id="${esc(n.id)}" tabindex="0" role="img" aria-label="${esc(lines.join(' '))}">` +
        shapeSvg(n.shape, n.x, n.y, n.width, n.height, `class="dle-node-shape"${css(st, SHAPE_PROPS)}`) +
        textLines(lines, n.x, n.y, 18, 'dle-node-text', css(st, TEXT_PROPS)) +
        debug +
        '</g>',
    );
  }

  const root = `#${P}svg`;
  const style =
    themeCss(opts.theme, root) +
    `${root}{font-family:var(--dle-font);font-size:14px}` +
    `${root} .dle-bg{fill:var(--dle-bg)}` +
    `${root} .dle-node-shape{fill:var(--dle-node-fill);stroke:var(--dle-node-stroke);stroke-width:1.5}` +
    `${root} .dle-node-text{fill:var(--dle-node-text)}` +
    `${root} .dle-cluster rect{fill:var(--dle-cluster-fill);stroke:var(--dle-cluster-stroke);stroke-width:1.2}` +
    `${root} .dle-cluster-title{fill:var(--dle-cluster-text);font-size:13px;font-weight:600}` +
    `${root} .dle-edge-path{fill:none;stroke:var(--dle-edge);stroke-width:1.6}` +
    `${root} .dle-hit{fill:none;stroke:transparent;stroke-width:10}` +
    `${root} .dle-thick .dle-edge-path{stroke-width:3.2}` +
    `${root} .dle-dotted .dle-edge-path{stroke-dasharray:3 4}` +
    `${root} .dle-edge-label rect{fill:var(--dle-label-bg);opacity:.92}` +
    `${root} .dle-label-text{fill:var(--dle-label-text);font-size:12.5px}` +
    `${root} .dle-debug{fill:var(--dle-focus);font-size:9px;font-family:ui-monospace,monospace}` +
    `${root} .dle-added .dle-node-shape,${root} .dle-cluster.dle-added rect{fill:var(--dle-added-fill);stroke:var(--dle-added);stroke-width:2.5}` +
    `${root} .dle-removed .dle-node-shape,${root} .dle-cluster.dle-removed rect{fill:var(--dle-removed-fill);stroke:var(--dle-removed);stroke-width:2.5}` +
    `${root} .dle-changed .dle-node-shape,${root} .dle-cluster.dle-changed rect{fill:var(--dle-changed-fill);stroke:var(--dle-changed);stroke-width:2.5}` +
    `${root} .dle-edge.dle-added .dle-edge-path{stroke:var(--dle-added);stroke-width:2.4}` +
    `${root} .dle-edge.dle-removed .dle-edge-path{stroke:var(--dle-removed);stroke-width:2.4}` +
    `${root} .dle-edge.dle-changed .dle-edge-path{stroke:var(--dle-changed);stroke-width:2.4}` +
    `${root} .dle-removed .dle-edge-path{stroke-dasharray:6 4}` +
    `${root} .dle-ghost{opacity:.16}` +
    `${root} .dle-ghost .dle-edge-path,${root} .dle-ghost .dle-node-shape{stroke-dasharray:4 4}` +
    `${root} .dle-node:focus{outline:none}` +
    `${root} .dle-node:focus .dle-node-shape{stroke:var(--dle-focus);stroke-width:2.5}`;
  const W = Math.max(1, layout.width);
  const H = Math.max(1, layout.height);
  const title = opts.title ? `<title>${esc(opts.title)}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" id="${P}svg" class="dle" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">` +
    title +
    `<style>${style}</style>` +
    `<defs>${[...markers.values()].join('')}</defs>` +
    `<rect class="dle-bg" width="${W}" height="${H}"/>` +
    `<g class="dle-clusters">${clusterSvg}</g>` +
    `<g class="dle-edges">${edgeParts.join('')}</g>` +
    `<g class="dle-edge-labels">${labelParts.join('')}</g>` +
    `<g class="dle-nodes">${nodeParts.join('')}</g>` +
    '</svg>'
  );
}
