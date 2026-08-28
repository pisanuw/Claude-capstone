import type { HoverEntry } from './types';

/** A run of characters that renders identically in the witness view. */
export interface Segment {
  start: number;
  end: number;
  text: string;
  /** Index into the hover array of the smallest span covering this run, or null. */
  hoverIndex: number | null;
  /** Inside the currently highlighted step span. */
  current: boolean;
  /** Inside a diagnostic span (rendered with an error underline). */
  error: boolean;
}

export interface SpanLike {
  start: number;
  end: number;
}

/**
 * Cut the source into runs so the UI can render it as flat spans: at every
 * boundary of any hover span, the current step span, or a diagnostic span,
 * a new run starts. Each run is attributed to the *smallest* hover span
 * containing it, which is what makes hovering feel like pointing at the
 * innermost expression.
 */
export function segment(
  code: string,
  hover: HoverEntry[],
  current: SpanLike | null,
  errors: SpanLike[],
): Segment[] {
  const cuts = new Set<number>([0, code.length]);
  const clamp = (n: number) => Math.max(0, Math.min(code.length, n));
  for (const h of hover) {
    cuts.add(clamp(h.start));
    cuts.add(clamp(h.end));
  }
  if (current) {
    cuts.add(clamp(current.start));
    cuts.add(clamp(current.end));
  }
  // Zero-length diagnostics (e.g. at a missing token) widen to one character
  // so they still render.
  const errorSpans = errors.map((e) => ({
    start: clamp(e.start),
    end: clamp(Math.max(e.end, e.start + 1)),
  }));
  for (const e of errorSpans) {
    cuts.add(e.start);
    cuts.add(e.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    let hoverIndex: number | null = null;
    let best = Infinity;
    for (let h = 0; h < hover.length; h++) {
      const span = hover[h];
      if (span.start <= start && end <= span.end && span.end - span.start < best) {
        best = span.end - span.start;
        hoverIndex = h;
      }
    }
    segments.push({
      start,
      end,
      text: code.slice(start, end),
      hoverIndex,
      current: current !== null && current.start <= start && end <= current.end,
      error: errorSpans.some((e) => e.start <= start && end <= e.end),
    });
  }
  return segments;
}
