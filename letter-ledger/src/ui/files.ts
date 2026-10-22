/**
 * Attachment store. CVs and statements are too big for localStorage, so they
 * live in IndexedDB as base64 strings keyed by "requestId/attachmentId". If
 * IndexedDB is unavailable (some private windows) files are kept in memory
 * for the session and the ledger still works.
 */

const DB = 'letter-ledger';
const STORE = 'files';
const memory = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return resolve(undefined);
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r ? r.result : undefined);
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function putFile(key: string, base64: string): Promise<void> {
  memory.set(key, base64);
  await tx('readwrite', (s) => {
    s.put(base64, key);
  });
}

export async function getFile(key: string): Promise<string | undefined> {
  if (memory.has(key)) return memory.get(key);
  return tx<string>('readonly', (s) => s.get(key));
}

export async function deleteFiles(keys: string[]): Promise<void> {
  for (const k of keys) memory.delete(k);
  await tx('readwrite', (s) => {
    for (const k of keys) s.delete(k);
  });
}

export async function allFiles(): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(memory);
  const keys = (await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
  for (const k of keys) {
    const v = await getFile(String(k));
    if (v !== undefined) out[String(k)] = v;
  }
  return out;
}

export async function clearFiles(): Promise<void> {
  memory.clear();
  await tx('readwrite', (s) => {
    s.clear();
  });
}
