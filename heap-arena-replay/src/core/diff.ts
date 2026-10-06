// Compares the addresses a student's allocator returned against the reference
// replay, and checks the student's own trace for alignment, bounds and
// overlap bugs that are wrong under any policy.

import { adjustedSize, alignment, hex, type HeapConfig } from './heap';
import { describeOp, runTrace, type Op, type ParsedTrace, type Run } from './trace';

export interface StudentBlock {
  id: number;
  bp: number;
  req: number;
  /** Block size the reference would use; the student block is assumed at least this big. */
  asize: number;
}

export interface DiffStep {
  index: number;
  op: Op;
  reference: number | null | undefined;
  student: number | null | undefined;
  /** Student blocks live after this op (by their own addresses). */
  live: StudentBlock[];
  /** Hard errors independent of policy. */
  errors: string[];
  /** Differs from the reference (not an error, just a different policy or bug). */
  diverges: boolean;
}

export interface DiffResult {
  steps: DiffStep[];
  firstDivergence: number | null;
  firstError: number | null;
  matched: number;
  compared: number;
  run: Run;
}

export function diffTraces(parsed: ParsedTrace, cfg: HeapConfig): DiffResult {
  const run = runTrace(parsed.ops, cfg);
  const live = new Map<number, StudentBlock>();
  const steps: DiffStep[] = [];
  let firstDivergence: number | null = null;
  let firstError: number | null = null;
  let matched = 0;
  let compared = 0;
  const align = alignment(cfg);
  parsed.ops.forEach((op, index) => {
    const ev = run.steps[index].event;
    const reference = ev.kind === 'free' ? undefined : ev.result;
    const student = parsed.addresses.has(index) ? parsed.addresses.get(index)! : undefined;
    const errors: string[] = [];
    let diverges = false;
    if (op.kind === 'free') {
      live.delete(op.id);
    } else if (student !== undefined) {
      const req = op.size;
      compared += 1;
      const asize = adjustedSize(op.size, cfg);
      if (student === 0) {
        if (reference !== null) errors.push(`${describeOp(op)} returned NULL but a ${asize}-byte block fits under ${cfg.fit}-fit`);
        live.delete(op.id);
      } else {
        if (student % align !== 0) errors.push(`${hex(student)} is not ${align}-byte aligned`);
        if (student < cfg.word * 2 || student + req > cfg.heapSize - cfg.word) {
          errors.push(`${hex(student)} + ${req} bytes does not fit inside the ${cfg.heapSize}-byte heap`);
        }
        for (const other of live.values()) {
          if (other.id === op.id) continue;
          const lo = student - cfg.word;
          const hi = student + req + cfg.word;
          const olo = other.bp - cfg.word;
          const ohi = other.bp + other.req + cfg.word;
          if (lo < ohi && olo < hi) {
            errors.push(`block p${op.id} at ${hex(student)} overlaps live block p${other.id} at ${hex(other.bp)} (${other.req} bytes)`);
          }
        }
        live.set(op.id, { id: op.id, bp: student, req, asize });
      }
      if (reference === student || (reference === null && student === 0)) matched += 1;
      else diverges = true;
    } else if (typeof reference === 'number') {
      // No student address: carry the reference so later overlap checks stay meaningful.
      live.set(op.id, { id: op.id, bp: reference, req: op.size, asize: adjustedSize(op.size, cfg) });
    }
    if (errors.length > 0 && firstError === null) firstError = index;
    if (diverges && firstDivergence === null) firstDivergence = index;
    steps.push({ index, op, reference, student, live: [...live.values()].sort((a, b) => a.bp - b.bp), errors, diverges });
  });
  return { steps, firstDivergence, firstError, matched, compared, run };
}

/** Annotates a trace with the reference addresses, which is also the student format. */
export function annotateTrace(ops: Op[], run: Run): string {
  return ops
    .map((op, i) => {
      const ev = run.steps[i].event;
      if (op.kind === 'free' || ev.kind === 'free') return `f ${op.id}`;
      const addr = ev.result === null ? 'NULL' : hex(ev.result);
      return `${op.kind === 'malloc' ? 'a' : 'r'} ${op.id} ${op.size} -> ${addr}`;
    })
    .join('\n');
}
