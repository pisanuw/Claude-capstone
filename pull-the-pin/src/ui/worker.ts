import { computeSignatures } from '../core/diagnosis';

self.onmessage = (e: MessageEvent<{ id: number; bytes: number[] }>) => {
  const { id, bytes } = e.data;
  const table = computeSignatures(bytes, undefined, (done, total) => self.postMessage({ id, progress: done / total }));
  (self as unknown as Worker).postMessage({ id, table }, [table.buffer]);
};
