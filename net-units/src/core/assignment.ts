/**
 * Assignment import/validation, anonymous codenames for the guessing round,
 * vote tallies and the anonymized annotation export.
 */
import { type Assignment, type AuthorKind, type Solution, type SolutionStat, type SourceFile, normalizePath } from './analyze';

const KINDS: AuthorKind[] = ['student', 'reference', 'ai', 'unknown'];

function asFiles(v: unknown, where: string): SourceFile[] {
  if (!Array.isArray(v)) throw new Error(`${where} must be a list of files`);
  return v.map((f, i) => {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') {
      throw new Error(`${where}[${i}] needs a string path and content`);
    }
    return { path: normalizePath(f.path), content: f.content };
  });
}

/** Parses an exported assignment, rejecting anything the app could not display. */
export function parseAssignment(json: string): Assignment {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('not valid JSON');
  }
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== 'object') throw new Error('expected an object');
  if (!Array.isArray(r.solutions)) throw new Error('solutions must be a list');
  const testsTotal = Number(r.testsTotal ?? 0);
  if (!Number.isInteger(testsTotal) || testsTotal < 0) throw new Error('testsTotal must be a whole number');
  const ids = new Set<string>();
  const solutions: Solution[] = r.solutions.map((s: Record<string, unknown>, i: number) => {
    let id = typeof s.id === 'string' && s.id ? s.id : `s${i + 1}`;
    while (ids.has(id)) id += '-2';
    ids.add(id);
    const passed = s.testsPassed === null || s.testsPassed === undefined ? null : Number(s.testsPassed);
    if (passed !== null && (!Number.isFinite(passed) || passed < 0)) throw new Error(`solution ${i + 1}: bad testsPassed`);
    return {
      id,
      label: typeof s.label === 'string' && s.label ? s.label : `Solution ${i + 1}`,
      author: KINDS.includes(s.author as AuthorKind) ? (s.author as AuthorKind) : 'unknown',
      note: typeof s.note === 'string' ? s.note : '',
      testsPassed: passed === null ? null : Math.min(passed, testsTotal || passed),
      files: asFiles(s.files, `solution ${i + 1} files`),
    };
  });
  return {
    title: typeof r.title === 'string' && r.title ? r.title : 'Untitled assignment',
    description: typeof r.description === 'string' ? r.description : '',
    testsTotal,
    starter: asFiles(r.starter ?? [], 'starter'),
    solutions,
  };
}

/** Removes a top-level folder shared by every path (what a folder upload adds). */
export function stripCommonRoot(files: SourceFile[]): SourceFile[] {
  const paths = files.map((f) => normalizePath(f.path));
  if (!paths.length || paths.some((p) => !p.includes('/'))) return files.map((f, i) => ({ ...f, path: paths[i] as string }));
  const first = (paths[0] as string).split('/')[0] as string;
  if (!paths.every((p) => p.startsWith(`${first}/`))) return files.map((f, i) => ({ ...f, path: paths[i] as string }));
  return files.map((f, i) => ({ ...f, path: (paths[i] as string).slice(first.length + 1) }));
}

/** Seeded Fisher-Yates so the anonymous order is stable for one class session. */
export function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function codename(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `Solution ${index < 26 ? letters[index] : index + 1}`;
}

/** Codename per solution id, in a seeded random order. */
export function codenames(solutions: Solution[], seed: number): Map<string, string> {
  return new Map(shuffled(solutions.map((s) => s.id), seed).map((id, i) => [id, codename(i)]));
}

export interface Tally {
  ai: number;
  human: number;
}

export type Votes = Record<string, Tally>;

export interface RevealRow {
  id: string;
  votes: Tally;
  actual: 'ai' | 'human' | 'unknown';
  /** Share of votes that were right, or null when nobody voted or the author is unknown. */
  correct: number | null;
}

export function reveal(solutions: Solution[], votes: Votes): RevealRow[] {
  return solutions.map((s) => {
    const v = votes[s.id] ?? { ai: 0, human: 0 };
    const actual = s.author === 'ai' ? 'ai' : s.author === 'unknown' ? 'unknown' : 'human';
    const total = v.ai + v.human;
    const correct = actual === 'unknown' || total === 0 ? null : (actual === 'ai' ? v.ai : v.human) / total;
    return { id: s.id, votes: v, actual, correct };
  });
}

/**
 * Markdown for a discussion section: codenames instead of names, the metrics,
 * and every added or deleted hunk with a blank annotation line underneath.
 */
export function annotationMarkdown(
  a: Assignment,
  stats: SolutionStat[],
  names: Map<string, string>,
  revealAuthors: boolean,
): string {
  const out: string[] = [`# ${a.title}: where did the extra code earn its keep?`, ''];
  out.push(
    'For each hunk, write **earns its keep** (tests, error handling, clarity) or **does not** (repetition, dead branches, ceremony) and one sentence why.',
    '',
  );
  const byName = [...a.solutions].sort((x, y) => (names.get(x.id) ?? '').localeCompare(names.get(y.id) ?? ''));
  for (const s of byName) {
    const st = stats.find((x) => x.id === s.id);
    if (!st) continue;
    const who = revealAuthors ? ` (${s.author === 'ai' ? 'AI' : s.author})` : '';
    out.push(`## ${names.get(s.id) ?? s.id}${who}`, '');
    const tests = s.testsPassed === null ? 'not entered' : `${s.testsPassed}/${a.testsTotal}`;
    out.push(
      `Net units: **${st.net}** (+${st.added} / -${st.deleted}), net lines: ${st.netLines}, new branches: ${st.addedBranches}, duplicated: ${Math.round(st.duplication * 100)}%, tests: ${tests}`,
      '',
    );
    for (const f of st.files) {
      const hunks: string[][] = [];
      let cur: string[] | null = null;
      for (const d of f.diff) {
        if (d.op === 'equal') {
          cur = null;
          continue;
        }
        if (!cur) {
          cur = [];
          hunks.push(cur);
        }
        cur.push(`${d.op === 'add' ? '+' : '-'} ${d.text}`);
      }
      hunks.forEach((h, i) => {
        out.push(`### ${f.path}, hunk ${i + 1}`, '', `\`\`\`diff`, ...h, '```', '', '> Annotation: ', '');
      });
      if (!hunks.length) out.push(`_${f.path}: no changes_`, '');
    }
  }
  return out.join('\n');
}
