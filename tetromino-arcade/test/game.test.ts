import { describe, expect, it } from 'vitest';
import { cellsOf, HEIGHT, TOP } from '../src/core/board';
import { Game, LOCK_DELAY, MAX_LOCK_RESETS } from '../src/core/game';
import { MODES } from '../src/core/modes';
import { bottomRows, setBottom } from './helpers';

function lastLock(g: Game) {
  const locks = g.events.filter((e) => e.type === 'lock');
  return locks[locks.length - 1] as Extract<Game['events'][number], { type: 'lock' }>;
}

describe('Game basics', () => {
  it('spawns centred, just touching the visible field, with five next pieces', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    expect(g.active).not.toBeNull();
    const cells = cellsOf(g.active!);
    expect(Math.max(...cells.map((c) => c.y))).toBeGreaterThanOrEqual(TOP - 1);
    expect(g.next).toHaveLength(5);
    expect(g.events[0]).toMatchObject({ type: 'spawn' });
  });

  it('is deterministic for a seed', () => {
    const a = new Game({ mode: 'marathon', seed: 9 });
    const b = new Game({ mode: 'marathon', seed: 9 });
    expect(a.active!.type).toBe(b.active!.type);
    expect(a.next).toEqual(b.next);
  });

  it('moves until a wall stops it', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    let moves = 0;
    while (g.move(-1)) moves++;
    expect(moves).toBeGreaterThan(0);
    expect(Math.min(...cellsOf(g.active!).map((c) => c.x))).toBe(0);
  });

  it('hard drop scores two points per cell and locks', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    const ghost = g.ghost()!;
    const dist = ghost.y - g.active!.y;
    const type = g.active!.type;
    g.hardDrop();
    expect(g.score).toBe(dist * 2);
    expect(g.stats.pieces).toBe(1);
    expect(g.active!.type).not.toBe(undefined);
    expect(g.grid[HEIGHT - 1].some((v) => v !== 0)).toBe(true);
    expect(type).toBeTruthy();
  });

  it('holds once per piece and swaps back after a lock', () => {
    const g = new Game({ mode: 'marathon', seed: 3 });
    const first = g.active!.type;
    const second = g.next[0];
    expect(g.holdPiece()).toBe(true);
    expect(g.hold).toBe(first);
    expect(g.active!.type).toBe(second);
    expect(g.holdPiece()).toBe(false);
    g.hardDrop();
    expect(g.holdPiece()).toBe(true);
    expect(g.active!.type).toBe(first);
  });

  it('gravity pulls the piece down and soft drop scores a point per row', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    const y0 = g.active!.y;
    for (let i = 0; i < 60; i++) g.step();
    expect(g.active!.y).toBe(y0 + 1);
    const before = g.score;
    for (let i = 0; i < 6; i++) g.step(true);
    expect(g.score - before).toBeGreaterThanOrEqual(2);
  });

  it('instant soft drop reaches the floor in one frame', () => {
    const g = new Game({ mode: 'marathon', seed: 1, sdf: 41 });
    g.step(true);
    expect(g.grounded()).toBe(true);
  });

  it('locks after the lock delay once grounded', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    g.active = g.ghost();
    for (let i = 0; i < LOCK_DELAY - 1; i++) g.step();
    expect(g.stats.pieces).toBe(0);
    g.step();
    expect(g.stats.pieces).toBe(1);
  });

  it('limits move resets so a piece cannot stall forever', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    g.active = g.ghost();
    let frames = 0;
    for (let i = 0; i < 100 && g.stats.pieces === 0; i++) {
      g.rotate(i % 2 === 0 ? 1 : -1);
      g.step();
      frames++;
    }
    expect(g.stats.pieces).toBe(1);
    expect(frames).toBeLessThanOrEqual(MAX_LOCK_RESETS + LOCK_DELAY + 1);
  });

  it('ends with a block out when the spawn area is filled', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    for (let y = TOP - 4; y < TOP + 2; y++) g.grid[y].fill(8);
    for (let y = TOP - 4; y < TOP + 2; y++) g.grid[y][0] = 0;
    g.active = { type: 'I', rot: 1, x: -2, y: TOP - 6 };
    g.hardDrop();
    expect(g.over).toBe(true);
    expect(g.won).toBe(false);
    expect(g.events.at(-1)).toMatchObject({ type: 'end', won: false });
  });
});

describe('clears, T-spins and modes', () => {
  it('scores a T-spin double reached by a rotation', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    setBottom(g.grid, ['XXXX......', 'XXX...XXXX', 'XXXX.XXXXX']);
    g.active = { type: 'T', rot: 1, x: 3, y: HEIGHT - 3 };
    expect(g.rotate(1)).toBe(true);
    g.hardDrop();
    const lock = lastLock(g);
    expect(lock.spin).toBe('full');
    expect(lock.lines).toHaveLength(2);
    expect(lock.label).toBe('T-Spin Double');
    expect(g.score).toBe(1200);
    expect(g.b2b).toBe(1);
    expect(g.stats.tspins).toBe(1);
  });

  it('awards a mini T-spin when only one front corner is filled', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    setBottom(g.grid, ['X.........', '...XXXXXXX']);
    g.active = { type: 'T', rot: 0, x: 0, y: HEIGHT - 2 };
    Object.assign(g, { lastWasRotation: true, lastKick: 0 });
    g.hardDrop();
    expect(lastLock(g)).toMatchObject({ spin: 'mini', label: 'Mini T-Spin Single', points: 200 });
  });

  it('detects a perfect clear and tracks combos', () => {
    const g = new Game({ mode: 'marathon', seed: 1 });
    setBottom(g.grid, ['XXXXXX....']);
    g.active = { type: 'I', rot: 0, x: 6, y: HEIGHT - 4 };
    g.hardDrop();
    const lock = lastLock(g);
    expect(lock.perfect).toBe(true);
    expect(g.stats.perfectClears).toBe(1);
    expect(g.combo).toBe(0);
    expect(lock.label).toContain('Perfect Clear');
  });

  it('levels up every ten lines in marathon and finishes sprint at 40', () => {
    const m = new Game({ mode: 'marathon', seed: 1, startLevel: 3 });
    m.lines = 9;
    setBottom(m.grid, ['XXXXXX....']);
    m.active = { type: 'I', rot: 0, x: 6, y: HEIGHT - 4 };
    m.hardDrop();
    expect(m.level).toBe(4);
    expect(m.events.some((e) => e.type === 'levelup')).toBe(true);

    const s = new Game({ mode: 'sprint', seed: 1 });
    s.lines = 39;
    setBottom(s.grid, ['XXXXXX....']);
    s.active = { type: 'I', rot: 0, x: 6, y: HEIGHT - 4 };
    s.hardDrop();
    expect(s.over).toBe(true);
    expect(s.won).toBe(true);
    expect(s.level).toBe(1);
  });

  it('ends ultra when time runs out', () => {
    const g = new Game({ mode: 'ultra', seed: 1 });
    g.frame = MODES.ultra.timeLimitFrames! - 1;
    g.step();
    expect(g.over).toBe(true);
    expect(g.endReason).toBe('Time up');
  });

  it('starts dig with ten cheese rows and wins once they are gone', () => {
    const g = new Game({ mode: 'dig', seed: 5 });
    expect(g.garbageLeft).toBe(10);
    const rows = bottomRows(g.grid, 10);
    for (let i = 1; i < rows.length; i++) expect(rows[i].indexOf('.')).not.toBe(rows[i - 1].indexOf('.'));
    // Leave one garbage row and clear it.
    for (let y = 0; y < HEIGHT - 1; y++) g.grid[y].fill(0);
    const hole = g.grid[HEIGHT - 1].indexOf(0);
    g.active = { type: 'I', rot: 1, x: hole - 2, y: HEIGHT - 6 };
    g.hardDrop();
    expect(g.over).toBe(true);
    expect(g.won).toBe(true);
  });

  it('master mode drops pieces instantly and shortens lock delay', () => {
    const g = new Game({ mode: 'master', seed: 1, startLevel: 10 });
    expect(g.grounded()).toBe(true);
    expect(g.lockDelay()).toBeLessThan(LOCK_DELAY);
    g.move(1);
    expect(g.grounded()).toBe(true);
    expect(g.gravity()).toBe(20);
  });

  it('zen mode clears the field instead of ending', () => {
    const g = new Game({ mode: 'zen', seed: 1 });
    for (let y = TOP - 3; y < HEIGHT; y++) g.grid[y].fill(8);
    for (let y = TOP - 3; y < HEIGHT; y++) g.grid[y][9] = 0;
    g.active = { type: 'O', rot: 0, x: 4, y: 0 };
    g.hardDrop();
    expect(g.over).toBe(false);
    expect(g.stats.zenResets).toBe(1);
    expect(g.active).not.toBeNull();
  });
});

describe('versus garbage', () => {
  it('cancels incoming garbage with attack and sends the rest', () => {
    const g = new Game({ mode: 'versus', seed: 1 });
    g.receiveGarbage(3);
    g.receiveGarbage(0);
    expect(g.pendingGarbage()).toBe(3);
    setBottom(g.grid, ['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.']);
    g.active = { type: 'I', rot: 1, x: 7, y: HEIGHT - 8 };
    g.hardDrop();
    expect(g.pendingGarbage()).toBe(0);
    expect(g.drainAttack()).toBe(1);
    expect(g.drainAttack()).toBe(0);
  });

  it('raises pending garbage after a lock that clears nothing', () => {
    const g = new Game({ mode: 'versus', seed: 1 });
    g.receiveGarbage(2);
    g.hardDrop();
    expect(g.stats.garbageReceived).toBe(2);
    const rows = bottomRows(g.grid, 2);
    for (const r of rows) expect(r.split('.').length - 1).toBeGreaterThanOrEqual(1);
    expect(g.events.some((e) => e.type === 'garbage')).toBe(true);
  });

  it('tops out when garbage pushes blocks out of the buffer', () => {
    const g = new Game({ mode: 'versus', seed: 1 });
    g.grid[1][0] = 8;
    g.receiveGarbage(5);
    g.hardDrop();
    expect(g.over).toBe(true);
    expect(g.endReason).toBe('Garbage out');
  });
});
