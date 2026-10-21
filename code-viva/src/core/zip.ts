/**
 * Submission exports. Three layouts are recognised:
 *
 * - Gradescope: `submission_<id>/...` folders plus `submission_metadata.yml`
 *   naming the submitters.
 * - Canvas: flat files named `<login>_<ids>_<original name>`, sometimes with
 *   `LATE_` and sometimes a nested zip per student, which is unpacked.
 * - Folders: one top-level folder per student (a GitHub Classroom clone, or
 *   anything hand-made). An optional `git-log.txt` (output of
 *   `git log --numstat`) inside a folder supplies its commit history.
 */

import { unzipSync, strFromU8 } from 'fflate';
import { isCode } from './code';
import { parseGitLog } from './commits';
import type { SourceFile, Submission } from './types';

export type Layout = 'gradescope' | 'canvas' | 'folders';

export interface ImportResult {
  layout: Layout;
  submissions: Submission[];
  skipped: number;
}

const MAX_FILE = 200_000;
const GIT_LOG = /(?:^|\/)(?:git-?log|commits|\.gitlog)(?:\.txt)?$/i;

function junk(path: string): boolean {
  return /(?:^|\/)(?:__MACOSX|\.git|node_modules|\.idea|\.vscode|__pycache__)\//.test(path) || /(?:^|\/)\.DS_Store$/.test(path) || path.endsWith('/');
}

function text(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_FILE) return null;
  if (bytes.subarray(0, 8000).includes(0)) return null;
  return strFromU8(bytes);
}

/** Minimal reader for the YAML Gradescope writes: maps submission folder to submitter names. */
export function gradescopeNames(yml: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  for (const line of yml.split(/\r?\n/)) {
    const key = /^(submission_\d+):\s*$/.exec(line);
    if (key) {
      current = key[1]!;
      continue;
    }
    const name = /^\s*-?\s*:name:\s*['"]?(.*?)['"]?\s*$/.exec(line);
    if (current && name) out.set(current, out.has(current) ? `${out.get(current)} & ${name[1]}` : name[1]!);
  }
  return out;
}

function build(groups: Map<string, { name: string; files: Map<string, Uint8Array> }>): { submissions: Submission[]; skipped: number } {
  const submissions: Submission[] = [];
  let skipped = 0;
  for (const [id, g] of groups) {
    const files: SourceFile[] = [];
    let log = '';
    for (const [path, bytes] of g.files) {
      const t = text(bytes);
      if (t === null) {
        skipped++;
        continue;
      }
      if (GIT_LOG.test(path)) log += `${t}\n`;
      else if (isCode(path)) files.push({ path, text: t });
      else skipped++;
    }
    if (files.length) submissions.push({ id, student: g.name, files: files.sort((a, b) => a.path.localeCompare(b.path)), commits: parseGitLog(log) });
  }
  return { submissions: submissions.sort((a, b) => a.student.localeCompare(b.student)), skipped };
}

/**
 * Drops a folder every entry sits inside. At the top level a root is only
 * dropped while something below it is still in a folder (the student folders);
 * inside a student's own nested zip it is always dropped.
 */
function stripCommonRoot(entries: [string, Uint8Array][], keepFolders: boolean): [string, Uint8Array][] {
  for (;;) {
    const first = entries[0]?.[0].split('/')[0];
    if (!first || !entries.every(([p]) => p.startsWith(`${first}/`))) return entries;
    if (keepFolders && !entries.some(([p]) => p.split('/').length > 2)) return entries;
    entries = entries.map(([p, b]) => [p.slice(first.length + 1), b]);
  }
}

const CANVAS = /^([a-z0-9-]+)_(?:LATE_)?\d+_\d+_(.+)$/i;

export function readSubmissionsZip(bytes: Uint8Array): ImportResult {
  let entries: [string, Uint8Array][] = Object.entries(unzipSync(bytes)).filter(([p]) => !junk(p));
  entries = stripCommonRoot(entries, true);
  const groups = new Map<string, { name: string; files: Map<string, Uint8Array> }>();
  const group = (id: string, name: string) => {
    if (!groups.has(id)) groups.set(id, { name, files: new Map() });
    return groups.get(id)!;
  };

  const meta = entries.find(([p]) => /(?:^|\/)submission_metadata\.ya?ml$/.test(p));
  if (meta || entries.some(([p]) => /^submission_\d+\//.test(p))) {
    const names = meta ? gradescopeNames(strFromU8(meta[1])) : new Map<string, string>();
    for (const [p, b] of entries) {
      const m = /^(submission_\d+)\/(.+)$/.exec(p);
      if (m) group(m[1]!, names.get(m[1]!) ?? m[1]!).files.set(m[2]!, b);
    }
    return { layout: 'gradescope', ...build(groups) };
  }

  const flat = entries.filter(([p]) => !p.includes('/'));
  if (flat.length && flat.filter(([p]) => CANVAS.test(p)).length >= flat.length / 2) {
    for (const [p, b] of flat) {
      const m = CANVAS.exec(p);
      if (!m) continue;
      const g = group(m[1]!.toLowerCase(), m[1]!);
      if (/\.zip$/i.test(m[2]!)) {
        try {
          for (const [inner, ib] of stripCommonRoot(Object.entries(unzipSync(b)).filter(([ip]) => !junk(ip)), false)) g.files.set(inner, ib);
        } catch {
          // A corrupt nested zip leaves the student with whatever else they uploaded.
        }
      } else {
        g.files.set(m[2]!.replace(/-\d+(\.\w+)$/, '$1'), b);
      }
    }
    return { layout: 'canvas', ...build(groups) };
  }

  for (const [p, b] of entries) {
    const slash = p.indexOf('/');
    if (slash < 0) continue;
    const folder = p.slice(0, slash);
    group(folder, folder).files.set(p.slice(slash + 1), b);
  }
  return { layout: 'folders', ...build(groups) };
}
