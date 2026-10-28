import type { Analysis, Category, FileRecord, Finding } from './types.js';
import { RULES, buildContext } from './rules.js';
import { buildTree, largestFiles, totalsByCategory } from './tree.js';
import { buildGitignoreDiff } from './gitignore.js';
import { NO_IGNORES, compileGitignore, type IgnoreMatcher } from './ignore.js';
import { normalizePath } from './format.js';

export interface AnalyzeOptions {
  /** Contents of the folder's existing .gitignore, if any. */
  existingGitignore?: string;
  /** Files at or above this size are flagged as large. Default 10 MB. */
  largeThreshold?: number;
  /** Rule ids the user has unticked; their bytes are not counted as reclaimable and their lines are not suggested. */
  disabledRules?: Set<string>;
}

export const DEFAULT_LARGE_THRESHOLD = 10 * 1024 * 1024;

/**
 * Run every rule over the files; each file is attributed to the first rule that matches it.
 * `ignore` decides which of a finding's files the folder's .gitignore already excludes, which is
 * what separates "this is in git and should not be" from "this is on disk and git already knows".
 */
export function detect(files: FileRecord[], largeThreshold = DEFAULT_LARGE_THRESHOLD, ignore: IgnoreMatcher = NO_IGNORES): Finding[] {
  const ctx = buildContext(files, largeThreshold);
  const byRule = new Map<string, Finding>();
  for (const f of files) {
    if (f.path.startsWith('.git/')) continue; // git internals are never a .gitignore matter
    for (const rule of RULES) {
      if (!rule.match(f, ctx)) continue;
      let finding = byRule.get(rule.id);
      if (!finding) {
        finding = {
          ruleId: rule.id,
          ecosystem: rule.ecosystem,
          title: rule.title,
          explanation: rule.explanation,
          kind: rule.kind,
          gitignore: [...rule.gitignore],
          files: [],
          bytes: 0,
          ignoredFiles: [],
          ignoredBytes: 0,
          coverage: 'none',
        };
        byRule.set(rule.id, finding);
      }
      finding.files.push(f.path);
      finding.bytes += f.size;
      if (ignore.ignores(f.path)) {
        finding.ignoredFiles.push(f.path);
        finding.ignoredBytes += f.size;
      }
      break;
    }
  }
  const findings = [...byRule.values()];
  for (const fd of findings) {
    fd.files.sort((a, b) => a.localeCompare(b));
    fd.ignoredFiles.sort((a, b) => a.localeCompare(b));
    fd.coverage = fd.ignoredFiles.length === 0 ? 'none' : fd.ignoredFiles.length === fd.files.length ? 'all' : 'partial';
  }
  // Secrets first (they matter regardless of size), then by bytes.
  findings.sort((a, b) => (a.kind === 'secret' ? -1 : b.kind === 'secret' ? 1 : b.bytes - a.bytes));
  return findings;
}

/** Full analysis of a file list: tree, category totals, findings, largest files, and the .gitignore diff. */
export function analyze(rawFiles: FileRecord[], opts: AnalyzeOptions = {}): Analysis {
  const files = rawFiles
    .map((f) => ({ path: normalizePath(f.path), size: Number.isFinite(f.size) && f.size > 0 ? f.size : 0 }))
    .filter((f) => f.path !== '');
  const largeThreshold = opts.largeThreshold ?? DEFAULT_LARGE_THRESHOLD;
  const disabled = opts.disabledRules ?? new Set<string>();

  const ignore = compileGitignore(opts.existingGitignore ?? '');
  const root = buildTree(files);
  const byCategory = totalsByCategory(root);
  const findings = detect(files, largeThreshold, ignore);
  const active = findings.filter((f) => !disabled.has(f.ruleId));
  const reclaimableBytes = active.reduce((s, f) => s + f.bytes, 0);
  const ignoredBytes = active.reduce((s, f) => s + f.ignoredBytes, 0);
  const gitignore = buildGitignoreDiff(opts.existingGitignore ?? '', active.flatMap(suggestedLines));

  return {
    root,
    totalBytes: root.size,
    fileCount: root.fileCount,
    byCategory,
    findings,
    largestFiles: largestFiles(files, 20),
    reclaimableBytes,
    ignoredBytes,
    actionableBytes: reclaimableBytes - ignoredBytes,
    afterBytes: root.size - reclaimableBytes,
    gitignore,
  };
}

/**
 * The .gitignore lines a finding asks for. A large file that is already ignored needs no line of
 * its own, so those are dropped; the generic rule patterns are left alone, because a pattern the
 * file already spells a different way (`node_modules/*` vs `node_modules/`) is still worth offering.
 */
export function suggestedLines(f: Finding): string[] {
  if (f.kind !== 'large') return f.gitignore;
  const ignored = new Set(f.ignoredFiles);
  return f.files.filter((p) => !ignored.has(p)).map((p) => `/${p}`);
}

export function categoryBytes(a: Analysis, c: Category): number {
  return a.byCategory[c]?.bytes ?? 0;
}
