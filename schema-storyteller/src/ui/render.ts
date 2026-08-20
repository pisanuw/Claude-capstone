import type { Analysis } from '../core/analyze.js';
import type { Finding, Severity } from '../core/lint.js';
import type { EntityNarrative } from '../core/narrate.js';

/**
 * Turns an Analysis into DOM. Kept separate from the parsing/analysis core so
 * the core stays framework-free and fully unit-testable; this file is the only
 * place that touches the document.
 */

const FORMAT_LABEL: Record<string, string> = {
  sql: 'SQL DDL',
  prisma: 'Prisma schema',
  'json-schema': 'JSON Schema',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Renders inline `**bold**` markup from the narrator into safe DOM nodes. */
function withBold(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) frag.appendChild(el('strong', undefined, m[1]));
    else frag.appendChild(document.createTextNode(part));
  }
  return frag;
}

export function renderAnalysis(analysis: Analysis): HTMLElement {
  const root = el('div', 'result');

  root.appendChild(renderBadges(analysis));
  root.appendChild(renderOverview(analysis));
  root.appendChild(renderFindings(analysis.findings));

  const entitiesSection = el('section', 'entities');
  entitiesSection.appendChild(el('h2', undefined, 'Entities'));
  if (analysis.narrative.entities.length === 0) {
    entitiesSection.appendChild(el('p', 'muted', 'No entities were found in the input.'));
  }
  for (const entity of analysis.narrative.entities) {
    entitiesSection.appendChild(renderEntity(entity));
  }
  root.appendChild(entitiesSection);

  if (analysis.schema.warnings.length > 0) {
    root.appendChild(renderWarnings(analysis.schema.warnings));
  }

  return root;
}

function renderBadges(analysis: Analysis): HTMLElement {
  const bar = el('div', 'badges');
  bar.appendChild(el('span', 'badge badge-format', FORMAT_LABEL[analysis.format] ?? analysis.format));
  bar.appendChild(el('span', 'badge', `${analysis.schema.entities.length} entities`));
  bar.appendChild(el('span', 'badge', `${analysis.schema.relationships.length} relationships`));
  const highCount = analysis.findings.filter((f) => f.severity === 'high').length;
  const badgeClass = highCount > 0 ? 'badge badge-alert' : 'badge';
  bar.appendChild(el('span', badgeClass, `${analysis.findings.length} findings`));
  return bar;
}

function renderOverview(analysis: Analysis): HTMLElement {
  const section = el('section', 'overview');
  section.appendChild(el('h2', undefined, 'The story'));
  section.appendChild(el('p', 'lead', analysis.narrative.overview));
  return section;
}

function renderEntity(entity: EntityNarrative): HTMLElement {
  const card = el('article', 'entity-card');
  const header = el('div', 'entity-head');
  header.appendChild(el('h3', undefined, entity.name));
  header.appendChild(el('span', 'entity-human', entity.human));
  card.appendChild(header);

  card.appendChild(el('p', 'entity-summary', entity.summary));

  if (entity.relationshipNotes.length > 0) {
    card.appendChild(el('h4', undefined, 'Relationships'));
    const ul = el('ul', 'rel-list');
    for (const note of entity.relationshipNotes) {
      const li = el('li');
      li.appendChild(withBold(note));
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }

  if (entity.fieldNotes.length > 0) {
    card.appendChild(el('h4', undefined, 'Fields'));
    const ul = el('ul', 'field-list');
    for (const note of entity.fieldNotes) {
      const li = el('li');
      li.appendChild(withBold(note));
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }

  return card;
}

function renderFindings(findings: Finding[]): HTMLElement {
  const section = el('section', 'findings');
  section.appendChild(el('h2', undefined, 'Review findings'));

  if (findings.length === 0) {
    section.appendChild(
      el('p', 'muted', 'No issues detected by the built-in rules. This model looks tidy.'),
    );
    return section;
  }

  const list = el('ul', 'finding-list');
  for (const f of findings) {
    const li = el('li', `finding finding-${f.severity}`);
    const head = el('div', 'finding-head');
    head.appendChild(el('span', `sev sev-${f.severity}`, SEVERITY_LABEL[f.severity]));
    const loc = [f.entity, f.field].filter(Boolean).join('.');
    if (loc) head.appendChild(el('code', 'finding-loc', loc));
    head.appendChild(el('span', 'finding-rule', f.rule));
    li.appendChild(head);
    li.appendChild(el('p', 'finding-msg', f.message));
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

function renderWarnings(warnings: string[]): HTMLElement {
  const section = el('section', 'warnings');
  section.appendChild(el('h2', undefined, 'Parser notes'));
  const ul = el('ul');
  for (const w of warnings) ul.appendChild(el('li', undefined, w));
  section.appendChild(ul);
  return section;
}
