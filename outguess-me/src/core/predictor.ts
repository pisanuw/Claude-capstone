/**
 * The oracles. A key press is a bit: 0 for F, 1 for J.
 *
 * Easy mode is Aaronson's oracle: a 5-gram frequency table of the player's own
 * history (what followed each run of five presses), backing off to shorter
 * contexts while a context is unseen or tied. Hard mode is a mixture of six
 * such experts (context lengths 1 to 6) combined by weighted majority, where
 * an expert's weight shrinks every time it guesses wrong, so the mixture
 * follows whichever context length is currently reading the player best.
 */

export type Bit = 0 | 1;
export type Mode = 'easy' | 'hard';

export interface Predictor {
  readonly name: string;
  /** Prediction for the next bit given everything seen so far. */
  predict(): Bit;
  /** Feed the bit that actually happened. */
  update(bit: Bit): void;
}

export const KEY_FOR_BIT: Record<Bit, 'F' | 'J'> = { 0: 'F', 1: 'J' };

function contextKey(history: readonly Bit[], length: number): string {
  return history.slice(history.length - length).join('');
}

/**
 * An n-gram predictor with back-off. `order` is the context length: order 5 is
 * the "5-gram" table (five previous presses predict the sixth).
 */
export class NGramPredictor implements Predictor {
  readonly name: string;
  readonly order: number;
  private readonly history: Bit[] = [];
  /** Context string (any length 0..order) -> [count of F after it, count of J after it]. */
  private readonly counts = new Map<string, [number, number]>();

  constructor(order: number) {
    if (!Number.isInteger(order) || order < 0) throw new Error(`order must be a non-negative integer, got ${order}`);
    this.order = order;
    this.name = `${order + 1}-gram`;
  }

  predict(): Bit {
    const maxLength = Math.min(this.order, this.history.length);
    for (let length = maxLength; length >= 0; length--) {
      const c = this.counts.get(contextKey(this.history, length));
      if (c && c[0] !== c[1]) return c[1] > c[0] ? 1 : 0;
    }
    // Nothing to go on (or every context tied): people over-alternate, so bet
    // on a switch from the last press.
    const last = this.history[this.history.length - 1];
    return last === undefined ? 0 : ((1 - last) as Bit);
  }

  update(bit: Bit): void {
    const maxLength = Math.min(this.order, this.history.length);
    for (let length = 0; length <= maxLength; length++) {
      const key = contextKey(this.history, length);
      const c = this.counts.get(key) ?? [0, 0];
      c[bit]++;
      this.counts.set(key, c);
    }
    this.history.push(bit);
  }

  /** Counts recorded for an exact context string such as "01101". */
  countsFor(context: string): [number, number] {
    const c = this.counts.get(context);
    return c ? [c[0], c[1]] : [0, 0];
  }
}

/** Multiplicative penalty applied to an expert's weight when it guesses wrong. */
export const MIXTURE_BETA = 0.8;
/** Weights are floored at this share of the total so a benched expert can recover. */
export const MIXTURE_FLOOR = 0.01;

export class MixturePredictor implements Predictor {
  readonly name = 'mixture of 1- to 6-gram experts';
  readonly experts: NGramPredictor[];
  private weights: number[];
  private lastExpertPredictions: Bit[] | null = null;

  constructor(orders: readonly number[] = [0, 1, 2, 3, 4, 5]) {
    if (orders.length === 0) throw new Error('mixture needs at least one expert');
    this.experts = orders.map((o) => new NGramPredictor(o));
    this.weights = orders.map(() => 1 / orders.length);
  }

  predict(): Bit {
    const votes = this.experts.map((e) => e.predict());
    this.lastExpertPredictions = votes;
    let score = 0;
    votes.forEach((v, i) => (score += (v === 1 ? 1 : -1) * this.weights[i]!));
    if (score > 1e-12) return 1;
    if (score < -1e-12) return 0;
    return votes[this.leader()]!;
  }

  update(bit: Bit): void {
    const votes = this.lastExpertPredictions ?? this.experts.map((e) => e.predict());
    this.lastExpertPredictions = null;
    const next = this.weights.map((w, i) => (votes[i] === bit ? w : w * MIXTURE_BETA));
    const total = next.reduce((a, b) => a + b, 0);
    const floored = next.map((w) => Math.max(w / total, MIXTURE_FLOOR));
    const flooredTotal = floored.reduce((a, b) => a + b, 0);
    this.weights = floored.map((w) => w / flooredTotal);
    for (const e of this.experts) e.update(bit);
  }

  /** Normalised weights, one per expert, in expert order. */
  weightsSnapshot(): number[] {
    return [...this.weights];
  }

  /** Index of the expert with the most weight (first one on ties). */
  leader(): number {
    let best = 0;
    this.weights.forEach((w, i) => {
      if (w > this.weights[best]!) best = i;
    });
    return best;
  }
}

export function createPredictor(mode: Mode): NGramPredictor | MixturePredictor {
  return mode === 'easy' ? new NGramPredictor(5) : new MixturePredictor();
}

export interface ReplayResult {
  predictions: Bit[];
  correct: boolean[];
}

/** Run a predictor over a whole sequence, predicting each bit before seeing it. */
export function replay(sequence: readonly Bit[], mode: Mode): ReplayResult {
  const predictor = createPredictor(mode);
  const predictions: Bit[] = [];
  const correct: boolean[] = [];
  for (const bit of sequence) {
    const p = predictor.predict();
    predictions.push(p);
    correct.push(p === bit);
    predictor.update(bit);
  }
  return { predictions, correct };
}
