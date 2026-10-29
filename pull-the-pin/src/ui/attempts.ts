// Attempt log, kept in this browser only.

export interface Attempt {
  readonly when: string;
  readonly tier: string;
  readonly code: string;
  readonly answer: string;
  readonly truth: string;
  readonly verdict: string;
  readonly probesUsed: number;
  readonly runs: number;
}

const KEY = 'pull-the-pin.attempts.v1';

export function loadAttempts(): Attempt[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Attempt[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAttempt(a: Attempt): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...loadAttempts(), a].slice(-200)));
  } catch {
    // Private windows can refuse storage; the attempt simply is not logged.
  }
}

export function clearAttempts(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function attemptsCsv(list: readonly Attempt[]): string {
  const cols: (keyof Attempt)[] = ['when', 'tier', 'code', 'verdict', 'answer', 'truth', 'probesUsed', 'runs'];
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...list.map((a) => cols.map((c) => esc(a[c])).join(','))].join('\n');
}
