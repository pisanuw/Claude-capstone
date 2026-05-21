import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Tracks the last activity per anonymous player so we can email when someone
 * goes idle. This is the ONLY server-side state in the app (game state itself
 * lives in the cookie). It is intentionally a small JSON file, per the project
 * brief.
 *
 * Caveat (documented in the README): a file store persists only while the host
 * keeps the same disk. On Render's free tier that means it survives between
 * requests on a warm instance but resets on redeploy/spin-down. On serverless
 * (Netlify) it does not persist across invocations at all, which is why the
 * idle-email feature is supported on the Render deployment, not the Netlify one.
 */

export interface Activity {
  id: string;
  lastActivity: number; // epoch ms
  streak: number;
  emailed: boolean; // whether we already emailed about this idle period
}

export interface ActivityStore {
  touch(id: string, streak: number, now: number): void;
  /** Ids idle for >= idleMs that have not yet been emailed. */
  idleUnnotified(idleMs: number, now: number): Activity[];
  markEmailed(id: string): void;
  all(): Activity[];
}

/** In-memory store, handy for tests and as the base for the file store. */
export class MemoryActivityStore implements ActivityStore {
  protected map = new Map<string, Activity>();

  touch(id: string, streak: number, now: number): void {
    this.map.set(id, { id, lastActivity: now, streak, emailed: false });
    this.persist();
  }

  idleUnnotified(idleMs: number, now: number): Activity[] {
    const out: Activity[] = [];
    for (const a of this.map.values()) {
      if (!a.emailed && now - a.lastActivity >= idleMs) out.push(a);
    }
    return out;
  }

  markEmailed(id: string): void {
    const a = this.map.get(id);
    if (a) {
      a.emailed = true;
      this.persist();
    }
  }

  all(): Activity[] {
    return [...this.map.values()];
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected persist(): void {}
}

/** File-backed store: loads on construction, writes atomically on change. */
export class FileActivityStore extends MemoryActivityStore {
  constructor(private readonly file: string) {
    super();
    this.load();
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return;
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Activity[];
      for (const a of data) this.map.set(a.id, a);
    } catch {
      // Corrupt or unreadable file: start empty rather than crash.
    }
  }

  protected persist(): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.all()), 'utf8');
      renameSync(tmp, this.file); // atomic replace
    } catch {
      // Best-effort: a write failure must not break gameplay.
    }
  }
}
