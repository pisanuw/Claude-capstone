import { EXERCISES, type Exercise, type TestResult } from '../core/exercises';
import { clear, h } from './dom';

const KEY = 'leap-second-lab:exercise:';

function load(id: string, fallback: string): string {
  try {
    return localStorage.getItem(KEY + id) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(id: string, value: string): void {
  try {
    localStorage.setItem(KEY + id, value);
  } catch {
    /* storage unavailable: drafts are not kept */
  }
}

/** Run tests in a worker so an infinite loop cannot freeze the page. */
function runInWorker(ex: Exercise, source: string, timeoutMs = 3000): Promise<TestResult[]> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve([{ name: 'Time limit', pass: false, detail: `still running after ${timeoutMs / 1000} s (an infinite loop?)` }]);
    }, timeoutMs);
    worker.onmessage = (ev: MessageEvent<TestResult[]>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(ev.data);
    };
    worker.onerror = (ev) => {
      clearTimeout(timer);
      worker.terminate();
      resolve([{ name: 'Worker', pass: false, detail: ev.message }]);
    };
    worker.postMessage({ id: ex.id, source });
  });
}

function exerciseCard(ex: Exercise): HTMLElement {
  const editor = h('textarea', { class: 'editor mono', spellcheck: false, rows: Math.max(8, ex.starter.split('\n').length + 2), 'aria-label': `Code for ${ex.title}` });
  editor.value = load(ex.id, ex.starter);
  editor.addEventListener('input', () => save(ex.id, editor.value));
  editor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab' && !ev.shiftKey) {
      ev.preventDefault();
      const { selectionStart: a, selectionEnd: b } = editor;
      editor.setRangeText('  ', a, b, 'end');
      save(ex.id, editor.value);
    }
  });
  const results = h('ul', { class: 'tests', 'aria-live': 'polite' });
  const status = h('span', { class: 'muted' });
  const run = async () => {
    status.textContent = 'Running…';
    const res = await runInWorker(ex, editor.value);
    clear(results);
    for (const r of res) results.append(h('li', { class: r.pass ? 'pass' : 'fail' }, h('strong', {}, r.pass ? '✓ ' : '✗ '), r.name, h('pre', {}, r.detail)));
    const passed = res.filter((r) => r.pass).length;
    status.textContent = passed === res.length ? `All ${res.length} tests pass.` : `${passed} of ${res.length} tests pass.`;
  };
  const hint = h('p', { class: 'hint', hidden: true }, ex.hint);
  const solution = h('pre', { class: 'solution', hidden: true }, h('code', {}, ex.solution));
  return h(
    'article',
    { class: 'card exercise', id: `ex-${ex.id}` },
    h('h3', {}, ex.title),
    h('p', {}, ex.prompt),
    editor,
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', onclick: run }, 'Run hidden tests'),
      h('button', { type: 'button', class: 'secondary', onclick: () => { hint.hidden = !hint.hidden; } }, 'Hint'),
      h('button', { type: 'button', class: 'secondary', onclick: () => { solution.hidden = !solution.hidden; } }, 'Show a fix'),
      h('button', { type: 'button', class: 'secondary', onclick: () => { editor.value = ex.starter; save(ex.id, ex.starter); clear(results); status.textContent = ''; } }, 'Reset'),
      status,
    ),
    hint,
    solution,
    results,
  );
}

export function exercisesView(): HTMLElement {
  return h(
    'section',
    { class: 'view' },
    h('h2', {}, 'Fix it before midnight'),
    h(
      'p',
      { class: 'lede' },
      'Four small pieces of production-shaped JavaScript that break on a leap second. The hidden tests replay 2016-12-31T23:59:60 (and a hypothetical removed second) through a simulated clock: ',
      h('code', {}, 'clock.wallMs()'),
      ' behaves like Date.now() on a stepping kernel and ',
      h('code', {}, 'clock.monotonicMs()'),
      ' like performance.now(). Your code runs in a Web Worker in this tab; drafts are kept in this browser only.',
    ),
    ...EXERCISES.map(exerciseCard),
  );
}
