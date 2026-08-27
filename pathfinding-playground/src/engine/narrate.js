// Deterministic narration. Every line is derived from the numbers in the
// event itself, so the explanation always matches what the algorithm actually
// did. No API calls, no cost, works offline.

import { ALGORITHMS } from './algorithms.js';
import { MUD_COST } from './grid.js';

const at = (n) => `(${n.r},${n.c})`;

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function whyPicked(e) {
  switch (e.algo) {
    case 'bfs':
      return `oldest cell in the queue, ${plural(e.g, 'step')} from the start`;
    case 'dfs':
      return `newest cell on the stack, depth ${e.g}`;
    case 'dijkstra':
      return `cheapest known route, g = ${e.g}`;
    case 'greedy':
      return `looks closest to the goal, h = ${e.h}, path cost so far is ignored`;
    case 'astar':
      return `lowest estimate in the frontier, f = g ${e.g} + h ${e.h} = ${e.f}`;
    default:
      return '';
  }
}

function mudRemark(e) {
  const muddy = [...e.added, ...e.updated].filter((n) => n.mud);
  if (muddy.length === 0) return '';
  const spot = at(muddy[0]);
  if (e.algo === 'bfs' || e.algo === 'dfs') {
    return ` ${spot} is mud, but ${ALGORITHMS[e.algo].short} treats every step the same.`;
  }
  if (e.algo === 'greedy') {
    return ` ${spot} is mud; greedy does not care, only h counts.`;
  }
  return ` ${spot} is mud: entering costs ${MUD_COST}.`;
}

export function narrate(e) {
  const A = ALGORITHMS[e.algo];
  switch (e.type) {
    case 'start': {
      const seed = e.seed.f != null ? `f = ${e.seed.f}` : e.seed.h != null ? `h = ${e.seed.h}` : 'g = 0';
      return `${A.name} from ${at(e.node)} to ${at(e.goal)}. Frontier seeded with the start cell (${seed}). Frontier ordering: ${A.orderedBy}.`;
    }
    case 'expand': {
      const parts = [`Expand ${at(e.node)}: ${whyPicked(e)}.`];
      const moves = [];
      if (e.added.length > 0) moves.push(`adds ${plural(e.added.length, 'cell')}`);
      if (e.updated.length > 0) moves.push(`improves ${plural(e.updated.length, 'route')}`);
      if (e.skippedVisited > 0) moves.push(`skips ${e.skippedVisited} visited`);
      if (e.skippedWorse > 0) moves.push(`ignores ${e.skippedWorse} worse ${e.skippedWorse === 1 ? 'offer' : 'offers'}`);
      if (moves.length === 0) moves.push('a dead end, nothing new to add');
      parts.push(moves.join(', ') + '.');
      const mud = mudRemark(e);
      if (mud) parts.push(mud.trim());
      return parts.join(' ');
    }
    case 'goal':
      return `Goal ${at(e.node)} reached and popped from the frontier.`;
    case 'done': {
      if (!e.found) {
        return `Frontier exhausted after ${plural(e.expanded, 'expansion')}. No route exists: the goal is sealed off.`;
      }
      const base = `Path found: ${plural(e.steps, 'step')}, total cost ${e.cost}, after ${plural(e.expanded, 'expansion')} (peak frontier ${e.maxFrontier}).`;
      const A2 = ALGORITHMS[e.algo];
      let note = '';
      if (A2.guarantee === 'lowest cost') note = ' This cost is provably the lowest possible.';
      else if (A2.guarantee === 'fewest steps') {
        note = e.cost > e.steps
          ? ' Fewest steps guaranteed, but BFS ignored the mud, so the bill came to more than the step count.'
          : ' Fewest steps guaranteed.';
      } else {
        note = ' No optimality guarantee: a cheaper or shorter route may exist.';
      }
      return base + note;
    }
    default:
      return '';
  }
}

// One-line comparison verdict for side-by-side mode.
export function compareVerdict(a, b) {
  if (!a || !b || a.type !== 'done' || b.type !== 'done') return '';
  const nameA = ALGORITHMS[a.algo].short;
  const nameB = ALGORITHMS[b.algo].short;
  if (!a.found && !b.found) return `Neither ${nameA} nor ${nameB} could reach the goal.`;
  if (a.found !== b.found) {
    const w = a.found ? nameA : nameB;
    return `Only ${w} reached the goal.`;
  }
  const bits = [];
  if (a.cost !== b.cost) {
    bits.push(`${a.cost < b.cost ? nameA : nameB} found the cheaper path (${Math.min(a.cost, b.cost)} vs ${Math.max(a.cost, b.cost)})`);
  } else {
    bits.push(`both paths cost ${a.cost}`);
  }
  if (a.expanded !== b.expanded) {
    bits.push(`${a.expanded < b.expanded ? nameA : nameB} did less work (${Math.min(a.expanded, b.expanded)} vs ${Math.max(a.expanded, b.expanded)} expansions)`);
  } else {
    bits.push(`both expanded ${a.expanded} cells`);
  }
  const s = bits.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
