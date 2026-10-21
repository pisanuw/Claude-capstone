import { describe, expect, it } from 'vitest';
import { commitStats, isBot, localHour, parseGitDate, parseGitLog, withOffset } from '../src/core/commits';
import type { Commit } from '../src/core/types';

const LOG = `commit 9f8e7d6c5b4a39210000000000000000000000aa
Author: Ben Okafor <ben@example.edu>
Date:   Thu Oct 2 02:47:10 2026 -0700

    done
    second line

86\t3\tlinked_list.py
-\t-\tlogo.png

commit 8e7d6c5b4a392110000000000000000000000bb
Merge: abc def
Author: Ben Okafor <ben@example.edu>
Date:   2026-10-01 18:00:00 -0700

    first

10\t0\tlinked_list.py
`;

const c = (sha: string, date: string, added: number, author = 'S', path = 'a.py'): Commit => ({ sha, author, date, message: '', added, deleted: 0, files: [{ path, added }] });

describe('git dates', () => {
  it('normalises default, iso and iso-strict formats, keeping the offset', () => {
    expect(parseGitDate('Thu Oct 2 02:47:10 2026 -0700')).toBe('2026-10-02T02:47:10-07:00');
    expect(parseGitDate('2026-10-01 18:00:00 +0530')).toBe('2026-10-01T18:00:00+05:30');
    expect(parseGitDate('2026-10-01T18:00:00Z')).toBe('2026-10-01T18:00:00Z');
    expect(parseGitDate('2026-10-01T18:00:00')).toBe('2026-10-01T18:00:00Z');
    expect(parseGitDate('Foo 2 02:47:10 2026')).toBeNull();
    expect(parseGitDate('yesterday')).toBeNull();
  });
  it('re-expresses UTC in a course offset', () => {
    expect(withOffset('2026-10-02T09:47:10Z', -420)).toBe('2026-10-02T02:47:10-07:00');
    expect(withOffset('2026-10-02T09:47:10Z', 330)).toBe('2026-10-02T15:17:10+05:30');
    expect(withOffset('garbage', 60)).toBe('garbage');
    expect(localHour('2026-10-02T02:47:10-07:00')).toBe(2);
  });
});

describe('parseGitLog', () => {
  it('reads numstat output, oldest first, skipping binary counts and merge lines', () => {
    const commits = parseGitLog(LOG);
    expect(commits.map((x) => x.sha.slice(0, 7))).toEqual(['8e7d6c5', '9f8e7d6']);
    expect(commits[1]).toMatchObject({ author: 'Ben Okafor', date: '2026-10-02T02:47:10-07:00', message: 'done\nsecond line', added: 86, deleted: 3 });
    expect(commits[1]!.files).toEqual([
      { path: 'linked_list.py', added: 86 },
      { path: 'logo.png', added: 0 },
    ]);
  });
  it('ignores text before the first commit and commits without dates', () => {
    expect(parseGitLog('noise\ncommit abcdef1\nAuthor: x\n')).toEqual([]);
  });
});

describe('commitStats', () => {
  it('flags a single-commit submission most strongly', () => {
    const s = commitStats([c('aaaaaaa1', '2026-10-02T14:00:00-07:00', 200)]);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ kind: 'single', severity: 3 });
    expect(s.largestShare).toBe(1);
  });
  it('flags bulk pastes and late-night commits, ignoring bot starter commits', () => {
    const s = commitStats([
      c('bot00001', '2026-09-28T09:00:00-07:00', 500, 'github-classroom[bot]'),
      c('aaaaaaa1', '2026-09-29T14:00:00-07:00', 100),
      c('aaaaaaa2', '2026-09-30T14:00:00-07:00', 60),
      c('bbbbbbb1', '2026-10-01T03:10:00-07:00', 150),
    ]);
    expect(s.count).toBe(3);
    expect(s.totalAdded).toBe(310);
    expect(s.events.map((e) => e.kind)).toEqual(['bulk', 'late']);
    expect(s.events[1]!.reason).toContain('03:10');
    expect(s.spanHours).toBeCloseTo(37.17, 1);
  });
  it('merges a bulk event into the single event for the same commit', () => {
    const s = commitStats([c('aaaaaaa1', '2026-09-29T14:00:00-07:00', 10), c('bbbbbbb1', '2026-10-01T13:00:00-07:00', 300)]);
    expect(s.events.map((e) => [e.kind, e.severity])).toEqual([['single', 2]]);
  });
  it('detects a deadline rush and counts only code files', () => {
    const rush = c('ccccccc1', '2026-10-02T23:30:00-07:00', 90);
    rush.files.push({ path: 'notes.md', added: 1000 });
    const s = commitStats([c('aaaaaaa1', '2026-09-29T14:00:00-07:00', 50), c('aaaaaaa2', '2026-09-30T14:00:00-07:00', 30), rush], '2026-10-02T23:59:00-07:00');
    expect(s.totalAdded).toBe(170);
    expect(s.events.map((e) => e.kind)).toEqual(['deadline']);
  });
  it('counts commits without per-file data by their total', () => {
    const bare: Commit = { sha: 'd1', author: 'S', date: '2026-09-29T14:00:00Z', message: '', added: 42, deleted: 0, files: [] };
    expect(commitStats([bare]).totalAdded).toBe(42);
  });
  it('handles an empty history', () => {
    expect(commitStats([])).toMatchObject({ count: 0, first: null, spanHours: 0, largestShare: 0, events: [] });
  });
  it('recognises bots', () => {
    expect(isBot('dependabot[bot]')).toBe(true);
    expect(isBot('Ana')).toBe(false);
  });
});
