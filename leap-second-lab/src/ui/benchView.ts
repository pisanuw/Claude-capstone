import { BENCH, RUNTIMES, RUNTIME_LABEL, type Verdict, noteFor, truthFor, verdict } from '../core/bench';
import { h } from './dom';

const BADGE: Record<Verdict, string> = {
  right: '✓ right',
  loud: '! error',
  silent: '✗ silently wrong',
  missing: '— not recorded',
};

export function benchView(): HTMLElement {
  const totals: Record<Verdict, number> = { right: 0, loud: 0, silent: 0, missing: 0 };
  const cards = BENCH.cases.map((c) => {
    const cells = RUNTIMES.map((r) => {
      const res = c.results[r];
      const v = verdict(c, r);
      totals[v] += 1;
      return h(
        'div',
        { class: `result ${v}` },
        h('div', { class: 'result-head' }, h('strong', {}, RUNTIME_LABEL[r]), h('span', { class: `badge ${v}` }, BADGE[v])),
        h('details', {}, h('summary', {}, 'code'), h('pre', {}, h('code', {}, c.snippets[r]))),
        h('pre', { class: 'output' }, h('code', {}, res?.output ?? '')),
        h('p', {}, noteFor(c.id, r)),
      );
    });
    return h(
      'article',
      { class: 'bench-case card' },
      h('h3', {}, c.title),
      h('p', {}, 'Input: ', h('code', {}, c.input)),
      h('p', { class: 'truth' }, h('strong', {}, 'Leap-second-aware answer: '), truthFor(c.id)),
      h('div', { class: 'results' }, ...cells),
    );
  });
  return h(
    'section',
    { class: 'view' },
    h('h2', {}, 'Library test bench'),
    h(
      'p',
      { class: 'lede' },
      'What four widely used time libraries actually do with leap-second edge cases. These are recorded outputs, not guesses: ',
      h('code', {}, 'scripts/record-bench.mjs'),
      ` ran every snippet on ${BENCH.recordedOn}. Nothing here runs in your browser.`,
    ),
    h(
      'ul',
      { class: 'runtimes' },
      ...RUNTIMES.map((r) => h('li', {}, h('strong', {}, RUNTIME_LABEL[r] + ': '), BENCH.runtimes[r])),
    ),
    h(
      'p',
      { class: 'summary-line' },
      `${totals.right} right, ${totals.loud} raised an error, ${totals.silent} returned a plausible wrong answer. `,
      'An error is the better failure: you find out.',
    ),
    ...cards,
  );
}
