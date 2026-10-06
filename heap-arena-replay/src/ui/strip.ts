// SVG heap strip: one cell per word, wrapped into rows, with every header,
// footer, payload byte, padding byte and free-list pointer drawn to scale.

import { hex, type Block, type HeapConfig } from '../core/heap';
import type { Event } from '../core/heap';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 20;
const ROW_H = 26;
const ROW_GAP = 14;
const LEFT = 44;
const TOP = 10;

export interface StripOptions {
  bytesPerRow: number;
  showLinks: boolean;
  /** Event whose effects to highlight (the op that produced this state). */
  event?: Event;
  rover?: number;
  freeLists?: number[][];
  /** Compact strips (compare mode) hide labels. */
  compact?: boolean;
}

export interface Highlight {
  examined: Set<number>;
  found: number | null;
  result: number | null;
  freed: number | null;
  split: number | null;
}

export function highlightsFor(event: Event | undefined): Highlight {
  const h: Highlight = { examined: new Set(), found: null, result: null, freed: null, split: null };
  if (!event) return h;
  if (event.kind === 'malloc') {
    for (const e of event.examined) h.examined.add(e.bp);
    h.result = event.result;
    if (event.split) h.split = event.split.bp;
  } else if (event.kind === 'free') {
    if (!event.error) h.freed = event.resultBp;
  } else {
    for (const e of event.examined) h.examined.add(e.bp);
    h.result = event.result;
    if (event.strategy === 'move') h.freed = event.oldBp;
  }
  return h;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Piece {
  row: number;
  x0: number;
  x1: number;
}

/** Splits a byte range into per-row horizontal pieces in SVG units. */
export function pieces(start: number, end: number, bytesPerRow: number, word: number): Piece[] {
  const out: Piece[] = [];
  const unit = CELL / word;
  let b = start;
  while (b < end) {
    const row = Math.floor(b / bytesPerRow);
    const rowEnd = (row + 1) * bytesPerRow;
    const e = Math.min(end, rowEnd);
    out.push({ row, x0: LEFT + (b - row * bytesPerRow) * unit, x1: LEFT + (e - row * bytesPerRow) * unit });
    b = e;
  }
  return out;
}

function rowY(row: number): number {
  return TOP + row * (ROW_H + ROW_GAP);
}

function region(g: SVGGElement, start: number, end: number, cls: string, bytesPerRow: number, word: number, title?: string): void {
  for (const p of pieces(start, end, bytesPerRow, word)) {
    const r = el('rect', { x: p.x0, y: rowY(p.row), width: p.x1 - p.x0, height: ROW_H, class: cls });
    if (title) r.appendChild(el('title', {}, title));
    g.appendChild(r);
  }
}

function outline(g: SVGGElement, start: number, end: number, cls: string, bytesPerRow: number, word: number): void {
  for (const p of pieces(start, end, bytesPerRow, word)) {
    g.appendChild(el('rect', { x: p.x0 + 0.75, y: rowY(p.row) + 0.75, width: p.x1 - p.x0 - 1.5, height: ROW_H - 1.5, class: cls }));
  }
}

function label(g: SVGGElement, start: number, end: number, text: string, bytesPerRow: number, word: number, cls = 'lbl'): void {
  const p = pieces(start, end, bytesPerRow, word)[0];
  if (!p) return;
  const width = p.x1 - p.x0;
  if (width < 18) return;
  const t = el('text', { x: p.x0 + 3, y: rowY(p.row) + ROW_H / 2 + 3.5, class: cls }, text);
  t.appendChild(el('title', {}, text));
  g.appendChild(t);
  // Clip long labels by truncating characters to the available width.
  const maxChars = Math.floor((width - 4) / 5.6);
  if (text.length > maxChars) {
    if (maxChars < 3) t.remove();
    else t.textContent = text.slice(0, maxChars - 1) + '…';
  }
}

function blockTitle(b: Block, cfg: HeapConfig): string {
  const lines = [`${b.alloc ? 'allocated' : 'free'} block, ${b.size} bytes`, `header ${hex(b.addr)}, payload ${hex(b.bp)}, footer ${hex(b.bp + b.size - 2 * cfg.word)}`];
  if (b.alloc && b.req !== undefined) {
    lines.push(`p${b.id}: requested ${b.req} bytes, padding ${b.size - 2 * cfg.word - b.req}`);
  }
  if (!b.alloc && b.pred !== undefined) {
    lines.push(`pred ${b.pred === 0 ? 'NULL' : hex(b.pred)}, succ ${b.succ === 0 ? 'NULL' : hex(b.succ!)}`);
    if (b.cls !== undefined) lines.push(`size class ${b.cls}`);
  }
  return lines.join('\n');
}

export function renderStrip(blocks: Block[], cfg: HeapConfig, opts: StripOptions): SVGSVGElement {
  const { bytesPerRow, showLinks } = opts;
  const w = cfg.word;
  const rows = Math.ceil(cfg.heapSize / bytesPerRow);
  const width = LEFT + (bytesPerRow / w) * CELL + 8;
  const height = TOP + rows * (ROW_H + ROW_GAP);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'strip' + (opts.compact ? ' compact' : ''), role: 'img' });
  svg.setAttribute('aria-label', `Heap strip of ${cfg.heapSize} bytes with ${blocks.length} blocks`);
  const hl = highlightsFor(opts.event);

  // Row address labels and the background grid.
  const grid = el('g', { class: 'grid' });
  for (let r = 0; r < rows; r += 1) {
    grid.appendChild(el('text', { x: LEFT - 6, y: rowY(r) + ROW_H / 2 + 3.5, class: 'rowaddr', 'text-anchor': 'end' }, hex(r * bytesPerRow)));
    const cols = bytesPerRow / w;
    for (let c = 0; c < cols; c += 1) {
      grid.appendChild(el('rect', { x: LEFT + c * CELL, y: rowY(r), width: CELL, height: ROW_H, class: 'cell' }));
    }
  }
  svg.appendChild(grid);

  const g = el('g', { class: 'blocks' });
  // Padding word, prologue, epilogue.
  region(g, 0, w, 'sys pad', bytesPerRow, w, 'alignment padding word');
  region(g, w, 2 * w, 'sys hdr', bytesPerRow, w, 'prologue header (8/1)');
  region(g, 2 * w, 3 * w, 'sys ftr', bytesPerRow, w, 'prologue footer (8/1)');
  region(g, cfg.heapSize - w, cfg.heapSize, 'sys hdr', bytesPerRow, w, 'epilogue header (0/1)');
  if (!opts.compact) {
    label(g, w, 3 * w, 'pro', bytesPerRow, w, 'lbl sys');
    label(g, cfg.heapSize - w, cfg.heapSize, 'epi', bytesPerRow, w, 'lbl sys');
  }

  for (const b of blocks) {
    const bg = el('g', { class: 'block' });
    const title = blockTitle(b, cfg);
    const kind = b.alloc ? 'alloc' : 'free';
    region(bg, b.addr, b.addr + w, `hdr ${kind}`, bytesPerRow, w, `${title}\nheader: ${b.size}/${b.alloc ? 1 : 0}`);
    const ftr = b.bp + b.size - 2 * w;
    if (b.alloc) {
      const req = b.req ?? b.size - 2 * w;
      region(bg, b.bp, b.bp + req, 'payload', bytesPerRow, w, title);
      if (b.bp + req < ftr) region(bg, b.bp + req, ftr, 'padding', bytesPerRow, w, `${title}\npadding bytes`);
    } else {
      const linked = cfg.list !== 'implicit';
      let interior = b.bp;
      if (linked) {
        region(bg, b.bp, b.bp + w, 'ptr pred', bytesPerRow, w, `${title}\npred pointer`);
        region(bg, b.bp + w, b.bp + 2 * w, 'ptr succ', bytesPerRow, w, `${title}\nsucc pointer`);
        interior = b.bp + 2 * w;
      }
      if (interior < ftr) region(bg, interior, ftr, 'freespace', bytesPerRow, w, title);
    }
    region(bg, ftr, ftr + w, `ftr ${kind}`, bytesPerRow, w, `${title}\nfooter: ${b.size}/${b.alloc ? 1 : 0}`);
    outline(bg, b.addr, b.addr + b.size, 'edge', bytesPerRow, w);
    if (!opts.compact) {
      const text = b.alloc ? `p${b.id ?? '?'} ${b.req ?? ''}` : `free ${b.size}`;
      label(bg, b.alloc ? b.bp : cfg.list === 'implicit' ? b.bp : b.bp + 2 * w, ftr, text, bytesPerRow, w, b.alloc ? 'lbl' : 'lbl freelbl');
    }
    if (hl.examined.has(b.bp)) outline(bg, b.addr, b.addr + b.size, 'hl examined', bytesPerRow, w);
    if (hl.result === b.bp) outline(bg, b.addr, b.addr + b.size, 'hl result', bytesPerRow, w);
    if (hl.split === b.bp) outline(bg, b.addr, b.addr + b.size, 'hl split', bytesPerRow, w);
    if (hl.freed === b.bp) outline(bg, b.addr, b.addr + b.size, 'hl freed', bytesPerRow, w);
    g.appendChild(bg);
  }
  svg.appendChild(g);

  // Rover marker.
  if (cfg.fit === 'next' && cfg.list === 'implicit' && opts.rover !== undefined) {
    const p = pieces(opts.rover - w, opts.rover, bytesPerRow, w)[0];
    if (p) {
      const x = (p.x0 + p.x1) / 2;
      const y = rowY(p.row) - 2;
      const m = el('path', { d: `M${x - 5},${y - 7} L${x + 5},${y - 7} L${x},${y} Z`, class: 'rover' });
      m.appendChild(el('title', {}, `next-fit rover at ${hex(opts.rover)}`));
      svg.appendChild(m);
    }
  }

  // Free-list links.
  if (showLinks && cfg.list !== 'implicit' && opts.freeLists) {
    const links = el('g', { class: 'links' });
    opts.freeLists.forEach((list, li) => {
      list.forEach((bp, i) => {
        const from = pieces(bp + w, bp + 2 * w, bytesPerRow, w)[0];
        if (i === 0) {
          const hx = (from.x0 + from.x1) / 2;
          const hy = rowY(from.row) - 3;
          links.appendChild(el('text', { x: hx, y: hy - 1, class: `head c${li}`, 'text-anchor': 'middle' }, cfg.list === 'segregated' ? `c${li}` : 'head'));
        }
        if (i === list.length - 1) return;
        const next = list[i + 1];
        const to = pieces(next - w, next, bytesPerRow, w)[0];
        const x1 = (from.x0 + from.x1) / 2;
        const y1 = rowY(from.row);
        const x2 = (to.x0 + to.x1) / 2;
        const y2 = rowY(to.row);
        const lift = from.row === to.row ? Math.min(24, 8 + Math.abs(x2 - x1) / 8) : 10;
        const d = `M${x1},${y1} C${x1},${y1 - lift} ${x2},${y2 - lift} ${x2},${y2}`;
        const path = el('path', { d, class: `link c${li}` });
        path.appendChild(el('title', {}, `succ: ${hex(bp)} -> ${hex(next)}`));
        links.appendChild(path);
        links.appendChild(el('circle', { cx: x2, cy: y2, r: 1.8, class: `tip c${li}` }));
      });
    });
    svg.appendChild(links);
  }
  return svg;
}

/** A strip of raw payload ranges (student diff view): no headers, just where blocks claim to be. */
export function renderRanges(ranges: { bp: number; req: number; id: number; bad?: boolean }[], cfg: HeapConfig, bytesPerRow: number): SVGSVGElement {
  const w = cfg.word;
  const rows = Math.ceil(cfg.heapSize / bytesPerRow);
  const width = LEFT + (bytesPerRow / w) * CELL + 8;
  const height = TOP + rows * (ROW_H + ROW_GAP);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'strip compact', role: 'img' });
  const grid = el('g', { class: 'grid' });
  for (let r = 0; r < rows; r += 1) {
    grid.appendChild(el('text', { x: LEFT - 6, y: rowY(r) + ROW_H / 2 + 3.5, class: 'rowaddr', 'text-anchor': 'end' }, hex(r * bytesPerRow)));
    for (let c = 0; c < bytesPerRow / w; c += 1) {
      grid.appendChild(el('rect', { x: LEFT + c * CELL, y: rowY(r), width: CELL, height: ROW_H, class: 'cell' }));
    }
  }
  svg.appendChild(grid);
  const g = el('g', { class: 'blocks' });
  for (const r of ranges) {
    const bg = el('g', { class: 'block' });
    const end = Math.min(cfg.heapSize, r.bp + r.req);
    region(bg, r.bp, end, r.bad ? 'payload badrange' : 'payload', bytesPerRow, w, `p${r.id} at ${hex(r.bp)}, ${r.req} bytes`);
    outline(bg, r.bp, end, 'edge', bytesPerRow, w);
    label(bg, r.bp, end, `p${r.id}`, bytesPerRow, w);
    g.appendChild(bg);
  }
  svg.appendChild(g);
  return svg;
}
