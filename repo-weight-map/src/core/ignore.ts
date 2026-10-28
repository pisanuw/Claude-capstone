/**
 * Enough of gitignore's pattern language to answer "would git already exclude this path?" for the
 * root .gitignore of a walked folder: anchoring, directory-only rules, `**`, `*`, `?`, character
 * classes, `!` re-includes, and last-match-wins.
 *
 * Two things a browser cannot know, and this deliberately does not pretend to: nested .gitignore
 * files deeper in the tree (only the root one is read), and whether a matched file is nonetheless
 * *tracked* because it was committed before the rule existed — only `git ls-files` can say that.
 */

export interface IgnoreMatcher {
  /** True when the existing .gitignore already excludes this file path. */
  ignores(path: string): boolean;
  /** True when the .gitignore held no usable patterns. */
  empty: boolean;
}

interface CompiledRule {
  negated: boolean;
  /** The pattern ended with "/", so it only matches directories. */
  dirOnly: boolean;
  re: RegExp;
}

/** A matcher for a folder with no .gitignore: nothing is excluded. */
export const NO_IGNORES: IgnoreMatcher = { ignores: () => false, empty: true };

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Git drops trailing whitespace unless a backslash escapes it. */
function stripTrailingSpace(line: string): string {
  const m = /(\\*)[ \t]+$/.exec(line);
  if (!m) return line;
  // An odd number of backslashes escapes the first space, so that one space is part of the name.
  return m[1].length % 2 === 1 ? line.slice(0, m.index + m[1].length + 1) : line.slice(0, m.index);
}

/**
 * Translate one gitignore pattern into an anchored regex over a whole path.
 * `anchored` patterns are relative to the folder root; the rest may match at any depth.
 */
export function globToRegex(glob: string, anchored: boolean): RegExp {
  let re = anchored ? '' : '(?:.*/)?';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const after = glob[i + 2];
      const atSegmentStart = i === 0 || glob[i - 1] === '/';
      if (after === '/' && atSegmentStart) {
        re += '(?:[^/]+/)*'; // "**/" is zero or more directories
        i += 3;
      } else if (after === undefined && atSegmentStart) {
        re += '.*'; // a trailing "/**" is everything below
        i += 2;
      } else {
        re += '[^/]*'; // "**" anywhere else behaves like "*"
        i += 2;
      }
      continue;
    }
    if (c === '*') {
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if (c === '[') {
      const close = glob.indexOf(']', i + 2); // i+2 so "[]]" keeps its literal "]"
      if (close < 0) {
        re += '\\[';
        i += 1;
        continue;
      }
      // POSIX classes admit a bare "]" (as in "[]]"); a JS class needs it escaped, or "[]" reads as
      // an empty class that matches nothing.
      const body = glob.slice(i + 1, close).replace(/\\/g, '\\\\').replace(/]/g, '\\]');
      re += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
      i = close + 1;
      continue;
    }
    if (c === '\\' && i + 1 < glob.length) {
      re += escapeRe(glob[i + 1]);
      i += 2;
      continue;
    }
    re += escapeRe(c);
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

function compileLine(raw: string): CompiledRule | null {
  let line = stripTrailingSpace(raw);
  if (line === '' || line.startsWith('#')) return null;
  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  } else if (line.startsWith('\\#') || line.startsWith('\\!')) {
    line = line.slice(1);
  }
  let dirOnly = false;
  if (line.endsWith('/')) {
    dirOnly = true;
    line = line.slice(0, -1);
  }
  // A separator at the start or middle anchors the pattern to the root; one at the end does not.
  const anchored = line.includes('/');
  if (line.startsWith('/')) line = line.slice(1);
  if (line === '') return null;
  try {
    return { negated, dirOnly, re: globToRegex(line, anchored) };
  } catch {
    return null; // an unparseable character class: skip the line rather than break the analysis
  }
}

/** Last matching rule wins, which is how git resolves a `!` re-include. */
function matches(rules: CompiledRule[], path: string, isDir: boolean): boolean {
  let hit = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    if (r.re.test(path)) hit = !r.negated;
  }
  return hit;
}

export function compileGitignore(text: string): IgnoreMatcher {
  const rules: CompiledRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const rule = compileLine(raw);
    if (rule) rules.push(rule);
  }
  if (!rules.length) return NO_IGNORES;
  return {
    empty: false,
    ignores: (path: string): boolean => {
      // Git never descends into an excluded directory, so an excluded ancestor settles it and a
      // `!` rule deeper in the pattern list cannot bring the file back.
      const parts = path.split('/');
      for (let i = 0; i < parts.length; i += 1) {
        if (matches(rules, parts.slice(0, i + 1).join('/'), i < parts.length - 1)) return true;
      }
      return false;
    },
  };
}
