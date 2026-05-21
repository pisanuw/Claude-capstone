import type { ReadingOrderNode } from '../lib/types.js';

interface ReadingOrderViewProps {
  nodes: ReadingOrderNode[];
}

/**
 * Renders the linearized stream a screen reader would announce. This is the
 * signature "make it visceral" feature: students see their visually rich page
 * flattened into the sequence a blind user actually experiences.
 */
export function ReadingOrderView({ nodes }: ReadingOrderViewProps): JSX.Element {
  if (nodes.length === 0) {
    return <p className="text-muted">No announceable content was found on the page.</p>;
  }
  return (
    <div>
      <p className="mb-4 text-ink">
        This is the order a screen reader announces, top to bottom. Layout, columns, and styling all
        disappear: only the sequence and the labels remain.
      </p>
      <ol className="space-y-1">
        {nodes.map((node, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 rounded border border-line bg-paper px-3 py-2"
          >
            <span className="shrink-0 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
              {node.role}
              {node.level ? ` ${node.level}` : ''}
            </span>
            <span className="text-ink">{node.text || <em className="text-muted">(no text)</em>}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
