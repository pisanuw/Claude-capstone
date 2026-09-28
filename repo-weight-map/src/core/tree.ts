import type { Category, FileRecord, TreeNode } from './types.js';
import { categorize } from './classify.js';
import { normalizePath } from './format.js';

/** Build a directory tree from a flat file list. Directories take the category that holds most of their bytes. */
export function buildTree(files: FileRecord[]): TreeNode {
  const root: TreeNode = { name: '', path: '', kind: 'dir', size: 0, fileCount: 0, category: 'other', children: [] };
  const index = new Map<string, TreeNode>([['', root]]);

  const dirFor = (path: string): TreeNode => {
    const hit = index.get(path);
    if (hit) return hit;
    const i = path.lastIndexOf('/');
    const parent = dirFor(i < 0 ? '' : path.slice(0, i));
    const node: TreeNode = {
      name: i < 0 ? path : path.slice(i + 1),
      path,
      kind: 'dir',
      size: 0,
      fileCount: 0,
      category: 'other',
      children: [],
    };
    parent.children!.push(node);
    index.set(path, node);
    return node;
  };

  for (const raw of files) {
    const path = normalizePath(raw.path);
    if (!path) continue;
    const size = Number.isFinite(raw.size) && raw.size > 0 ? raw.size : 0;
    const i = path.lastIndexOf('/');
    const parent = dirFor(i < 0 ? '' : path.slice(0, i));
    parent.children!.push({
      name: i < 0 ? path : path.slice(i + 1),
      path,
      kind: 'file',
      size,
      fileCount: 1,
      category: categorize(path),
    });
  }

  finalize(root);
  return root;
}

function finalize(node: TreeNode): void {
  if (node.kind === 'file' || !node.children) return;
  let size = 0;
  let files = 0;
  const byCat = new Map<Category, number>();
  for (const child of node.children) {
    finalize(child);
    size += child.size;
    files += child.fileCount;
    byCat.set(child.category, (byCat.get(child.category) ?? 0) + child.size);
  }
  node.size = size;
  node.fileCount = files;
  let best: Category = 'other';
  let bestBytes = -1;
  for (const [cat, bytes] of byCat) {
    if (bytes > bestBytes) {
      best = cat;
      bestBytes = bytes;
    }
  }
  node.category = best;
  node.children.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
}

/** Find a node by path ('' is the root). */
export function findNode(root: TreeNode, path: string): TreeNode | undefined {
  if (path === '') return root;
  const parts = path.split('/');
  let cur: TreeNode | undefined = root;
  for (const part of parts) {
    cur = cur?.children?.find((c) => c.name === part);
    if (!cur) return undefined;
  }
  return cur;
}

/**
 * Children to draw for one node: the largest `max` by size, with everything else folded into
 * one synthetic "n more items" node so the treemap stays legible on huge folders.
 */
export function visibleChildren(node: TreeNode, max = 40): TreeNode[] {
  const kids = (node.children ?? []).filter((c) => c.size > 0);
  if (kids.length <= max) return kids;
  const shown = kids.slice(0, max - 1);
  const rest = kids.slice(max - 1);
  const size = rest.reduce((s, c) => s + c.size, 0);
  const fileCount = rest.reduce((s, c) => s + c.fileCount, 0);
  shown.push({
    name: `${rest.length} more items`,
    path: `${node.path}\u0000rest`,
    kind: 'dir',
    size,
    fileCount,
    category: 'other',
  });
  return shown;
}

/** Sum bytes and file counts per category over a whole tree. */
export function totalsByCategory(root: TreeNode): Record<Category, { bytes: number; files: number }> {
  const out = {} as Record<Category, { bytes: number; files: number }>;
  const walk = (n: TreeNode): void => {
    if (n.kind === 'file') {
      const slot = (out[n.category] ??= { bytes: 0, files: 0 });
      slot.bytes += n.size;
      slot.files += 1;
      return;
    }
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

/** The `n` largest files anywhere in the list. */
export function largestFiles(files: FileRecord[], n = 20): FileRecord[] {
  return [...files]
    .map((f) => ({ path: normalizePath(f.path), size: f.size }))
    .filter((f) => f.path)
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, n);
}
