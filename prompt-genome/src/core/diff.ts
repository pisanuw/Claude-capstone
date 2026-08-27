/**
 * Word-level diff for the side-by-side view: original prompt vs the edited
 * genome. A classic LCS over word tokens; prompts are small, so the O(n*m)
 * table is fine, with a guard for pathological sizes.
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffToken {
  text: string;
  kind: DiffKind;
}

/** Split into words; whitespace is normalized to single spaces on render. */
export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter((t) => t !== '');
}

const MAX_TABLE = 4_000_000;

export function diffWords(a: string, b: string): DiffToken[] {
  const ta = tokenizeWords(a);
  const tb = tokenizeWords(b);
  if (ta.length === 0 && tb.length === 0) return [];
  if (ta.length * tb.length > MAX_TABLE) {
    // Fallback for huge inputs: trim the common prefix/suffix, mark the rest.
    let start = 0;
    while (start < ta.length && start < tb.length && ta[start] === tb[start]) start += 1;
    let endA = ta.length;
    let endB = tb.length;
    while (endA > start && endB > start && ta[endA - 1] === tb[endB - 1]) {
      endA -= 1;
      endB -= 1;
    }
    return [
      ...ta.slice(0, start).map((text) => ({ text, kind: 'same' as const })),
      ...ta.slice(start, endA).map((text) => ({ text, kind: 'removed' as const })),
      ...tb.slice(start, endB).map((text) => ({ text, kind: 'added' as const })),
      ...ta.slice(endA).map((text) => ({ text, kind: 'same' as const })),
    ];
  }

  // LCS lengths.
  const n = ta.length;
  const m = tb.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => table[i * (m + 1) + j];
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * (m + 1) + j] =
        ta[i] === tb[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      out.push({ text: ta[i], kind: 'same' });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push({ text: ta[i], kind: 'removed' });
      i += 1;
    } else {
      out.push({ text: tb[j], kind: 'added' });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ text: ta[i], kind: 'removed' });
    i += 1;
  }
  while (j < m) {
    out.push({ text: tb[j], kind: 'added' });
    j += 1;
  }
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  same: number;
}

export function diffStats(tokens: DiffToken[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, same: 0 };
  for (const t of tokens) stats[t.kind] += 1;
  return stats;
}
