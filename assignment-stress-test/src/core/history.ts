/**
 * Run history kept term over term. The library is plain JSON: the UI keeps it
 * in localStorage and exports it as a file a course coordinator can merge.
 */
import { normLabel } from './diff.js';
import { headline } from './report.js';
import type { Run } from './types.js';

export interface Library {
  version: 1;
  runs: Run[];
}

export const AGED_POINTS = 0.15;

export function emptyLibrary(): Library {
  return { version: 1, runs: [] };
}

export function assignmentKey(run: Pick<Run, 'assignment'>): string {
  return `${normLabel(run.assignment.course)}|${normLabel(run.assignment.title)}`;
}

export function addRun(lib: Library, run: Run): Library {
  return { ...lib, runs: [...lib.runs.filter((r) => r.id !== run.id), run] };
}

export function removeRun(lib: Library, id: string): Library {
  return { ...lib, runs: lib.runs.filter((r) => r.id !== id) };
}

export interface AssignmentHistory {
  key: string;
  title: string;
  course: string;
  runs: Run[];
  terms: { term: string; best: number | null; runs: number }[];
  /** Best score rose by at least AGED_POINTS from the first term to the last. */
  aged: boolean;
}

export function histories(lib: Library): AssignmentHistory[] {
  const groups = new Map<string, Run[]>();
  for (const r of [...lib.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = assignmentKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups].map(([key, runs]) => {
    const latest = runs[runs.length - 1];
    const termOrder: string[] = [];
    const termBest = new Map<string, { best: number | null; runs: number }>();
    for (const r of runs) {
      const t = r.term || 'No term';
      if (!termBest.has(t)) termOrder.push(t);
      // A term's figure is its latest run, so an edit-and-retest within the term counts.
      const prev = termBest.get(t);
      termBest.set(t, { best: headline(r).best, runs: (prev?.runs ?? 0) + 1 });
    }
    const terms = termOrder.map((term) => ({ term, ...(termBest.get(term) as { best: number | null; runs: number }) }));
    const first = terms.find((t) => t.best !== null)?.best ?? null;
    const last = [...terms].reverse().find((t) => t.best !== null)?.best ?? null;
    return {
      key,
      title: latest.assignment.title,
      course: latest.assignment.course,
      runs,
      terms,
      aged: terms.length > 1 && first !== null && last !== null && last - first >= AGED_POINTS,
    };
  });
}

function isRun(x: unknown): x is Run {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<Run>;
  return (
    typeof r.id === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.term === 'string' &&
    !!r.assignment &&
    typeof r.assignment.prompt === 'string' &&
    typeof r.assignment.rubricText === 'string' &&
    Array.isArray(r.cells)
  );
}

/** Parse an exported library or a single exported run. Throws with a readable message. */
export function parseLibrary(text: string): Library {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  if (isRun(data)) return { version: 1, runs: [data] };
  const d = data as Partial<Library>;
  if (!d || d.version !== 1 || !Array.isArray(d.runs)) throw new Error('That file is not an Assignment Stress Test export.');
  const runs = d.runs.filter(isRun);
  if (runs.length !== d.runs.length) throw new Error(`${d.runs.length - runs.length} run(s) in the file are malformed.`);
  return { version: 1, runs };
}

export function mergeLibraries(base: Library, incoming: Library): { lib: Library; added: number } {
  const ids = new Set(base.runs.map((r) => r.id));
  const fresh = incoming.runs.filter((r) => !ids.has(r.id));
  return { lib: { version: 1, runs: [...base.runs, ...fresh] }, added: fresh.length };
}

export function newRunId(now: Date, rand: () => number = Math.random): string {
  return `run-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.floor(rand() * 1e6).toString(36)}`;
}
