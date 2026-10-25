// Textbook longest-common-subsequence dynamic programming. table[i][j] is the
// LCS length of the suffixes A[i..] and B[j..], so the traceback walks forward
// from (0,0) like the other algorithms. Ties prefer a deletion, which matches
// Myers' habit of deleting before inserting.

import type { Script } from './script';

export interface LcsResult {
  script: Script;
  table: number[][];
  length: number;
}

export function lcs(a: readonly string[], b: readonly string[]): LcsResult {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = table[i] as number[];
    const below = table[i + 1] as number[];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? (below[j + 1] as number) + 1 : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  const script: Script = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      script.push({ type: 'eq', a: i++, b: j++ });
    } else if (j >= m || (i < n && cell(table, i + 1, j) >= cell(table, i, j + 1))) {
      script.push({ type: 'del', a: i++ });
    } else {
      script.push({ type: 'ins', b: j++ });
    }
  }
  return { script, table, length: (table[0] as number[])[0] as number };
}

function cell(table: number[][], i: number, j: number): number {
  return (table[i] as number[])[j] as number;
}
