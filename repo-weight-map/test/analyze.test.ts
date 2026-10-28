import { describe, expect, it } from 'vitest';
import { analyze, categoryBytes, detect } from '../src/core/analyze.js';
import { SAMPLE_GITIGNORE, sampleRepo } from '../src/core/sample.js';

describe('analyze', () => {
  it('produces a consistent analysis of the sample repo', () => {
    const files = sampleRepo();
    const a = analyze(files, { existingGitignore: SAMPLE_GITIGNORE });
    expect(a.fileCount).toBe(files.length);
    expect(a.totalBytes).toBe(files.reduce((s, f) => s + f.size, 0));
    expect(a.afterBytes).toBe(a.totalBytes - a.reclaimableBytes);
    expect(a.reclaimableBytes).toBeGreaterThan(a.totalBytes * 0.4);
    expect(a.largestFiles).toHaveLength(20);
    expect(a.largestFiles[0].path).toBe('.git/objects/pack/pack-8f1c.pack');
    const ids = a.findings.map((f) => f.ruleId);
    expect(ids[0]).toBe('secret-files');
    expect(ids).toEqual(expect.arrayContaining(['python-venv', 'node-modules', 'large-files', 'web-build', 'python-cache', 'os-cruft', 'editor-cruft', 'logs', 'python-build']));
    expect(a.gitignore.alreadyPresent).toEqual(['__pycache__/', '*.py[cod]']);
    expect(a.gitignore.added).toContain('venv/');
    expect(a.gitignore.added).toContain('/data/raw/train.csv');
    expect(a.gitignore.added).not.toContain('__pycache__/');
    expect(categoryBytes(a, 'vcs')).toBeGreaterThan(0);
    expect(categoryBytes(a, 'other')).toBeGreaterThanOrEqual(0);
    // each file is attributed to at most one finding
    const all = a.findings.flatMap((f) => f.files);
    expect(new Set(all).size).toBe(all.length);
  });

  it('sample is deterministic', () => {
    expect(sampleRepo()).toEqual(sampleRepo());
  });

  it('honours disabled rules and a custom threshold', () => {
    const files = [
      { path: 'data/big.bin', size: 2_000 },
      { path: 'node_modules/a.js', size: 500 },
      { path: 'src/a.ts', size: 10 },
    ];
    const base = analyze(files, { largeThreshold: 1_000 });
    expect(base.reclaimableBytes).toBe(2_500);
    expect(base.gitignore.added).toEqual(['/data/big.bin', 'node_modules/']);

    const off = analyze(files, { largeThreshold: 1_000, disabledRules: new Set(['large-files']) });
    expect(off.findings).toHaveLength(2); // findings are still listed
    expect(off.reclaimableBytes).toBe(500);
    expect(off.gitignore.added).toEqual(['node_modules/']);

    const highThreshold = analyze(files);
    expect(highThreshold.findings.map((f) => f.ruleId)).toEqual(['node-modules']);
  });

  it('does not call an already-ignored directory committed', () => {
    // The bug this guards: node_modules/ sat in .gitignore and the finding still read as an
    // accusation, with its bytes in the headline "should not be in git" number.
    const files = [
      { path: 'package.json', size: 2_000 },
      { path: 'src/index.ts', size: 40_000 },
      { path: 'node_modules/react/index.js', size: 90_000_000 },
      { path: 'node_modules/.bin/vite', size: 1_000 },
    ];
    const a = analyze(files, { existingGitignore: 'node_modules/\ndownloaded/\n*.log\n' });
    const nm = a.findings.find((f) => f.ruleId === 'node-modules');
    expect(nm?.coverage).toBe('all');
    expect(nm?.ignoredFiles).toEqual(['node_modules/.bin/vite', 'node_modules/react/index.js']);
    expect(nm?.ignoredBytes).toBe(90_001_000);
    expect(a.actionableBytes).toBe(0);
    expect(a.ignoredBytes).toBe(90_001_000);
    expect(a.reclaimableBytes).toBe(90_001_000); // still "does not belong in git", just not a to-do
    expect(a.gitignore.added).toEqual([]);
    expect(a.gitignore.alreadyPresent).toEqual(['node_modules/']);
  });

  it('splits a partly-covered finding and drops lines for already-ignored large files', () => {
    const files = [
      { path: 'venv/pyvenv.cfg', size: 100 },
      { path: 'venv/lib/mod.py', size: 400 },
      { path: 'venv/lib/__pycache__/mod.pyc', size: 500 },
      { path: 'data/big.bin', size: 4_000 },
      { path: 'data/huge.bin', size: 6_000 },
    ];
    const a = analyze(files, { existingGitignore: '__pycache__/\n/data/huge.bin\n', largeThreshold: 1_000 });
    const venv = a.findings.find((f) => f.ruleId === 'python-venv');
    expect(venv?.coverage).toBe('partial');
    expect(venv?.ignoredFiles).toEqual(['venv/lib/__pycache__/mod.pyc']);
    expect(venv?.ignoredBytes).toBe(500);

    const large = a.findings.find((f) => f.ruleId === 'large-files');
    expect(large?.coverage).toBe('partial');
    // The already-ignored large file gets no line of its own; the other one does.
    expect(a.gitignore.added).toContain('/data/big.bin');
    expect(a.gitignore.added).not.toContain('/data/huge.bin');
    expect(a.actionableBytes).toBe(a.reclaimableBytes - 6_500);
  });

  it('treats a folder with no .gitignore as covering nothing', () => {
    const a = analyze([{ path: 'node_modules/a.js', size: 500 }]);
    expect(a.findings[0].coverage).toBe('none');
    expect(a.ignoredBytes).toBe(0);
    expect(a.actionableBytes).toBe(a.reclaimableBytes);
  });

  it('cleans paths and ignores empty ones', () => {
    const a = analyze([{ path: '\\src\\a.ts', size: 3 }, { path: '', size: 5 }, { path: 'b', size: Number.NaN }]);
    expect(a.fileCount).toBe(2);
    expect(a.totalBytes).toBe(3);
    expect(a.findings).toEqual([]);
    expect(detect([])).toEqual([]);
  });
});
