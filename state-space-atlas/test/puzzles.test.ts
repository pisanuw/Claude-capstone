import { describe, expect, it } from 'vitest';
import { createBlocks, mirrorKey, type BlocksState } from '../src/core/blocks';
import { createHanoi, type HanoiState } from '../src/core/hanoi';
import { createTiles, isSolvable, type TilesState } from '../src/core/tiles';
import { createPuzzle, parsePuzzleDef } from '../src/core/factory';
import { PuzzleError } from '../src/core/puzzle';
import { KLOTSKI_CLASSIC, RUSH_HOUR_CARD_1 } from '../src/core/presets';

describe('Towers of Hanoi', () => {
  it('starts with every disk on peg 0 and ends on the last peg', () => {
    const p = createHanoi({ kind: 'hanoi', disks: 3 });
    expect(p.start).toBe('000');
    expect(p.goalKey).toBe('222');
    expect(p.isGoal('222')).toBe(true);
    expect(p.isGoal('221')).toBe(false);
    expect(p.label).toBe('Towers of Hanoi, 3 disks');
  });

  it('only moves the top disk of a peg onto a larger disk or an empty peg', () => {
    const p = createHanoi({ kind: 'hanoi', disks: 3 });
    // Only the smallest disk can move from the full peg.
    expect(p.neighbors('000').sort()).toEqual(['100', '200']);
    // Smallest on peg 1, others on peg 0: smallest can go to 0 or 2, middle disk can go to 2.
    expect(p.neighbors('100').sort()).toEqual(['000', '120', '200']);
  });

  it('decodes a key into stacks from bottom to top', () => {
    const p = createHanoi({ kind: 'hanoi', disks: 3 });
    const s = p.decode('102') as HanoiState;
    expect(s.on).toEqual([1, 0, 2]);
    expect(s.stacks).toEqual([[1], [0], [2]]);
    expect(p.context()).toMatchObject({ kind: 'hanoi', disks: 3, pegs: 3, goalPeg: 2 });
  });

  it('supports four pegs and rejects silly sizes', () => {
    const p = createHanoi({ kind: 'hanoi', disks: 2, pegs: 4 });
    expect(p.neighbors('00').sort()).toEqual(['10', '20', '30']);
    expect(p.label).toContain('4 pegs');
    expect(() => createHanoi({ kind: 'hanoi', disks: 0 })).toThrow(PuzzleError);
    expect(() => createHanoi({ kind: 'hanoi', disks: 9 })).toThrow(/1 to 8/);
    expect(() => createHanoi({ kind: 'hanoi', disks: 3, pegs: 2 })).toThrow(/3 to 5/);
    expect(createHanoi({ kind: 'hanoi', disks: 1 }).label).toBe('Towers of Hanoi, 1 disk');
  });
});

describe('Sliding tiles', () => {
  it('uses the farthest state as the default start and knows its goal', () => {
    const p = createTiles({ kind: 'tiles', rows: 2, cols: 3 });
    expect(p.start).toBe('farthest');
    expect(p.goalKey).toBe('123450');
    expect(p.isGoal('123450')).toBe(true);
    expect(p.label).toBe('2x3 sliding tiles (5-puzzle)');
  });

  it('slides the blank up, down, left and right', () => {
    const p = createTiles({ kind: 'tiles', rows: 3, cols: 3 });
    // Blank in the centre: four neighbours.
    expect(p.neighbors('123405678').sort()).toEqual(['103425678', '123045678', '123450678', '123475608'].sort());
    // Blank in a corner: two neighbours.
    expect(p.neighbors('012345678')).toHaveLength(2);
  });

  it('decodes tiles, the blank and the goal positions', () => {
    const p = createTiles({ kind: 'tiles', rows: 2, cols: 2 });
    const s = p.decode('1302') as TilesState;
    expect(s.tiles).toEqual([
      [1, 3],
      [0, 2],
    ]);
    expect(s.blank).toEqual({ row: 1, col: 0 });
    expect(s.goalRow[3]).toBe(1);
    expect(s.goalCol[3]).toBe(0);
  });

  it('accepts a solvable custom start and rejects an unsolvable one', () => {
    const p = createTiles({ kind: 'tiles', rows: 3, cols: 3, start: [8, 6, 7, 2, 5, 4, 3, 0, 1] });
    expect(p.start).toBe('867254301');
    expect(() => createTiles({ kind: 'tiles', rows: 3, cols: 3, start: [2, 1, 3, 4, 5, 6, 7, 8, 0] })).toThrow(/parity/);
    expect(() => createTiles({ kind: 'tiles', rows: 3, cols: 3, start: [1, 1, 3, 4, 5, 6, 7, 8, 0] })).toThrow(/exactly once/);
    expect(() => createTiles({ kind: 'tiles', rows: 3, cols: 3, start: 'nope' as unknown as 'farthest' })).toThrow(/array/);
    expect(() => createTiles({ kind: 'tiles', rows: 3, cols: 4 })).toThrow(/at most 9/);
    expect(() => createTiles({ kind: 'tiles', rows: 1, cols: 3 })).toThrow(/at least 2/);
  });

  it('handles even-width parity with the blank row', () => {
    // 2x2: swapping two tiles with the blank in the same row is unsolvable...
    expect(isSolvable([2, 1, 3, 0], [1, 2, 3, 0], 2, 2)).toBe(false);
    // ...but a legal move away from the goal is solvable.
    expect(isSolvable([1, 2, 0, 3], [1, 2, 3, 0], 2, 2)).toBe(true);
  });
});

describe('Sliding blocks', () => {
  it('canonicalises same-shape pieces and the mirror image for Klotski', () => {
    const p = createBlocks(KLOTSKI_CLASSIC);
    const s = p.decode(p.start as string) as BlocksState;
    expect(s.pieces).toHaveLength(10);
    expect(s.goalPiece).toMatchObject({ row: 0, col: 1, w: 2, h: 2, goal: true });
    // The four 1x2 vertical pieces share one letter; the four 1x1 pieces another.
    const letters = new Set(s.pieces.map((pc) => pc.shape));
    expect(letters.size).toBe(4);
    expect(p.context()).toMatchObject({ kind: 'blocks', mirror: true, moves: 'free' });
    // The start is the lexicographically smaller of itself and its mirror image.
    const key = p.start as string;
    expect(key <= mirrorKey(key, 5, 4)).toBe(true);
  });

  it('slides a piece one cell into empty space only', () => {
    const p = createBlocks({ kind: 'blocks', grid: ['AA.', '.B.', '...'], goal: { piece: 'B', row: 2, col: 1 }, symmetry: 'none' });
    const start = p.start as string;
    const nbrs = p.neighbors(start);
    // A (1x2) can move right (down is blocked by B); B (1x1) can move down, left, right (up is blocked by A).
    expect(nbrs).toHaveLength(4);
    expect(new Set(nbrs).size).toBe(4);
    expect(p.isGoal(start)).toBe(false);
    expect(p.isGoal('AA.' + '...' + '.X.')).toBe(true);
    expect(p.label).toBe('Sliding blocks 3x3, 2 pieces');
  });

  it('restricts Rush Hour pieces to their long axis', () => {
    const p = createBlocks(RUSH_HOUR_CARD_1);
    const s = p.decode(p.start as string) as BlocksState;
    const nbrs = p.neighbors(p.start as string);
    for (const nk of nbrs) {
      const t = p.decode(nk) as BlocksState;
      // Exactly one piece moved, along its axis.
      const moved = t.pieces.filter((tp) => !s.pieces.some((sp) => sp.row === tp.row && sp.col === tp.col && sp.shape === tp.shape));
      expect(moved).toHaveLength(1);
      const before = s.pieces.find((sp) => !t.pieces.some((tp) => sp.row === tp.row && sp.col === tp.col && sp.shape === tp.shape))!;
      if (moved[0].w > moved[0].h) expect(moved[0].row).toBe(before.row);
      else expect(moved[0].col).toBe(before.col);
    }
    expect(p.context()).toMatchObject({ mirror: false, moves: 'rushhour' });
    expect(p.label).toContain('Rush Hour');
  });

  it('rejects malformed definitions with a clear message', () => {
    const base = { kind: 'blocks' as const, goal: { piece: 'A', row: 0, col: 0 } };
    expect(() => createBlocks({ ...base, grid: [] })).toThrow(/1 to 8 rows/);
    expect(() => createBlocks({ ...base, grid: ['AA', 'A'] })).toThrow(/same length/);
    expect(() => createBlocks({ ...base, grid: ['AA', 'A.'] })).toThrow(/filled rectangle/);
    expect(() => createBlocks({ ...base, grid: ['..', '..'] })).toThrow(/no pieces/);
    expect(() => createBlocks({ ...base, grid: ['BB', '..'] })).toThrow(/not on the grid/);
    expect(() => createBlocks({ kind: 'blocks', grid: ['AA', '..'], goal: { piece: 'A', row: 0, col: 1 } })).toThrow(/outside/);
    expect(() => createBlocks({ kind: 'blocks', grid: ['AA', '..'], goal: { piece: 'A', row: 0, col: 0 }, moves: 'x' as 'free' })).toThrow(/moves/);
    expect(() => createBlocks({ kind: 'blocks', grid: ['A.', '..'], goal: { piece: 'A', row: 1, col: 1 }, symmetry: 'mirror' })).toThrow(/mirror symmetry/);
    expect(() => createBlocks({ kind: 'blocks', grid: ['A.', '..'], goal: { piece: 'A', row: 1, col: 1 }, symmetry: 'bogus' as 'none' })).toThrow(/symmetry must/);
    expect(() => createBlocks({ kind: 'blocks', grid: ['A.'], goal: undefined as unknown as { piece: string; row: number; col: number } })).toThrow(/goal/);
    const manyPieces = ['ABCDEFGH', 'IJKLMNOP', 'QRSTUVWY', 'Zabcdefg'];
    expect(() => createBlocks({ kind: 'blocks', grid: manyPieces, goal: { piece: 'A', row: 0, col: 0 } })).toThrow(/24 pieces/);
  });

  it('turns off mirror symmetry automatically when walls are asymmetric', () => {
    const p = createBlocks({ kind: 'blocks', grid: ['#A.', '...'], goal: { piece: 'A', row: 1, col: 1 } });
    expect(p.context()).toMatchObject({ mirror: false });
    const q = createBlocks({ kind: 'blocks', grid: ['#A#', '...'], goal: { piece: 'A', row: 1, col: 1 } });
    expect(q.context()).toMatchObject({ mirror: true });
  });
});

describe('factory', () => {
  it('builds every kind and rejects unknown kinds', () => {
    expect(createPuzzle({ kind: 'hanoi', disks: 2 }).label).toContain('Hanoi');
    expect(createPuzzle({ kind: 'tiles', rows: 2, cols: 2 }).label).toContain('tiles');
    expect(createPuzzle(KLOTSKI_CLASSIC).label).toContain('blocks');
    expect(() => createPuzzle({ kind: 'cube' } as unknown as { kind: 'hanoi'; disks: number })).toThrow(/Unknown puzzle kind/);
    expect(() => createPuzzle(null as unknown as { kind: 'hanoi'; disks: number })).toThrow(/object/);
  });

  it('parses JSON definitions', () => {
    expect(parsePuzzleDef('{"kind":"hanoi","disks":3}')).toEqual({ kind: 'hanoi', disks: 3 });
    expect(() => parsePuzzleDef('{nope')).toThrow(/Not valid JSON/);
    expect(() => parsePuzzleDef('[1,2]')).toThrow(/JSON object/);
  });
});
