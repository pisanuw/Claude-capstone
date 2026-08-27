import { beforeEach, describe, expect, it } from 'vitest';
import { EXAMPLES, getExample } from '../src/core/examples';
import { resetGeneIds, segmentPrompt } from '../src/core/segment';
import { lintGenome } from '../src/core/lint';

beforeEach(() => resetGeneIds());

describe('bundled examples', () => {
  it('every example has an id, label, and non-trivial text', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(EXAMPLES.map((e) => e.id));
    expect(ids.size).toBe(EXAMPLES.length);
    for (const e of EXAMPLES) {
      expect(e.label).not.toBe('');
      expect(e.text.length).toBeGreaterThan(40);
    }
  });

  it('getExample finds by id and misses gracefully', () => {
    expect(getExample('code-review')?.label).toContain('Code review');
    expect(getExample('nope')).toBeUndefined();
  });

  it('code-review example covers at least five gene types', () => {
    const genes = segmentPrompt(getExample('code-review')!.text);
    const types = new Set(genes.map((g) => g.type));
    expect(types.size).toBeGreaterThanOrEqual(5);
    expect(types.has('role')).toBe(true);
    expect(types.has('task')).toBe(true);
    expect(types.has('constraint')).toBe(true);
    expect(types.has('format')).toBe(true);
  });

  it('lesson-plan example resolves its labeled sections', () => {
    const genes = segmentPrompt(getExample('lesson-plan')!.text);
    const types = genes.map((g) => g.type);
    expect(types).toContain('role');
    expect(types).toContain('context');
    expect(types).toContain('task');
    expect(types).toContain('constraint');
    expect(types).toContain('format');
  });

  it('json-extract example includes an example gene', () => {
    const genes = segmentPrompt(getExample('json-extract')!.text);
    expect(genes.some((g) => g.type === 'example')).toBe(true);
  });

  it('the messy example fires at least four lint findings', () => {
    const genes = segmentPrompt(getExample('messy')!.text);
    expect(lintGenome(genes).length).toBeGreaterThanOrEqual(4);
  });
});
