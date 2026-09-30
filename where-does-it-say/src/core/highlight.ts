/** Splitting a block of text into plain and highlighted segments for the viewer. */

export interface Mark {
  start: number;
  end: number;
  /** Index of the quote this mark belongs to (for numbering and the scroll target). */
  quote: number;
}

export interface Segment {
  text: string;
  /** The quote index when highlighted. */
  quote?: number;
}

/**
 * Cuts [start, end) of `text` into segments, highlighting the parts covered by
 * marks. Overlapping marks are resolved in favour of the earlier quote.
 */
export function segments(text: string, start: number, end: number, marks: Mark[]): Segment[] {
  const relevant = marks.filter((m) => m.start < end && m.end > start).sort((a, b) => a.start - b.start || a.quote - b.quote);
  const out: Segment[] = [];
  let pos = start;
  for (const m of relevant) {
    const s = Math.max(m.start, pos);
    const e = Math.min(m.end, end);
    if (e <= s) continue;
    if (s > pos) out.push({ text: text.slice(pos, s) });
    out.push({ text: text.slice(s, e), quote: m.quote });
    pos = e;
  }
  if (pos < end) out.push({ text: text.slice(pos, end) });
  return out;
}
