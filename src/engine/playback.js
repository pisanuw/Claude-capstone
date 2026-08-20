// Rebuilds the visual state of a search at any playhead position by replaying
// the event trace from the top. Traces are small (bounded by cell count), so a
// full replay per frame is cheap and keeps scrubbing trivially correct.

export function buildRenderState(grid, events, upto) {
  const frontier = new Map();
  const visited = new Map();
  let current = null;
  let done = null;
  let last = null;
  const N = Math.max(0, Math.min(upto, events.length));
  const key = (n) => n.r * grid.cols + n.c;

  for (let i = 0; i < N; i++) {
    const e = events[i];
    last = e;
    if (e.type === 'start') {
      frontier.set(key(e.node), { g: e.seed.g, h: e.seed.h, f: e.seed.f });
    } else if (e.type === 'expand') {
      const k = key(e.node);
      frontier.delete(k);
      visited.set(k, { g: e.g, h: e.h, f: e.f });
      current = e;
      for (const n of e.added) frontier.set(key(n), n);
      for (const n of e.updated) frontier.set(key(n), n);
    } else if (e.type === 'goal') {
      const k = key(e.node);
      frontier.delete(k);
      visited.set(k, { g: e.g, h: null, f: null });
      current = e;
    } else if (e.type === 'done') {
      done = e;
    }
  }
  return { frontier, visited, current, done, last, count: N, total: events.length };
}

// Live stats line for a panel at the current playhead.
export function liveStats(state) {
  if (!state) return null;
  if (state.done) {
    const d = state.done;
    return d.found
      ? { expanded: d.expanded, frontier: null, peak: d.maxFrontier, steps: d.steps, cost: d.cost, found: true, finished: true }
      : { expanded: d.expanded, frontier: null, peak: d.maxFrontier, steps: null, cost: null, found: false, finished: true };
  }
  const e = state.current;
  return {
    expanded: e ? e.order ?? state.visited.size : state.visited.size,
    frontier: state.frontier.size,
    peak: null,
    steps: null,
    cost: null,
    found: null,
    finished: false,
  };
}
