import type { GitignoreDiff } from './types.js';

/** Non-comment, non-blank lines of a .gitignore, trimmed. */
export function parseGitignore(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/** Normalize a pattern for comparison: strip a leading "/", a trailing "/", and any leading double-star slash prefixes. */
export function normalizePattern(p: string): string {
  let s = p.trim();
  while (s.startsWith('**/')) s = s.slice(3);
  if (s.startsWith('/')) s = s.slice(1);
  if (s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/** True when an existing .gitignore already has an equivalent of `line`. */
export function alreadyCovered(existing: string[], line: string): boolean {
  const target = normalizePattern(line);
  return existing.some((e) => normalizePattern(e) === target);
}

/**
 * Compose the .gitignore additions for a set of suggested lines, in the order given, with
 * duplicates and lines already present dropped, plus a unified diff for people who like diffs.
 */
export function buildGitignoreDiff(existingText: string, suggested: string[]): GitignoreDiff {
  const existing = parseGitignore(existingText);
  const added: string[] = [];
  const alreadyPresent: string[] = [];
  const seen = new Set<string>();
  for (const line of suggested) {
    const key = normalizePattern(line);
    if (seen.has(key)) continue;
    seen.add(key);
    if (alreadyCovered(existing, line)) alreadyPresent.push(line);
    else added.push(line);
  }
  const block = added.length ? `\n# Added by Repo Weight Map\n${added.join('\n')}\n` : '';
  const oldLines = existingText === '' ? [] : existingText.replace(/\n$/, '').split('\n');
  const newLines = added.length ? [...oldLines, '', '# Added by Repo Weight Map', ...added] : oldLines;
  const unified = added.length
    ? [
        '--- a/.gitignore',
        '+++ b/.gitignore',
        `@@ -${oldLines.length ? 1 : 0},${oldLines.length} +${newLines.length ? 1 : 0},${newLines.length} @@`,
        ...oldLines.map((l) => ` ${l}`),
        ...newLines.slice(oldLines.length).map((l) => `+${l}`),
      ].join('\n')
    : '';
  return { added, alreadyPresent, block, unified };
}
