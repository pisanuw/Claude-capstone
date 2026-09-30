/**
 * Turns PDF text items (as pdf.js reports them) into plain text with
 * paragraphs. pdf.js gives positioned runs of text; this joins runs on a
 * line, starts a new line on a baseline change, starts a new paragraph on a
 * gap noticeably larger than the line spacing, rejoins words hyphenated
 * across lines, and drops running headers, footers and page numbers that
 * repeat on most pages.
 */

export interface PdfItem {
  str: string;
  /** Left x of the run. */
  x: number;
  /** Baseline y (PDF units, larger is higher on the page). */
  y: number;
  /** Font height. */
  h: number;
  hasEOL?: boolean;
}

interface Line {
  text: string;
  y: number;
  h: number;
  x: number;
}

function toLines(items: PdfItem[]): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const it of items) {
    if (!it.str && !it.hasEOL) continue;
    const sameLine = cur && Math.abs(it.y - cur.y) <= Math.max(1.5, 0.35 * Math.max(it.h, cur.h));
    if (!cur || !sameLine) {
      if (cur && cur.text.trim()) lines.push(cur);
      cur = { text: it.str, y: it.y, h: it.h || 10, x: it.x };
    } else {
      const needSpace = cur.text && !/\s$/.test(cur.text) && it.str && !/^\s/.test(it.str);
      cur.text += (needSpace ? ' ' : '') + it.str;
      cur.h = Math.max(cur.h, it.h);
    }
    if (it.hasEOL && cur) {
      if (cur.text.trim()) lines.push(cur);
      cur = null;
    }
  }
  if (cur && cur.text.trim()) lines.push(cur);
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }));
}

/** A line's text with digits blanked, to spot running headers and page numbers. */
function shape(s: string): string {
  return s.replace(/\d+/g, '#').toLowerCase();
}

/** Joins one page's lines into paragraphs. */
function pageText(lines: Line[], drop: Set<string>): string {
  const kept = lines.filter((l) => !drop.has(shape(l.text)) && !/^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(l.text));
  const gaps: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    const g = kept[i - 1].y - kept[i].y;
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  let out = '';
  for (let i = 0; i < kept.length; i++) {
    const l = kept[i];
    if (i === 0) {
      out = l.text;
      continue;
    }
    const prev = kept[i - 1];
    const gap = prev.y - l.y;
    const bigGap = typical > 0 && (gap > typical * 1.45 || gap < 0);
    const bullet = /^([-*\u2022\u25CF\u25AA\u25E6]|\d{1,3}[.)])\s/.test(l.text);
    const fontJump = Math.abs(l.h - prev.h) > 1.5;
    if (bigGap || fontJump) out += '\n\n' + l.text;
    else if (bullet) out += '\n' + l.text;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(l.text)) out = out.slice(0, -1) + l.text;
    else out += '\n' + l.text;
  }
  return out;
}

/**
 * Converts every page's items to text; pages are separated by form feeds so
 * the document parser can record page numbers.
 */
export function pdfItemsToText(pages: PdfItem[][]): string {
  const pageLines = pages.map(toLines);
  // A header or footer: same shape on the first or last two lines of most pages.
  const counts = new Map<string, number>();
  if (pages.length >= 3) {
    for (const lines of pageLines) {
      // Two lines at each edge on a full page; on a short page, only the first and last.
      const k = lines.length >= 6 ? 2 : 1;
      const edge = new Set([...lines.slice(0, k), ...lines.slice(-k)].map((l) => shape(l.text)));
      for (const s of edge) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  const drop = new Set([...counts.entries()].filter(([, n]) => n >= Math.max(3, pages.length * 0.6)).map(([s]) => s));
  return pageLines.map((lines) => pageText(lines, drop)).join('\f');
}
