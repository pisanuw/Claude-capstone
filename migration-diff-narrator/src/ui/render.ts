import type { Analysis } from '../core/analyze.js';
import type { Change, Severity } from '../core/types.js';

const BADGE_LABEL: Record<Severity, string> = {
  breaking: 'breaking',
  caution: 'caution',
  safe: 'safe',
};

/** Renders the full result panel for an analysis. Pure DOM building, no state. */
export function renderResult(analysis: Analysis, host: HTMLElement): void {
  host.textContent = '';
  const { result } = analysis;

  const warnings = [...analysis.before.warnings, ...analysis.after.warnings];
  if (warnings.length > 0) {
    const box = el('div', 'warnings');
    for (const w of new Set(warnings)) box.appendChild(el('div', 'warning', `⚠ ${w}`));
    host.appendChild(box);
  }

  const parsedNothing =
    analysis.before.entities.length === 0 && analysis.after.entities.length === 0;
  if (parsedNothing) {
    host.appendChild(
      el(
        'p',
        'empty',
        'Nothing parseable yet. Paste two versions of a schema: SQL CREATE TABLE statements or TypeScript interfaces.',
      ),
    );
    return;
  }

  host.appendChild(renderSummary(analysis));

  if (result.changes.length === 0) {
    host.appendChild(el('p', 'empty', 'No structural differences between the two versions.'));
    return;
  }

  const byEntity = new Map<string, Change[]>();
  for (const change of result.changes) {
    const list = byEntity.get(change.entity) ?? [];
    list.push(change);
    byEntity.set(change.entity, list);
  }

  for (const [entity, changes] of byEntity) {
    const group = el('section', 'entity-group');
    const heading = el('h3', 'entity-name');
    heading.textContent = entity;
    const worst = worstSeverity(changes);
    heading.appendChild(badge(worst));
    group.appendChild(heading);
    for (const change of changes) group.appendChild(renderCard(change));
    host.appendChild(group);
  }
}

function renderSummary(analysis: Analysis): HTMLElement {
  const { counts } = analysis.result;
  const total = analysis.result.changes.length;
  const bar = el('div', 'summary');
  bar.appendChild(
    el('span', 'summary-total', `${total} change${total === 1 ? '' : 's'}`),
  );
  const parts: [Severity, number][] = [
    ['breaking', counts.breaking],
    ['caution', counts.caution],
    ['safe', counts.safe],
  ];
  for (const [severity, count] of parts) {
    const chip = el('span', `chip chip-${severity}`, `${count} ${BADGE_LABEL[severity]}`);
    if (count === 0) chip.classList.add('chip-zero');
    bar.appendChild(chip);
  }
  bar.appendChild(el('span', 'summary-kind', analysis.kind === 'sql' ? 'read as SQL DDL' : 'read as TypeScript'));
  return bar;
}

function renderCard(change: Change): HTMLElement {
  const card = el('article', `card card-${change.severity}`);
  const head = el('div', 'card-head');
  head.appendChild(badge(change.severity));
  head.appendChild(el('span', 'card-summary', change.summary));
  card.appendChild(head);

  if (change.before !== undefined || change.after !== undefined) {
    const delta = el('div', 'card-delta');
    if (change.before !== undefined) delta.appendChild(el('code', 'delta-before', change.before));
    if (change.before !== undefined && change.after !== undefined) {
      delta.appendChild(el('span', 'delta-arrow', '→'));
    }
    if (change.after !== undefined) delta.appendChild(el('code', 'delta-after', change.after));
    card.appendChild(delta);
  }

  card.appendChild(el('p', 'card-note', change.note));
  return card;
}

function worstSeverity(changes: Change[]): Severity {
  if (changes.some((c) => c.severity === 'breaking')) return 'breaking';
  if (changes.some((c) => c.severity === 'caution')) return 'caution';
  return 'safe';
}

function badge(severity: Severity): HTMLElement {
  return el('span', `badge badge-${severity}`, BADGE_LABEL[severity]);
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
