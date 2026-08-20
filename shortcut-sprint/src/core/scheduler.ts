import type { CardState, Shortcut } from './types';
import { initialCard } from './sm2';

export interface QueueItem {
  shortcut: Shortcut;
  card: CardState;
  isNew: boolean;
}

/**
 * Build today's practice queue for one set: due reviews first (most overdue
 * first), then up to `newLimit` unseen shortcuts in library order.
 */
export function buildQueue(
  shortcuts: Shortcut[],
  cards: Record<string, CardState>,
  today: number,
  newLimit: number,
): QueueItem[] {
  const due: QueueItem[] = [];
  const fresh: QueueItem[] = [];
  for (const s of shortcuts) {
    const card = cards[s.id];
    if (!card) {
      if (fresh.length < newLimit) fresh.push({ shortcut: s, card: initialCard(today), isNew: true });
    } else if (card.due <= today) {
      due.push({ shortcut: s, card, isNew: false });
    }
  }
  due.sort((a, b) => a.card.due - b.card.due);
  return [...due, ...fresh];
}

/** Counts shown in the practice header. */
export function queueCounts(items: QueueItem[]): { due: number; fresh: number } {
  let due = 0;
  let fresh = 0;
  for (const it of items) {
    if (it.isNew) fresh += 1;
    else due += 1;
  }
  return { due, fresh };
}
