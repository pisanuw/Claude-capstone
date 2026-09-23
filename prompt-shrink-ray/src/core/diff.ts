import type { DiffOp } from './types.js';

// Splitting on this regex keeps whitespace runs as their own tokens, so
// rejoining every token exactly reproduces the input.
const TOKEN_RE = /\s+|[^\s]+/g;

export function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

// A DP table larger than this is skipped in favor of a coarser line-level
// diff, so a huge paste cannot hang the browser tab.
const MAX_DP_CELLS = 4_000_000;

/**
 * Word-level diff between two texts using an LCS dynamic program, merging
 * consecutive same-kind tokens into runs. Falls back to a line-level diff
 * (same algorithm, coarser tokens) when the word-level table would be too
 * large to compute interactively.
 */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if ((a.length + 1) * (b.length + 1) > MAX_DP_CELLS) {
    return diffTokens(before.split('\n'), after.split('\n'), '\n');
  }
  return diffTokens(a, b, '');
}

function diffTokens(a: string[], b: string[], joiner: string): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  const push = (kind: DiffOp['kind'], text: string): void => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) {
      last.text += (last.text ? joiner : '') + text;
    } else {
      ops.push({ kind, text });
    }
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('delete', a[i]);
      i += 1;
    } else {
      push('insert', b[j]);
      j += 1;
    }
  }
  while (i < n) {
    push('delete', a[i]);
    i += 1;
  }
  while (j < m) {
    push('insert', b[j]);
    j += 1;
  }
  return ops;
}
