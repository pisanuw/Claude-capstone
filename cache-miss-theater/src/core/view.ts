// Pure helpers the UI uses to label cache lines and lay out arrays on screen.

import { elementLabel, type ArrayInfo, type Trace } from './trace';

/** Elements of `a` that fall inside memory line `line` (inclusive range), or null. */
export function elementsInLine(a: ArrayInfo, line: number, lineSize: number): [number, number] | null {
  const start = line * lineSize;
  const end = start + lineSize;
  if (end <= a.base || start >= a.base + a.bytes) return null;
  const first = Math.max(0, Math.floor((start - a.base) / a.elemSize));
  const last = Math.min(a.bytes / a.elemSize - 1, Math.ceil((end - a.base) / a.elemSize) - 1);
  return [first, last];
}

/** Short label such as `A[3][4..7]` or `A[3][6]..A[4][1]` for a memory line. */
export function lineLabel(trace: Trace, line: number, lineSize: number): string {
  const parts: string[] = [];
  for (const a of trace.arrays) {
    const r = elementsInLine(a, line, lineSize);
    if (!r) continue;
    const [f, l] = r;
    const lf = elementLabel(a, f);
    if (f === l) {
      parts.push(lf);
      continue;
    }
    const ll = elementLabel(a, l);
    const cut = lf.lastIndexOf('[');
    if (lf.slice(0, cut) === ll.slice(0, ll.lastIndexOf('['))) {
      const lastIdx = (n: string) => n.slice(n.lastIndexOf('[') + 1, -1);
      parts.push(`${lf.slice(0, cut)}[${lastIdx(lf)}..${lastIdx(ll)}]`);
    } else parts.push(`${lf}..${ll}`);
  }
  return parts.length ? parts.join(' + ') : `line 0x${(line * lineSize).toString(16)}`;
}

/** Rows and columns used to draw an array: its last dimension, or wrapped rows for 1D arrays. */
export function gridShape(a: ArrayInfo, lineSize: number): { rows: number; cols: number } {
  const count = a.bytes / a.elemSize;
  let cols = a.dims.length > 1 ? (a.dims.at(-1) as number) : 0;
  if (!cols) {
    // Wrap 1D arrays at a whole number of lines, about 32 to 64 elements wide.
    const perLine = Math.max(1, lineSize / a.elemSize);
    cols = Math.max(perLine, Math.round(48 / perLine) * perLine);
    if (count < cols) cols = count;
  }
  return { rows: Math.ceil(count / cols), cols };
}

export function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

export function percent(x: number): string {
  return `${(x * 100).toFixed(x > 0 && x < 0.001 ? 2 : 1)}%`;
}
