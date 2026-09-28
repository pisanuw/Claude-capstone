import { describe, expect, it } from 'vitest';
import { alreadyCovered, buildGitignoreDiff, normalizePattern, parseGitignore } from '../src/core/gitignore.js';

describe('gitignore helpers', () => {
  it('parses lines, skipping comments and blanks', () => {
    expect(parseGitignore('# c\n\n node_modules/ \n*.log\r\n')).toEqual(['node_modules/', '*.log']);
  });
  it('normalizes equivalent spellings', () => {
    expect(normalizePattern('/dist/')).toBe('dist');
    expect(normalizePattern('**/node_modules/')).toBe('node_modules');
    expect(alreadyCovered(['/dist'], 'dist/')).toBe(true);
    expect(alreadyCovered(['build/'], 'dist/')).toBe(false);
  });
  it('builds the block and a unified diff', () => {
    const d = buildGitignoreDiff('*.pyc\n', ['*.pyc', 'venv/', 'venv/', '/venv', '.env']);
    expect(d.added).toEqual(['venv/', '.env']);
    expect(d.alreadyPresent).toEqual(['*.pyc']);
    expect(d.block).toBe('\n# Added by Repo Weight Map\nvenv/\n.env\n');
    expect(d.unified.split('\n')).toEqual([
      '--- a/.gitignore',
      '+++ b/.gitignore',
      '@@ -1,1 +1,5 @@',
      ' *.pyc',
      '+',
      '+# Added by Repo Weight Map',
      '+venv/',
      '+.env',
    ]);
  });
  it('handles a missing .gitignore and nothing to add', () => {
    const d = buildGitignoreDiff('', ['a/']);
    expect(d.unified).toContain('@@ -0,0 +1,3 @@');
    const none = buildGitignoreDiff('a/\n', ['a/']);
    expect(none.added).toEqual([]);
    expect(none.block).toBe('');
    expect(none.unified).toBe('');
  });
});
