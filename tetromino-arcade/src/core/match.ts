// Versus mode: a human Session against a CpuPlayer, exchanging garbage.

import { CpuPlayer, type Difficulty } from './ai';
import { Game } from './game';
import { Session, type Handling } from './session';

export class Match {
  readonly player: Session;
  readonly cpuGame: Game;
  readonly cpu: CpuPlayer;
  winner: 'player' | 'cpu' | null = null;

  constructor(seed: number, difficulty: Difficulty, handling: Handling) {
    // Both sides get the same piece sequence, so the result is down to play.
    this.player = new Session({ mode: 'versus', seed }, handling);
    this.cpuGame = new Game({ mode: 'versus', seed });
    this.cpu = new CpuPlayer(difficulty, seed);
  }

  get over(): boolean {
    return this.winner !== null;
  }

  tick(): void {
    if (this.over) return;
    this.player.tick();
    this.cpu.update(this.cpuGame);
    this.cpuGame.step(false);
    this.cpuGame.receiveGarbage(this.player.game.drainAttack());
    this.player.game.receiveGarbage(this.cpuGame.drainAttack());
    if (this.player.game.over) this.winner = 'cpu';
    else if (this.cpuGame.over) this.winner = 'player';
  }
}
