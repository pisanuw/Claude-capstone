// Binary min-heap keyed by an array priority, compared lexicographically.
// Callers append an insertion counter as the last priority component to make
// tie-breaking deterministic (first-in wins among equal priorities).

function less(p, q) {
  for (let i = 0; i < p.length; i++) {
    if (p[i] < q[i]) return true;
    if (p[i] > q[i]) return false;
  }
  return false;
}

export class MinHeap {
  constructor() {
    this.a = [];
  }

  size() {
    return this.a.length;
  }

  push(priority, value) {
    const a = this.a;
    a.push({ priority, value });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (less(a[i].priority, a[parent].priority)) {
        [a[i], a[parent]] = [a[parent], a[i]];
        i = parent;
      } else break;
    }
  }

  pop() {
    const a = this.a;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < a.length && less(a[l].priority, a[m].priority)) m = l;
        if (r < a.length && less(a[r].priority, a[m].priority)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
