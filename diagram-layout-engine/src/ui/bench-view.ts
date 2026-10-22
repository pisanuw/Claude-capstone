// Benchmark tab: run every configuration over the 50 seeded graphs and rank
// them, with a per-graph table whose rows open in the editor.

import { BENCH_CONFIGS, METRICS, benchmarkGraphs, runOne, summarize, type BenchRow, type Metric } from '../core/bench';
import { download, esc, fmt } from './dom';

const LABEL: Record<Metric, string> = { crossings: 'Crossings', area: 'Area (px²)', edgeLength: 'Edge length (px)', bends: 'Bends' };

export class BenchView {
  private rows: BenchRow[] = [];
  private running = false;
  private readonly graphs = benchmarkGraphs();

  constructor(
    private readonly root: HTMLElement,
    private readonly open: (source: string) => void,
  ) {
    this.render();
  }

  private render(): void {
    const summary = this.rows.length ? summarize(this.rows, BENCH_CONFIGS) : [];
    const done = new Set(this.rows.map((r) => r.graph)).size;
    const best = (m: Metric | 'meanRank' | 'wins'): number => {
      if (!summary.length) return NaN;
      if (m === 'meanRank') return Math.min(...summary.map((s) => s.meanRank));
      if (m === 'wins') return Math.max(...summary.map((s) => s.wins));
      return Math.min(...summary.map((s) => s.totals[m]));
    };
    const cell = (v: number, b: number, text: string): string => `<td class="num${v === b ? ' best' : ''}">${text}</td>`;
    const sumRows = summary
      .map((s, k) => {
        const c = BENCH_CONFIGS.find((x) => x.id === s.config)!;
        return `<tr><td>${k + 1}</td><td>${esc(c.label)}</td>${cell(s.meanRank, best('meanRank'), s.meanRank.toFixed(2))}${cell(s.wins, best('wins'), String(s.wins))}${METRICS.map((m) => cell(s.totals[m], best(m), fmt(Math.round(s.totals[m])))).join('')}<td class="num">${fmt(s.ms)}</td></tr>`;
      })
      .join('');
    const perGraph = this.graphs
      .filter((g) => this.rows.some((r) => r.graph === g.id))
      .map((g) => {
        const mine = this.rows.filter((r) => r.graph === g.id);
        const minC = Math.min(...mine.map((r) => r.stats.crossings));
        const st = mine[0].stats;
        return `<tr><td><button class="link" data-open="${g.id}">${g.id}</button></td><td>${esc(g.family)}</td><td class="num">${st.nodes}</td><td class="num">${st.edges}</td>${BENCH_CONFIGS.map((c) => {
          const r = mine.find((x) => x.config === c.id);
          return r ? `<td class="num${r.stats.crossings === minC ? ' best' : ''}">${r.stats.crossings}</td>` : '<td></td>';
        }).join('')}</tr>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="bench-head">
        <div>
          <h2>Benchmark</h2>
          <p>Fifty seeded graphs (sparse and dense DAGs, trees, layered graphs, cyclic graphs and clustered graphs with mixed directions), laid out with ${BENCH_CONFIGS.length} pipeline configurations. Each configuration is ranked per graph on crossings, area, total edge length and bends (1 is best, ties share the better rank); the table sorts by the mean rank. Everything runs in this tab.</p>
        </div>
        <div class="bench-actions">
          <button class="primary" id="bench-run"${this.running ? ' disabled' : ''}>${this.rows.length ? 'Run again' : 'Run benchmark'}</button>
          <button id="bench-csv"${this.rows.length && !this.running ? '' : ' disabled'}>Download CSV</button>
        </div>
      </div>
      <progress id="bench-progress" max="${this.graphs.length}" value="${done}" aria-label="Benchmark progress"${this.running || done ? '' : ' hidden'}></progress>
      ${
        summary.length
          ? `<div class="table-wrap"><table class="bench"><thead><tr><th>#</th><th>Configuration</th><th>Mean rank</th><th>Wins</th>${METRICS.map((m) => `<th>${LABEL[m]}</th>`).join('')}<th>ms</th></tr></thead><tbody>${sumRows}</tbody></table></div>
             <h3>Crossings per graph <span class="hint">(click an id to open it in the editor)</span></h3>
             <div class="table-wrap"><table class="bench small"><thead><tr><th>Graph</th><th>Family</th><th>Nodes</th><th>Edges</th>${BENCH_CONFIGS.map((c) => `<th title="${esc(c.label)}">${esc(c.id)}</th>`).join('')}</tr></thead><tbody>${perGraph}</tbody></table></div>`
          : '<p class="empty">Press <strong>Run benchmark</strong> to lay out all 50 graphs with every configuration (a few seconds).</p>'
      }`;
    this.root.querySelector('#bench-run')!.addEventListener('click', () => void this.run());
    this.root.querySelector('#bench-csv')!.addEventListener('click', () => this.csv());
    this.root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => {
        const g = this.graphs.find((x) => x.id === b.dataset.open);
        if (g) this.open(g.source);
      }),
    );
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.rows = [];
    this.render();
    for (const g of this.graphs) {
      for (const c of BENCH_CONFIGS) this.rows.push(runOne(g, c));
      const bar = this.root.querySelector<HTMLProgressElement>('#bench-progress');
      if (bar) bar.value = new Set(this.rows.map((r) => r.graph)).size;
      await new Promise((r) => setTimeout(r, 0));
    }
    this.running = false;
    this.render();
  }

  private csv(): void {
    const head = ['graph', 'family', 'config', 'nodes', 'edges', 'layers', 'dummies', 'reversed', 'crossings', 'area', 'edgeLength', 'bends', 'ms'];
    const lines = [head.join(',')];
    for (const r of this.rows) {
      const g = this.graphs.find((x) => x.id === r.graph)!;
      const s = r.stats;
      lines.push([r.graph, g.family, r.config, s.nodes, s.edges, s.layers, s.dummies, s.reversed, s.crossings, s.area, s.edgeLength, s.bends, s.ms].join(','));
    }
    download('diagram-layout-benchmark.csv', new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
  }
}
