import { diffWords } from '../core/diff.js';
import { estimateCost } from '../core/pricing.js';
import type { CompressionSummary } from '../core/summary.js';
import type { CompressedSection, CompressionResult, ModelPricing, SectionKind } from '../core/types.js';

const KIND_LABEL: Record<SectionKind, string> = {
  system: 'System',
  context: 'Context',
  example: 'Example',
  user: 'User',
};

const RULE_LABEL: Record<string, string> = {
  whitespace: 'whitespace',
  'filler-words': 'filler removed',
  'verbose-phrases': 'phrases simplified',
  'dedup-sentences': 'duplicate removed',
  'hedge-words': 'hedges removed',
  'trim-examples': 'examples trimmed',
};

export function renderResult(
  result: CompressionResult,
  summary: CompressionSummary,
  pricing: ModelPricing,
  host: HTMLElement,
): void {
  host.textContent = '';
  if (result.sections.length === 0) {
    host.appendChild(el('p', 'empty', 'Paste a prompt above to see it compressed.'));
    return;
  }

  host.appendChild(renderStats(summary, pricing));
  host.appendChild(renderRetention(summary.retention));
  host.appendChild(renderDiff(result.originalText, result.compressedText));
  host.appendChild(renderSections(result.sections));
}

function renderStats(summary: CompressionSummary, pricing: ModelPricing): HTMLElement {
  const box = el('div', 'stats');

  const tokens = el('div', 'stat');
  tokens.appendChild(el('span', 'stat-label', 'Tokens (est.)'));
  tokens.appendChild(
    el(
      'span',
      'stat-value',
      `${summary.original.estimatedTokens} → ${summary.compressed.estimatedTokens}`,
    ),
  );
  tokens.appendChild(
    el('span', 'stat-delta', `-${summary.savedTokens} (${summary.savedPercent}%)`),
  );
  box.appendChild(tokens);

  const costBefore = estimateCost(summary.original.estimatedTokens, pricing);
  const costAfter = estimateCost(summary.compressed.estimatedTokens, pricing);
  const cost = el('div', 'stat');
  cost.appendChild(el('span', 'stat-label', `Est. cost (${pricing.label})`));
  cost.appendChild(el('span', 'stat-value', `${formatUsd(costBefore)} → ${formatUsd(costAfter)}`));
  box.appendChild(cost);

  return box;
}

function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function renderRetention(retention: CompressionSummary['retention']): HTMLElement {
  const box = el('div', 'retention');
  const level = retention.score >= 90 ? 'good' : retention.score >= 70 ? 'warn' : 'bad';
  box.appendChild(el('span', `retention-score retention-${level}`, `Retention ${retention.score}%`));

  if (retention.totalTerms === 0) {
    box.appendChild(el('span', 'retention-note', 'No numbers, code, or proper nouns detected to track.'));
    return box;
  }

  if (retention.missing.length === 0) {
    box.appendChild(el('span', 'retention-note', `All ${retention.totalTerms} tracked terms survived.`));
    return box;
  }

  const shown = retention.missing.slice(0, 8);
  const extra = retention.missing.length - shown.length;
  const note = `Dropped: ${shown.join(', ')}${extra > 0 ? ` (+${extra} more)` : ''}`;
  box.appendChild(el('span', 'retention-note retention-missing', note));
  return box;
}

function renderDiff(before: string, after: string): HTMLElement {
  const wrap = el('div', 'diff');
  wrap.appendChild(el('h2', 'section-title', 'What changed'));
  const pre = document.createElement('pre');
  pre.className = 'diff-body';
  for (const op of diffWords(before, after)) {
    if (op.kind === 'equal') {
      pre.appendChild(document.createTextNode(op.text));
    } else if (op.kind === 'delete') {
      pre.appendChild(el('del', 'diff-delete', op.text));
    } else {
      pre.appendChild(el('ins', 'diff-insert', op.text));
    }
  }
  wrap.appendChild(pre);
  return wrap;
}

function renderSections(sections: CompressedSection[]): HTMLElement {
  const wrap = el('div', 'sections');
  wrap.appendChild(el('h2', 'section-title', 'Sections'));
  const list = el('ul', 'section-list');
  for (const section of sections) {
    const item = el('li', 'section-item');
    item.appendChild(el('span', `kind-chip kind-${section.kind}`, KIND_LABEL[section.kind]));
    if (section.rulesApplied.length === 0) {
      item.appendChild(el('span', 'rule-chip rule-none', 'unchanged'));
    } else {
      for (const rule of section.rulesApplied) {
        item.appendChild(el('span', 'rule-chip', RULE_LABEL[rule] ?? rule));
      }
    }
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
