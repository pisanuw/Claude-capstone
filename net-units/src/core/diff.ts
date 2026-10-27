/** Line diff (longest common subsequence) between a starter file and a solution file. */

export type DiffOp = 'equal' | 'add' | 'del';

export interface DiffLine {
  op: DiffOp;
  /** 1-based line numbers; 0 when the line does not exist on that side. */
  oldLine: number;
  newLine: number;
  text: string;
}

/** Above this many cells the middle section is treated as fully replaced. */
const MAX_CELLS = 16_000_000;

export function splitLines(src: string): string[] {
  if (src === '') return [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const norm = (s: string): string => s.replace(/\s+$/, '');

export function diffLines(oldSrc: string, newSrc: string): DiffLine[] {
  const a = splitLines(oldSrc);
  const b = splitLines(newSrc);
  let pre = 0;
  while (pre < a.length && pre < b.length && norm(a[pre] as string) === norm(b[pre] as string)) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    norm(a[a.length - 1 - suf] as string) === norm(b[b.length - 1 - suf] as string)
  )
    suf++;

  const out: DiffLine[] = [];
  for (let i = 0; i < pre; i++) out.push({ op: 'equal', oldLine: i + 1, newLine: i + 1, text: b[i] as string });

  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const n = am.length;
  const m = bm.length;
  if (n * m > MAX_CELLS) {
    am.forEach((text, i) => out.push({ op: 'del', oldLine: pre + i + 1, newLine: 0, text }));
    bm.forEach((text, j) => out.push({ op: 'add', oldLine: 0, newLine: pre + j + 1, text }));
  } else {
    // lcs[i][j] = LCS length of am[i..] and bm[j..], stored row-major.
    const w = m + 1;
    const lcs = new Int32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] =
          norm(am[i] as string) === norm(bm[j] as string)
            ? (lcs[(i + 1) * w + j + 1] as number) + 1
            : Math.max(lcs[(i + 1) * w + j] as number, lcs[i * w + j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && norm(am[i] as string) === norm(bm[j] as string)) {
        out.push({ op: 'equal', oldLine: pre + i + 1, newLine: pre + j + 1, text: bm[j] as string });
        i++;
        j++;
      } else if (i < n && (j === m || (lcs[(i + 1) * w + j] as number) >= (lcs[i * w + j + 1] as number))) {
        // On a tie, deletions go first so a changed line reads as "- old / + new".
        out.push({ op: 'del', oldLine: pre + i + 1, newLine: 0, text: am[i] as string });
        i++;
      } else {
        out.push({ op: 'add', oldLine: 0, newLine: pre + j + 1, text: bm[j] as string });
        j++;
      }
    }
  }

  for (let k = 0; k < suf; k++) {
    const oi = a.length - suf + k;
    const ni = b.length - suf + k;
    out.push({ op: 'equal', oldLine: oi + 1, newLine: ni + 1, text: b[ni] as string });
  }
  return out;
}
