/// <reference lib="webworker" />
import { exerciseById, runExercise } from '../core/exercises';

self.onmessage = (ev: MessageEvent<{ id: string; source: string }>) => {
  const ex = exerciseById(ev.data.id);
  if (!ex) {
    self.postMessage([{ name: 'Exercise', pass: false, detail: `unknown exercise ${ev.data.id}` }]);
    return;
  }
  self.postMessage(runExercise(ex, ev.data.source));
};
