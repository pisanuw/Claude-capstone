import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { gradescopeNames, readSubmissionsZip } from '../src/core/zip';

const PY = 'def f(x):\n    if x:\n        return 1\n    return 0\n';
const LOG = 'commit abcdef1234567\nAuthor: Ana <a@x>\nDate:   2026-10-01T10:00:00-07:00\n\n    first\n\n4\t0\tmain.py\n';
const zip = (files: Record<string, string | Uint8Array>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));

const YML = `submission_111:
  :submitters:
  - :name: Ana Ruiz
    :sid: '1'
  :created_at: 2026-10-01
submission_222:
  :submitters:
  - :name: 'Ben Okafor'
  - :name: Chen Wei
`;

describe('gradescope', () => {
  it('reads submitter names, joining group members', () => {
    const names = gradescopeNames(YML);
    expect(names.get('submission_111')).toBe('Ana Ruiz');
    expect(names.get('submission_222')).toBe('Ben Okafor & Chen Wei');
  });
  it('imports an export with a common root folder', () => {
    const res = readSubmissionsZip(
      zip({
        'assignment_9_export/submission_metadata.yml': YML,
        'assignment_9_export/submission_111/main.py': PY,
        'assignment_9_export/submission_111/git-log.txt': LOG,
        'assignment_9_export/submission_222/src/app.js': 'function g() {\n  return 1;\n}\n',
        'assignment_9_export/submission_222/README.md': '# hi',
        'assignment_9_export/submission_333/notes.txt': 'no code here',
        '__MACOSX/._junk': 'x',
      }),
    );
    expect(res.layout).toBe('gradescope');
    expect(res.submissions.map((s) => [s.id, s.student])).toEqual([
      ['submission_111', 'Ana Ruiz'],
      ['submission_222', 'Ben Okafor & Chen Wei'],
    ]);
    expect(res.submissions[0]!.commits).toHaveLength(1);
    expect(res.submissions[1]!.files[0]!.path).toBe('src/app.js');
    expect(res.skipped).toBe(2);
  });
  it('falls back to folder ids without metadata', () => {
    const res = readSubmissionsZip(zip({ 'submission_5/a.py': PY }));
    expect(res.submissions[0]!.student).toBe('submission_5');
  });
});

describe('canvas', () => {
  it('groups flat files by login, strips resubmission suffixes and unpacks nested zips', () => {
    const inner = zip({ 'proj/linked.py': PY, 'proj/bin.dat': new Uint8Array([0, 1, 2, 0]) });
    const res = readSubmissionsZip(
      zip({
        'ruizana_12345_67890_merge-1.py': PY,
        'ruizana_12345_67891_helpers.py': PY,
        'okaforben_LATE_222_333_project.zip': inner,
        'kimdana_444_555_broken.zip': strToU8('not a zip'),
        'kimdana_444_556_main.java': 'class A {\n  void f() {\n  }\n}\n',
        'stray.txt': 'x',
      }),
    );
    expect(res.layout).toBe('canvas');
    expect(res.submissions.map((s) => s.id)).toEqual(['kimdana', 'okaforben', 'ruizana']);
    expect(res.submissions.find((s) => s.id === 'ruizana')!.files.map((f) => f.path)).toEqual(['helpers.py', 'merge.py']);
    expect(res.submissions.find((s) => s.id === 'okaforben')!.files.map((f) => f.path)).toEqual(['linked.py']);
    expect(res.skipped).toBe(1);
  });
});

describe('folders', () => {
  it('treats each top-level folder as a student and skips oversized files', () => {
    const res = readSubmissionsZip(
      zip({
        'a4/ana/main.py': PY,
        'a4/ana/.git/config': 'x',
        'a4/ana/commits.txt': LOG,
        'a4/ben/main.py': PY,
        'a4/ben/huge.py': 'x'.repeat(250_000),
        'a4/README.md': 'top level file',
      }),
    );
    expect(res.layout).toBe('folders');
    expect(res.submissions.map((s) => s.id)).toEqual(['ana', 'ben']);
    expect(res.submissions[0]!.commits[0]!.sha).toBe('abcdef1234567');
    expect(res.submissions[1]!.files).toHaveLength(1);
    expect(res.skipped).toBe(1);
  });
});
