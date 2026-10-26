import { EXERCISES, grade } from '../core/exercises';

interface Request {
  id: string;
  code: string;
  ticks: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Request>) => void) | null; postMessage(m: unknown): void };

ctx.onmessage = (e) => {
  const ex = EXERCISES.find((x) => x.id === e.data.id);
  if (!ex) return;
  ctx.postMessage(grade(ex, e.data.code, e.data.ticks));
};
