// Turns an edit script into the hunks of a unified diff (`diff -u`).
//
// Hunk headers follow GNU diff: `@@ -start,len +start,len @@` with 1-based
// starts, `,len` omitted when it is 1, and a zero-length side reported as the
// line *before* the change (so an insertion at the top of a file reads -0,0).

import type { Op, Script } from './script';

export interface Hunk {
  /** Index range [opStart, opEnd) of the script this hunk covers, context included. */
  opStart: number;
  opEnd: number;
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  header: string;
  lines: string[];
}

export function hunks(script: Script, a: readonly string[], b: readonly string[], context = 3): Hunk[] {
  const changes: number[] = [];
  script.forEach((op, i) => {
    if (op.type !== 'eq') changes.push(i);
  });
  if (changes.length === 0) return [];

  // Group change indices whose gap of equal ops is at most 2 * context.
  const groups: [number, number][] = [];
  let start = changes[0] as number;
  let end = start;
  for (const i of changes.slice(1)) {
    if (i - end - 1 > 2 * context) {
      groups.push([start, end]);
      start = i;
    }
    end = i;
  }
  groups.push([start, end]);

  return groups.map(([first, last]) => {
    const opStart = Math.max(0, first - context);
    const opEnd = Math.min(script.length, last + 1 + context);
    const ops = script.slice(opStart, opEnd);
    // Position in A and B just before the hunk's first op.
    const { x, y } = positionBefore(script, opStart);
    let oldLen = 0;
    let newLen = 0;
    const lines = ops.map((op) => {
      if (op.type === 'eq') {
        oldLen++;
        newLen++;
        return ` ${a[op.a]}`;
      }
      if (op.type === 'del') {
        oldLen++;
        return `-${a[op.a]}`;
      }
      newLen++;
      return `+${b[op.b]}`;
    });
    const oldStart = oldLen === 0 ? x : x + 1;
    const newStart = newLen === 0 ? y : y + 1;
    const range = (s: number, l: number) => (l === 1 ? `${s}` : `${s},${l}`);
    return {
      opStart,
      opEnd,
      oldStart,
      oldLen,
      newStart,
      newLen,
      header: `@@ -${range(oldStart, oldLen)} +${range(newStart, newLen)} @@`,
      lines,
    };
  });
}

function positionBefore(script: Script, idx: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let i = 0; i < idx; i++) {
    const op = script[i] as Op;
    if (op.type !== 'ins') x++;
    if (op.type !== 'del') y++;
  }
  return { x, y };
}

export function unifiedText(script: Script, a: readonly string[], b: readonly string[], context = 3, names = ['a', 'b']): string {
  const hs = hunks(script, a, b, context);
  if (hs.length === 0) return '';
  const body = hs.map((h) => [h.header, ...h.lines].join('\n')).join('\n');
  return `--- ${names[0]}\n+++ ${names[1]}\n${body}\n`;
}

export interface Segment {
  type: Op['type'];
  text: string;
}

/** Character-mode rendering: runs of kept, deleted and inserted characters. */
export function segments(script: Script, a: readonly string[], b: readonly string[]): Segment[] {
  const out: Segment[] = [];
  for (const op of script) {
    const text = op.type === 'ins' ? (b[op.b] as string) : (a[op.a] as string);
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += text;
    else out.push({ type: op.type, text });
  }
  return out;
}

/** `wdiff`-style one-line rendering: [-deleted-]{+inserted+}. */
export function inlineText(script: Script, a: readonly string[], b: readonly string[]): string {
  return segments(script, a, b)
    .map((s) => (s.type === 'eq' ? s.text : s.type === 'del' ? `[-${s.text}-]` : `{+${s.text}+}`))
    .join('');
}
