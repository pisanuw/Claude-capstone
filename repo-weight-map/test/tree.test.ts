import { describe, expect, it } from 'vitest';
import { buildTree, findNode, largestFiles, totalsByCategory, visibleChildren } from '../src/core/tree.js';

const files = [
  { path: 'src/a.ts', size: 100 },
  { path: 'src/b.ts', size: 300 },
  { path: 'src/img/x.png', size: 1000 },
  { path: 'README.md', size: 50 },
  { path: './ignored/../x', size: 1 },
  { path: 'zero.txt', size: 0 },
  { path: 'neg.txt', size: -7 },
  { path: '', size: 9 },
];

describe('buildTree', () => {
  it('aggregates sizes, counts, and dominant category', () => {
    const root = buildTree(files);
    expect(root.size).toBe(1451);
    expect(root.fileCount).toBe(7); // '..' is not resolved, so ignored/../x counts
    const src = findNode(root, 'src')!;
    expect(src.size).toBe(1400);
    expect(src.fileCount).toBe(3);
    expect(src.category).toBe('media'); // the png outweighs the two ts files
    expect(src.children!.map((c) => c.name)).toEqual(['img', 'b.ts', 'a.ts']);
    expect(findNode(root, 'src/img/x.png')!.kind).toBe('file');
    expect(findNode(root, 'nope')).toBeUndefined();
    expect(findNode(root, 'src/nope.ts')).toBeUndefined();
    expect(findNode(root, '')).toBe(root);
  });
  it('clamps negative sizes to zero', () => {
    const root = buildTree(files);
    expect(findNode(root, 'neg.txt')!.size).toBe(0);
  });
});

describe('visibleChildren', () => {
  it('folds the tail into a synthetic node', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ path: `f${i}.txt`, size: 100 - i }));
    const root = buildTree(many);
    const shown = visibleChildren(root, 10);
    expect(shown).toHaveLength(10);
    expect(shown[9].name).toBe('41 more items');
    expect(shown[9].fileCount).toBe(41);
    expect(shown.reduce((s, c) => s + c.size, 0)).toBe(root.size);
    expect(visibleChildren(root, 100)).toHaveLength(50);
  });
  it('drops zero-size children', () => {
    const root = buildTree(files);
    expect(visibleChildren(root).some((c) => c.name === 'zero.txt')).toBe(false);
  });
});

describe('totals and largest', () => {
  it('sums per category', () => {
    const t = totalsByCategory(buildTree(files));
    expect(t.source).toEqual({ bytes: 400, files: 2 });
    expect(t.media).toEqual({ bytes: 1000, files: 1 });
    expect(t.docs.files).toBe(3); // README.md, zero.txt, neg.txt
  });
  it('lists the largest files with normalized paths', () => {
    const top = largestFiles(files, 2);
    expect(top.map((f) => f.path)).toEqual(['src/img/x.png', 'src/b.ts']);
  });
});
