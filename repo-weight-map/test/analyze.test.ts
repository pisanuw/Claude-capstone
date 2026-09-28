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

  it('cleans paths and ignores empty ones', () => {
    const a = analyze([{ path: '\\src\\a.ts', size: 3 }, { path: '', size: 5 }, { path: 'b', size: Number.NaN }]);
    expect(a.fileCount).toBe(2);
    expect(a.totalBytes).toBe(3);
    expect(a.findings).toEqual([]);
    expect(detect([])).toEqual([]);
  });
});
