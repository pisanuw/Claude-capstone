import { describe, expect, it } from 'vitest';
import { cellsOf } from '../src/core/board';
import { CpuPlayer, DIFFICULTY, evaluate, features, placements, suggest } from '../src/core/ai';
import { Game } from '../src/core/game';
import { Match } from '../src/core/match';
import { parseReplay, Session, type Key } from '../src/core/session';
import { emptyGrid, HEIGHT } from '../src/core/board';
import { setBottom } from './helpers';

function minX(s: Session): number {
  return Math.min(...cellsOf(s.game.active!).map((c) => c.x));
}

describe('Controller (DAS / ARR)', () => {
  it('moves once on press, then repeats after DAS at the ARR rate', () => {
    const s = new Session({ mode: 'zen', seed: 1 }, { das: 5, arr: 2, sdf: 20 });
    const x0 = minX(s);
    s.press('left');
    s.tick();
    expect(minX(s)).toBe(x0 - 1);
    for (let i = 0; i < 3; i++) s.tick();
    expect(minX(s)).toBe(x0 - 1);
    s.tick(); // DAS charged (5 frames)
    s.tick(); // first repeat
    expect(minX(s)).toBe(x0 - 2);
    s.release('left');
    s.tick();
    s.tick();
    s.tick();
    expect(minX(s)).toBe(x0 - 2);
  });

  it('ARR 0 jumps to the wall and the other direction takes over on release', () => {
    const s = new Session({ mode: 'zen', seed: 1 }, { das: 1, arr: 0, sdf: 20 });
    s.press('left');
    s.tick();
    s.tick();
    expect(minX(s)).toBe(0);
    s.press('right');
    s.tick();
    expect(minX(s)).toBeGreaterThan(5);
    s.release('right');
    s.tick();
    s.tick();
    expect(minX(s)).toBe(0);
    s.release('left');
  });

  it('maps keys to rotations, hold, hard and soft drop', () => {
    const s = new Session({ mode: 'zen', seed: 2 });
    const keys: Key[] = ['cw', 'ccw', 'r180', 'hold'];
    for (const k of keys) {
      s.press(k);
      s.tick();
      s.release(k);
      s.tick();
    }
    expect(s.game.hold).not.toBeNull();
    s.press('soft');
    s.tick();
    s.tick();
    expect(s.controller.softHeld()).toBe(true);
    s.releaseAll();
    s.tick();
    expect(s.controller.softHeld()).toBe(false);
    s.press('hard');
    s.tick();
    expect(s.game.stats.pieces).toBe(1);
    expect(s.game.stats.inputs).toBeGreaterThanOrEqual(6);
  });
});

describe('replays', () => {
  function playScripted(): Session {
    const s = new Session({ mode: 'sprint', seed: 77 }, { das: 6, arr: 1, sdf: 30 });
    const script: Key[] = ['left', 'cw', 'right', 'hold', 'ccw', 'left', 'r180', 'right'];
    for (let i = 0; i < 400 && !s.game.over; i++) {
      const k = script[i % script.length];
      if (i % 5 === 0) s.press(k);
      if (i % 5 === 3) s.release(k);
      if (i % 11 === 0) s.press('hard');
      if (i % 11 === 1) s.release('hard');
      s.tick();
    }
    return s;
  }

  it('reproduces a game exactly from its input log', () => {
    const live = playScripted();
    const rep = live.toReplay();
    expect(rep.events.length).toBeGreaterThan(50);
    const text = JSON.stringify(rep);
    const back = Session.fromReplay(parseReplay(text));
    expect(back.isReplay).toBe(true);
    while (!back.game.over && back.game.frame < live.game.frame) back.tick();
    // A game that ended on a key press ends before its frame advances.
    if (live.game.over) back.tick();
    expect(back.game.over).toBe(live.game.over);
    expect(back.game.score).toBe(live.game.score);
    expect(back.game.grid).toEqual(live.game.grid);
    expect(back.progress()).toBe(1);
    // Live input is ignored while replaying.
    back.press('hard');
    expect(back.log).toHaveLength(0);
    expect(live.isReplay).toBe(false);
    expect(live.progress()).toBe(0);
  });

  it('rejects malformed replay files', () => {
    expect(() => parseReplay('{"v":2}')).toThrow(/Not a/);
    expect(() => parseReplay('{"v":1,"mode":"nope","seed":1,"events":[]}')).toThrow(/Not a/);
    expect(() => parseReplay('{"v":1,"mode":"versus","seed":1,"events":[]}')).toThrow(/Versus/);
    expect(() => parseReplay('{"v":1,"mode":"zen","seed":1,"events":[]}')).toThrow(/handling/);
    const h = '"handling":{"das":1,"arr":1,"sdf":1}';
    expect(() => parseReplay(`{"v":1,"mode":"zen","seed":1,"events":[{"f":1,"k":"jump","d":true}],${h}}`)).toThrow(/malformed/);
    const ok = parseReplay(`{"v":1,"mode":"zen","seed":1,"events":[],${h}}`);
    expect(ok).toMatchObject({ startLevel: 1, frames: 0, score: 0, lines: 0, date: '' });
  });
});

describe('AI', () => {
  it('scores holes and wells as bad', () => {
    const flat = emptyGrid();
    const holey = emptyGrid();
    setBottom(holey, ['XXXXXXXXX.', 'X.XXXXXXX.']);
    const piece = { type: 'O' as const, rot: 0 as const, x: 0, y: HEIGHT - 4 };
    const f1 = features(flat, { ...piece, y: HEIGHT - 2 });
    const f2 = features(holey, piece);
    expect(f1.holes).toBe(0);
    expect(f2.holes).toBeGreaterThan(0);
    expect(f2.wells).toBeGreaterThan(0);
    expect(evaluate(f1)).toBeGreaterThan(evaluate(f2));
  });

  it('prefers the placement that clears a line', () => {
    const g = emptyGrid();
    setBottom(g, ['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.']);
    const best = placements(g, 'I', 0)[0];
    expect(best.piece.rot % 2).toBe(1);
    expect(features(g, best.piece).rowsEliminated).toBe(16);
  });

  it('dedupes symmetric placements', () => {
    expect(placements(emptyGrid(), 'O', 0)).toHaveLength(9);
    expect(placements(emptyGrid(), 'I', 0)).toHaveLength(17);
  });

  it('suggests a placement for the current piece', () => {
    const game = new Game({ mode: 'zen', seed: 4 });
    const s = suggest(game)!;
    expect(s.type).toBe(game.active!.type);
    game.active = null;
    expect(suggest(game)).toBeNull();
  });

  it('a CPU clears 40 lines in marathon without topping out', () => {
    const game = new Game({ mode: 'marathon', seed: 11 });
    const cpu = new CpuPlayer('insane', 11);
    for (let i = 0; i < 20000 && game.lines < 40 && !game.over; i++) {
      cpu.update(game);
      game.step();
    }
    expect(game.over).toBe(false);
    expect(game.lines).toBeGreaterThanOrEqual(40);
    expect(game.stats.holds).toBeGreaterThanOrEqual(0);
  });

  it('easy CPU makes slower progress than insane', () => {
    const play = (d: keyof typeof DIFFICULTY) => {
      const game = new Game({ mode: 'zen', seed: 3 });
      const cpu = new CpuPlayer(d, 3);
      for (let i = 0; i < 3000; i++) {
        cpu.update(game);
        game.step();
      }
      return game.stats.pieces;
    };
    expect(play('easy')).toBeLessThan(play('insane'));
  });
});

describe('Match', () => {
  it('an idle player loses to the CPU, and attack crosses over', () => {
    const m = new Match(5, 'hard', { das: 10, arr: 2, sdf: 20 });
    let i = 0;
    while (!m.over && i < 60000) {
      m.tick();
      i++;
    }
    expect(m.winner).toBe('cpu');
    expect(m.player.game.over).toBe(true);
    m.tick();
    expect(m.winner).toBe('cpu');
  });

  it('a strong player beats a weak CPU by sending garbage', () => {
    const m = new Match(8, 'easy', { das: 10, arr: 2, sdf: 20 });
    const helper = new CpuPlayer('insane', 99);
    let i = 0;
    while (!m.over && i < 200000) {
      helper.update(m.player.game);
      m.tick();
      i++;
    }
    expect(m.winner).toBe('player');
    expect(m.cpuGame.stats.garbageReceived).toBeGreaterThan(0);
  });
});
