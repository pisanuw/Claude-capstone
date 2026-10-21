/**
 * Commit history: parse `git log --numstat` text (as students or export
 * scripts can produce it) and compute the simple statistics the MVP asks
 * about. Nothing here is an accusation: a flagged commit becomes a question
 * the student is invited to explain.
 */

import { isCode } from './code';
import type { Commit } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number | string, w = 2) => String(n).padStart(w, '0');

function offset(raw: string): string {
  if (raw === 'Z') return 'Z';
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(raw);
  return m ? `${m[1]}${m[2]}:${m[3]}` : 'Z';
}

/**
 * Normalises the date formats `git log` prints (default, --date=iso and
 * --date=iso-strict) to ISO 8601 that keeps the committer's own UTC offset.
 */
export function parseGitDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset(m[7] ?? 'Z')}`;
  m = /^(?:\w{3}\s+)?(\w{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})\s*([+-]\d{4})?$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[1]!);
    if (month < 0) return null;
    return `${m[6]}-${pad(month + 1)}-${pad(m[2]!)}T${pad(m[3]!)}:${m[4]}:${m[5]}${offset(m[7] ?? 'Z')}`;
  }
  return null;
}

/** Parses `git log --numstat` output (any --date format above). Commits come back oldest first. */
export function parseGitLog(text: string): Commit[] {
  const commits: Commit[] = [];
  let cur: Commit | null = null;
  let inMessage = false;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const head = /^commit ([0-9a-f]{7,40})\b/.exec(line);
    if (head) {
      cur = { sha: head[1]!, author: '', date: '', message: '', added: 0, deleted: 0, files: [] };
      commits.push(cur);
      inMessage = false;
      continue;
    }
    if (!cur) continue;
    let m: RegExpExecArray | null;
    if ((m = /^Author:\s*(.*?)\s*(?:<[^>]*>)?$/.exec(line))) cur.author = m[1]!;
    else if ((m = /^(?:Author)?Date:\s*(.*)$/.exec(line))) cur.date = parseGitDate(m[1]!) ?? '';
    else if (/^Merge:/.test(line)) continue;
    else if ((m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line))) {
      const added = m[1] === '-' ? 0 : Number(m[1]);
      cur.added += added;
      cur.deleted += m[2] === '-' ? 0 : Number(m[2]);
      cur.files.push({ path: m[3]!, added });
      inMessage = false;
    } else if (/^ {4}/.test(line)) {
      if (!inMessage && !cur.message) inMessage = true;
      if (inMessage) cur.message = cur.message ? `${cur.message}\n${line.slice(4)}` : line.slice(4);
    }
  }
  return commits.filter((c) => c.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export function isBot(author: string): boolean {
  return /\[bot\]|^github-classroom|^dependabot/i.test(author);
}

/** Re-expresses a UTC instant in a fixed UTC offset (minutes east of UTC), keeping the offset in the string. */
export function withOffset(iso: string, minutes: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const local = new Date(t + minutes * 60_000).toISOString().slice(0, 19);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The committer's own wall-clock hour, read from the ISO string so their timezone is respected. */
export function localHour(iso: string): number {
  return Number(iso.slice(11, 13));
}

export interface CommitEvent {
  kind: 'bulk' | 'late' | 'single' | 'deadline';
  sha: string;
  date: string;
  added: number;
  /** The file that received most of the lines. */
  file: string | null;
  severity: 1 | 2 | 3;
  reason: string;
}

export interface CommitStats {
  count: number;
  first: string | null;
  last: string | null;
  spanHours: number;
  totalAdded: number;
  /** Share of all added code lines that arrived in the single largest commit. */
  largestShare: number;
  events: CommitEvent[];
}

function codeAdded(c: Commit): number {
  const code = c.files.filter((f) => isCode(f.path));
  return code.length ? code.reduce((s, f) => s + f.added, 0) : c.files.length ? 0 : c.added;
}

function mainFile(c: Commit): string | null {
  const best = [...c.files].filter((f) => isCode(f.path)).sort((a, b) => b.added - a.added)[0];
  return best ? best.path : null;
}

function clock(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * Statistics plus "worth asking about" events. Thresholds: a bulk commit adds
 * at least 120 code lines and 40% of everything added; a late commit is
 * between 00:00 and 04:59 in the committer's timezone with 20+ lines; a
 * single-commit history has one commit carrying 80%+ of 20 or more code lines; a deadline
 * rush lands 50%+ of the code in the hour before the given deadline.
 */
export function commitStats(all: Commit[], deadline?: string): CommitStats {
  // Starter code pushed by GitHub Classroom (or any bot) is not the student's work.
  const commits = all.filter((c) => !isBot(c.author));
  const totalAdded = commits.reduce((s, c) => s + codeAdded(c), 0);
  const events: CommitEvent[] = [];
  let largest = 0;
  for (const c of commits) {
    const added = codeAdded(c);
    largest = Math.max(largest, added);
    const short = c.sha.slice(0, 7);
    const file = mainFile(c);
    const where = file ? ` to ${file}` : '';
    if (added >= 120 && totalAdded > 0 && added / totalAdded >= 0.4 && commits.length > 1) {
      events.push({ kind: 'bulk', sha: c.sha, date: c.date, added, file, severity: 2, reason: `Commit ${short} added ${added} lines${where} in one step (${Math.round((100 * added) / totalAdded)}% of all code).` });
    }
    const hour = localHour(c.date);
    if (hour < 5 && added >= 20) {
      events.push({ kind: 'late', sha: c.sha, date: c.date, added, file, severity: 1, reason: `Commit ${short} at ${clock(c.date)} local time added ${added} lines${where}.` });
    }
  }
  const big = commits.length ? commits.reduce((a, b) => (codeAdded(b) > codeAdded(a) ? b : a)) : null;
  const bulk = events.find((e) => e.kind === 'bulk' && e.sha === big?.sha);
  if (big && totalAdded >= 20 && largest / totalAdded >= 0.8) {
    // One commit with most of the code is the strongest signal; it replaces its own bulk event.
    if (bulk) events.splice(events.indexOf(bulk), 1);
    events.push({
      kind: 'single',
      sha: big.sha,
      date: big.date,
      added: codeAdded(big),
      file: mainFile(big),
      severity: commits.length === 1 ? 3 : 2,
      reason: commits.length === 1 ? `The whole submission arrived in one commit (${big.sha.slice(0, 7)}, ${codeAdded(big)} lines).` : `${Math.round((100 * largest) / totalAdded)}% of the code arrived in commit ${big.sha.slice(0, 7)}.`,
    });
  }
  if (deadline && totalAdded > 0) {
    const end = Date.parse(deadline);
    const rush = commits.filter((c) => {
      const t = Date.parse(c.date);
      return t <= end && end - t <= 3_600_000;
    });
    const rushed = rush.reduce((s, c) => s + codeAdded(c), 0);
    if (rush.length && rushed / totalAdded >= 0.5) {
      const last = rush[rush.length - 1]!;
      events.push({ kind: 'deadline', sha: last.sha, date: last.date, added: rushed, file: mainFile(last), severity: 1, reason: `${Math.round((100 * rushed) / totalAdded)}% of the code was committed in the hour before the deadline.` });
    }
  }
  events.sort((a, b) => b.severity - a.severity || b.added - a.added);
  const first = commits[0]?.date ?? null;
  const last = commits[commits.length - 1]?.date ?? null;
  return {
    count: commits.length,
    first,
    last,
    spanHours: first && last ? (Date.parse(last) - Date.parse(first)) / 3_600_000 : 0,
    totalAdded,
    largestShare: totalAdded ? largest / totalAdded : 0,
    events,
  };
}
