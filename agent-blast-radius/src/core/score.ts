import { DIMENSIONS, type Capability, type Dimension, type Finding, type RiskLevel } from './types.js';

/**
 * How much each dimension counts toward the overall score. Shell execution is
 * the top of the ladder because it implies every other dimension.
 */
const DIMENSION_WEIGHT: Record<Dimension, number> = {
  shell: 1,
  filesystem: 0.85,
  credentials: 0.8,
  browser: 0.8,
  network: 0.6,
};

const FINDING_BUMP: Record<Finding['severity'], number> = {
  info: 0,
  low: 2,
  medium: 5,
  high: 10,
  critical: 20,
};

/**
 * Per-dimension score: the strongest capability sets the floor, and every
 * additional one closes a quarter of the remaining gap to 100. So two
 * "medium" capabilities score higher than one, but nothing ever passes 100.
 */
export function dimensionScores(caps: Capability[]): Record<Dimension, number> {
  const out = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;
  for (const d of DIMENSIONS) {
    const weights = caps
      .filter((c) => c.dimension === d)
      .map((c) => clamp(c.weight))
      .sort((a, b) => b - a);
    let score = 0;
    for (const [i, w] of weights.entries()) {
      score = i === 0 ? w : score + ((100 - score) * w) / 400;
    }
    out[d] = Math.round(score);
  }
  return out;
}

/**
 * Overall score: the worst weighted dimension, plus a breadth bonus for every
 * other dimension that is non-trivial, plus bumps for hygiene findings.
 */
export function overallScore(dims: Record<Dimension, number>, findings: Finding[]): number {
  const weighted = DIMENSIONS.map((d) => dims[d] * DIMENSION_WEIGHT[d]).sort((a, b) => b - a);
  const top = weighted[0] ?? 0;
  const breadth = weighted.slice(1).filter((w) => w >= 20).length * 4;
  const bumps = findings.reduce((sum, f) => sum + FINDING_BUMP[f.severity], 0);
  return Math.round(clamp(top + breadth + Math.min(bumps, 20)));
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
