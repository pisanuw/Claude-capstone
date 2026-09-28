export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placed<T> {
  item: T;
  rect: Rect;
}

/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk 2000). Items are laid out in the given
 * order (callers sort by size descending for the classic look). Every item with a positive value
 * receives a rectangle; areas are proportional to values and tile the rectangle exactly.
 */
export function squarify<T>(items: T[], value: (item: T) => number, bounds: Rect): Placed<T>[] {
  const positive = items.filter((it) => value(it) > 0);
  const total = positive.reduce((s, it) => s + value(it), 0);
  const out: Placed<T>[] = [];
  if (!positive.length || total <= 0 || bounds.w <= 0 || bounds.h <= 0) return out;

  const scale = (bounds.w * bounds.h) / total;
  const areas = positive.map((it) => value(it) * scale);

  let free: Rect = { ...bounds };
  let row: number[] = [];
  let rowItems: T[] = [];

  const worst = (r: number[], side: number): number => {
    const sum = r.reduce((s, a) => s + a, 0);
    if (sum === 0 || side === 0) return Infinity;
    const max = Math.max(...r);
    const min = Math.min(...r);
    const s2 = side * side;
    return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
  };

  const layoutRow = (r: number[], its: T[]): void => {
    const sum = r.reduce((s, a) => s + a, 0);
    const horizontal = free.w >= free.h; // lay the row along the shorter side
    if (horizontal) {
      const colW = sum / free.h;
      let y = free.y;
      r.forEach((a, i) => {
        const h = a / colW;
        out.push({ item: its[i], rect: { x: free.x, y, w: colW, h } });
        y += h;
      });
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
    } else {
      const rowH = sum / free.w;
      let x = free.x;
      r.forEach((a, i) => {
        const w = a / rowH;
        out.push({ item: its[i], rect: { x, y: free.y, w, h: rowH } });
        x += w;
      });
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
    }
  };

  areas.forEach((a, i) => {
    const side = Math.min(free.w, free.h);
    if (row.length && worst(row, side) < worst([...row, a], side)) {
      layoutRow(row, rowItems);
      row = [];
      rowItems = [];
    }
    row.push(a);
    rowItems.push(positive[i]);
  });
  if (row.length) layoutRow(row, rowItems);
  return out;
}

/** Shrink a rect by `pad` on every side, never below zero size. */
export function inset(r: Rect, pad: number): Rect {
  const w = Math.max(0, r.w - 2 * pad);
  const h = Math.max(0, r.h - 2 * pad);
  return { x: r.x + pad, y: r.y + pad, w, h };
}
