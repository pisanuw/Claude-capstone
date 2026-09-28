import type { FileRecord } from '../core/types.js';
import { normalizePath, stripFirstSegment } from '../core/format.js';

export interface WalkResult {
  name: string;
  files: FileRecord[];
  /** Contents of the root .gitignore, or '' when there is none. */
  gitignore: string;
}

export type Progress = (count: number) => void;

/* Minimal typings for the File System Access API (not in lib.dom for every TS version). */
interface FSFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
interface FSDirHandle {
  kind: 'directory';
  name: string;
  entries(): AsyncIterable<[string, FSFileHandle | FSDirHandle]>;
}
type PickerWindow = Window & { showDirectoryPicker?: (opts?: { mode?: 'read' }) => Promise<FSDirHandle> };

export function supportsDirectoryPicker(): boolean {
  return typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

/** Open the native folder picker (Chromium) and walk the folder. */
export async function pickAndWalk(progress: Progress): Promise<WalkResult | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let dir: FSDirHandle;
  try {
    dir = await picker({ mode: 'read' });
  } catch {
    return null; // user cancelled
  }
  const files: FileRecord[] = [];
  let gitignore = '';
  const walk = async (d: FSDirHandle, prefix: string): Promise<void> => {
    for await (const [name, handle] of d.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        await walk(handle, path);
      } else {
        try {
          const f = await handle.getFile();
          files.push({ path, size: f.size });
          if (path === '.gitignore') gitignore = await f.text();
        } catch {
          files.push({ path, size: 0 });
        }
        if (files.length % 500 === 0) progress(files.length);
      }
    }
  };
  await walk(dir, '');
  progress(files.length);
  return { name: dir.name, files, gitignore };
}

/** Files from an `<input type="file" webkitdirectory>` selection. */
export async function fromFileList(list: FileList | File[]): Promise<WalkResult> {
  const arr = Array.from(list);
  const files: FileRecord[] = [];
  let name = '';
  let gitignore = '';
  for (const f of arr) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (!name) name = normalizePath(rel).split('/')[0] ?? '';
    const path = rel.includes('/') ? stripFirstSegment(rel) : normalizePath(rel);
    if (!path) continue;
    files.push({ path, size: f.size });
    if (path === '.gitignore') gitignore = await f.text();
  }
  return { name, files, gitignore };
}

/* Drag-and-drop uses the older Entry API, which is what browsers expose on DataTransfer. */
interface EntryBase {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}
interface FileEntry extends EntryBase {
  file(ok: (f: File) => void, err: (e: unknown) => void): void;
}
interface DirEntry extends EntryBase {
  createReader(): { readEntries(ok: (entries: Array<FileEntry | DirEntry>) => void, err: (e: unknown) => void): void };
}

/** Walk dropped items. Returns null when nothing droppable was found. */
export async function fromDataTransfer(dt: DataTransfer, progress: Progress): Promise<WalkResult | null> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((it) => (it.webkitGetAsEntry?.() ?? null) as unknown as FileEntry | DirEntry | null)
    .filter((e): e is FileEntry | DirEntry => e !== null);
  if (!entries.length) {
    if (dt.files?.length) return fromFileList(dt.files);
    return null;
  }
  const files: FileRecord[] = [];
  let gitignore = '';
  const readAll = (dir: DirEntry): Promise<Array<FileEntry | DirEntry>> =>
    new Promise((resolve, reject) => {
      const reader = dir.createReader();
      const out: Array<FileEntry | DirEntry> = [];
      const step = (): void =>
        reader.readEntries((batch) => {
          if (!batch.length) return resolve(out);
          out.push(...batch);
          step();
        }, reject);
      step();
    });
  const walk = async (entry: FileEntry | DirEntry, prefix: string): Promise<void> => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      for (const child of await readAll(entry as DirEntry)) await walk(child, path);
      return;
    }
    const f = await new Promise<File | null>((resolve) => (entry as FileEntry).file(resolve, () => resolve(null)));
    files.push({ path, size: f?.size ?? 0 });
    if (path === '.gitignore' && f) gitignore = await f.text();
    if (files.length % 500 === 0) progress(files.length);
  };
  // A single dropped folder becomes the root; several dropped items are placed side by side.
  const single = entries.length === 1 && entries[0].isDirectory;
  const name = single ? entries[0].name : 'dropped items';
  if (single) {
    for (const child of await readAll(entries[0] as DirEntry)) await walk(child, '');
  } else {
    for (const e of entries) await walk(e, '');
  }
  progress(files.length);
  return { name, files, gitignore };
}
