import { describe, expect, it } from 'vitest';
import { buildRelease, releaseProblems, releaseText, signatureMatches } from '../src/core/release';
import { packet, policy, TODAY } from './fixtures';

describe('release text', () => {
  it('names the records, the purpose, the parties and the waiver', () => {
    const t = releaseText(policy(), { student: 'Ada Lovelace', programs: [{ name: 'Alpha PhD', kind: 'PhD' }, { name: 'Beta MS', kind: '' }], scope: ['grades', 'conduct'], waive: true, date: TODAY });
    expect(t).toContain('I, Ada Lovelace, authorize Prof. Test of Test U');
    expect(t).toContain('- my grades and class rank in your courses');
    expect(t).toContain('- Alpha PhD (PhD)');
    expect(t).toContain('- Beta MS\n');
    expect(t).toContain('I waive my right');
    expect(t).toContain(`on ${TODAY}`);
  });

  it('handles empty choices and no waiver', () => {
    const t = releaseText({ professor: '', institution: '' }, { student: '', programs: [], scope: [], waive: false, date: TODAY });
    expect(t).toContain('I, (name), authorize the professor to');
    expect(t).toContain('(nothing selected)');
    expect(t).toContain('(no programs listed)');
    expect(t).toContain('I do not waive');
  });

  it('matches signatures ignoring case and spacing', () => {
    expect(signatureMatches(' ada  LOVELACE', 'Ada Lovelace')).toBe(true);
    expect(signatureMatches('Ada L.', 'Ada Lovelace')).toBe(false);
    expect(signatureMatches('', '')).toBe(false);
  });
});

describe('release problems', () => {
  it('passes a clean release', async () => {
    expect(await releaseProblems(await packet())).toEqual([]);
  });

  it('catches edits after signing, missing consent and mismatches', async () => {
    const p = await packet();
    const edited = { ...p, release: { ...p.release, text: p.release.text.replace('Alpha', 'Gamma') } };
    const problems = await releaseProblems(edited);
    expect(problems.some((x) => x.includes('edited after signing'))).toBe(true);
    expect(problems.some((x) => x.includes('"Alpha University PhD" is not named'))).toBe(true);

    const r = await buildRelease(policy(), { student: 'Someone Else', programs: p.programs, scope: [], waive: true, date: TODAY }, 'Ada', false, TODAY);
    const bad = await releaseProblems({ ...p, release: r });
    expect(bad).toEqual(expect.arrayContaining([expect.stringContaining('consent box'), expect.stringContaining('does not match the name'), expect.stringContaining('No records'), expect.stringContaining('different student')]));
  });
});
