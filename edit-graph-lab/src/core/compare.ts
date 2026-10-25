// Runs every algorithm on the same input and summarises how they differ.

import { histogram } from './histogram';
import { lcs } from './lcs';
import { myers } from './myers';
import { patience } from './patience';
import { distance, matchedPairs, type Script } from './script';
import { hunks, type Hunk } from './unified';

export type Algo = 'lcs' | 'myers' | 'patience' | 'histogram';

export const ALGOS: { id: Algo; label: string; blurb: string }[] = [
  { id: 'lcs', label: 'LCS (DP)', blurb: 'O(NM) table, ties prefer deleting' },
  { id: 'myers', label: 'Myers', blurb: 'O(ND) greedy shortest path (git default)' },
  { id: 'patience', label: 'Patience', blurb: 'Anchors on lines unique to both sides' },
  { id: 'histogram', label: 'Histogram', blurb: 'Anchors on the rarest common run' },
];

export function run(algo: Algo, a: readonly string[], b: readonly string[]): Script {
  switch (algo) {
    case 'lcs':
      return lcs(a, b).script;
    case 'myers':
      return myers(a, b).script;
    case 'patience':
      return patience(a, b);
    case 'histogram':
      return histogram(a, b);
  }
}

export interface AlgoResult {
  algo: Algo;
  script: Script;
  d: number;
  /** Extra edits over the minimum (0 for LCS and Myers). */
  excess: number;
  hunks: Hunk[];
  /** Per hunk: true when no Myers hunk has identical text. */
  hunkDiffers: boolean[];
  /** True when the set of kept token pairs differs from Myers'. */
  differsFromMyers: boolean;
}

export function compareAll(a: readonly string[], b: readonly string[], context = 3): AlgoResult[] {
  const scripts = ALGOS.map((x) => ({ algo: x.id, script: run(x.id, a, b) }));
  const minD = Math.min(...scripts.map((s) => distance(s.script)));
  const myersScript = (scripts.find((s) => s.algo === 'myers') as { script: Script }).script;
  const myersHunks = new Set(hunks(myersScript, a, b, context).map(hunkKey));
  const myersPairs = matchedPairs(myersScript);
  return scripts.map(({ algo, script }) => {
    const hs = hunks(script, a, b, context);
    const pairs = matchedPairs(script);
    const differsFromMyers = pairs.size !== myersPairs.size || [...pairs].some((p) => !myersPairs.has(p));
    const d = distance(script);
    return { algo, script, d, excess: d - minD, hunks: hs, hunkDiffers: hs.map((h) => !myersHunks.has(hunkKey(h))), differsFromMyers };
  });
}

function hunkKey(h: Hunk): string {
  return `${h.header}\n${h.lines.join('\n')}`;
}
