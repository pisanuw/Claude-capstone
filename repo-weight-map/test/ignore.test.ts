import { describe, expect, it } from 'vitest';
import { NO_IGNORES, compileGitignore, globToRegex } from '../src/core/ignore.js';

const m = (text: string) => compileGitignore(text);

describe('compileGitignore', () => {
  it('excludes everything under a directory pattern, however it is spelled', () => {
    for (const pattern of ['node_modules/', 'node_modules', '/node_modules', '/node_modules/', '**/node_modules/', 'node_modules/*', 'node_modules/**']) {
      expect(m(pattern).ignores('node_modules/react/index.js'), pattern).toBe(true);
    }
    // `*/node_modules` is anchored one level down, so the root copy is not covered.
    expect(m('*/node_modules').ignores('node_modules/react/index.js')).toBe(false);
    expect(m('*/node_modules').ignores('packages/app/node_modules/x.js')).toBe(false);
    expect(m('*/node_modules').ignores('packages/node_modules/x.js')).toBe(true);
  });

  it('matches an unanchored pattern at any depth and an anchored one only at the root', () => {
    expect(m('__pycache__/').ignores('src/deep/__pycache__/a.pyc')).toBe(true);
    expect(m('/dist/').ignores('dist/app.js')).toBe(true);
    expect(m('/dist/').ignores('frontend/dist/app.js')).toBe(false);
    expect(m('a/b').ignores('a/b')).toBe(true);
    expect(m('a/b').ignores('x/a/b')).toBe(false);
  });

  it('honours directory-only patterns', () => {
    expect(m('build/').ignores('build/out.js')).toBe(true);
    expect(m('build/').ignores('build')).toBe(false); // a *file* named build is not covered
    expect(m('build').ignores('build')).toBe(true);
  });

  it('applies globs, character classes, and negated classes', () => {
    expect(m('*.log').ignores('logs/run.log')).toBe(true);
    expect(m('*.log').ignores('run.log.txt')).toBe(false);
    expect(m('*.py[cod]').ignores('a/b.pyc')).toBe(true);
    expect(m('*.py[cod]').ignores('a/b.pyx')).toBe(false);
    expect(m('[Ll]ibrary/').ignores('Library/x')).toBe(true);
    expect(m('*.py[!c]').ignores('a.pyo')).toBe(true);
    expect(m('*.py[!c]').ignores('a.pyc')).toBe(false);
    expect(m('cache?/').ignores('cache1/x')).toBe(true);
    expect(m('cache?/').ignores('cache12/x')).toBe(false);
    expect(m('a/**/c').ignores('a/b1/b2/c')).toBe(true);
    expect(m('a/**/c').ignores('a/c')).toBe(true);
    expect(m('a/**').ignores('a/b/c')).toBe(true);
    expect(m('a/**').ignores('a')).toBe(false);
  });

  it('resolves `!` by last match, but cannot re-include inside an excluded directory', () => {
    expect(m('*.log\n!keep.log').ignores('keep.log')).toBe(false);
    expect(m('!keep.log\n*.log').ignores('keep.log')).toBe(true); // order matters
    // Git never descends into an excluded directory, so the negation below is dead.
    expect(m('logs/\n!logs/keep.log').ignores('logs/keep.log')).toBe(true);
    expect(m('.env*\n!.env.example').ignores('.env.example')).toBe(false);
    expect(m('.env*\n!.env.example').ignores('.env')).toBe(true);
  });

  it('skips comments and blanks, and reads escaped leaders literally', () => {
    const c = m('# a comment\n\n   \n*.log\n');
    expect(c.ignores('x.log')).toBe(true);
    expect(c.ignores('x.txt')).toBe(false);
    expect(m('\\#notes.md').ignores('#notes.md')).toBe(true);
    expect(m('\\!bang.txt').ignores('!bang.txt')).toBe(true);
  });

  it('drops trailing whitespace unless it is escaped', () => {
    expect(m('build/   ').ignores('build/x')).toBe(true);
    expect(m('odd\\ ').ignores('odd ')).toBe(true);
  });

  it('reports an empty .gitignore and survives an unusable line', () => {
    expect(compileGitignore('').empty).toBe(true);
    expect(compileGitignore('# only a comment\n').empty).toBe(true);
    expect(compileGitignore('/\n').empty).toBe(true);
    expect(NO_IGNORES.ignores('anything')).toBe(false);
    expect(NO_IGNORES.empty).toBe(true);
    // An unclosed class is kept as a literal bracket rather than throwing.
    expect(m('a[b').ignores('a[b')).toBe(true);
    expect(m('[]]').ignores(']')).toBe(true);
    // A back-to-front range is not a valid JS class, so the line is skipped, not fatal.
    const bad = m('[z-a].txt\n*.tmp\n');
    expect(bad.ignores('a.txt')).toBe(false);
    expect(bad.ignores('a.tmp')).toBe(true);
  });

  it('treats a mid-segment `**` as a plain `*`', () => {
    expect(m('a**b').ignores('axxb')).toBe(true);
    expect(m('a**b').ignores('a/x/b')).toBe(false);
    expect(m('a**/b').ignores('ax/b')).toBe(true);
  });

  it('exposes the glob translation it is built on', () => {
    expect(globToRegex('node_modules', false).test('a/b/node_modules')).toBe(true);
    expect(globToRegex('a/b', true).test('a/b')).toBe(true);
    expect(globToRegex('a/b', true).test('x/a/b')).toBe(false);
  });
});
