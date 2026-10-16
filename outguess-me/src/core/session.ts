/**
 * One game: before each press the oracle predicts and commits; the press is
 * scored against the committed prediction and the commitment is revealed.
 * The UI only renders this state.
 */

import { commit, type Commitment } from './commit';
import { createPredictor, type Bit, type MixturePredictor, type Mode, type NGramPredictor } from './predictor';

export interface Round {
  press: Bit;
  commitment: Commitment;
  correct: boolean;
}

export class Session {
  readonly mode: Mode;
  readonly target: number;
  readonly rounds: Round[] = [];
  readonly predictor: NGramPredictor | MixturePredictor;
  private pending: Commitment | null = null;
  private readonly makeNonce: (() => string) | undefined;

  constructor(mode: Mode, target: number, makeNonce?: () => string) {
    if (!Number.isInteger(target) || target < 1) throw new Error(`target must be a positive integer, got ${target}`);
    this.mode = mode;
    this.target = target;
    this.predictor = createPredictor(mode);
    this.makeNonce = makeNonce;
  }

  get done(): boolean {
    return this.rounds.length >= this.target;
  }

  /** The commitment for the next press, created on first call (the hash is what the player sees). */
  async next(): Promise<Commitment> {
    if (this.done) throw new Error('game is over');
    if (!this.pending) {
      const prediction = this.predictor.predict();
      this.pending = await commit(prediction, this.makeNonce?.());
    }
    return this.pending;
  }

  /** The commitment the next press will be scored against, if it is ready. */
  get pendingCommitment(): Commitment | null {
    return this.pending;
  }

  /** Score a press against the committed prediction. Throws if no commitment is out yet. */
  press(bit: Bit): Round {
    if (this.done) throw new Error('game is over');
    const commitment = this.pending;
    if (!commitment) throw new Error('no commitment yet: call next() first');
    this.pending = null;
    const round: Round = { press: bit, commitment, correct: commitment.prediction === bit };
    this.rounds.push(round);
    this.predictor.update(bit);
    return round;
  }

  get bits(): Bit[] {
    return this.rounds.map((r) => r.press);
  }

  get correct(): boolean[] {
    return this.rounds.map((r) => r.correct);
  }

  get hits(): number {
    return this.rounds.filter((r) => r.correct).length;
  }
}
