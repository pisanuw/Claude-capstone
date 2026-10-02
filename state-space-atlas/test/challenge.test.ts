import { describe, expect, it } from 'vitest';
import { challengeFromHash, challengeUrl, decodeChallenge, encodeChallenge, judgeChallenge, validateChallenge, type Challenge } from '../src/core/challenge';
import { KLOTSKI_MINI } from '../src/core/presets';
import { PuzzleError } from '../src/core/puzzle';

const sample: Challenge = {
  v: 1,
  title: 'Beat 300 expansions on mini Klotski',
  def: KLOTSKI_MINI,
  algorithm: 'astar',
  targetExpanded: 300,
  requireAdmissible: true,
  note: 'Use the goal piece and the blockers.',
};

describe('challenge encoding', () => {
  it('round-trips through base64url', () => {
    const enc = encodeChallenge(sample);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeChallenge(enc)).toEqual(sample);
  });

  it('builds and reads a share URL', () => {
    const url = challengeUrl('https://example.test/atlas/#old', sample);
    expect(url.startsWith('https://example.test/atlas/#c=')).toBe(true);
    const hash = url.slice(url.indexOf('#'));
    expect(challengeFromHash(hash)).toEqual(sample);
    expect(challengeFromHash('')).toBeNull();
    expect(challengeFromHash('#p=xyz')).toBeNull();
    expect(challengeFromHash('#c=!!!')).toBeNull();
    expect(() => challengeFromHash('#c=AAAA')).toThrow(PuzzleError);
    expect(() => decodeChallenge('bm90anNvbg')).toThrow(/damaged/);
  });

  it('validates every field', () => {
    expect(() => validateChallenge(null)).toThrow(/object/);
    expect(() => validateChallenge({ ...sample, v: 2 })).toThrow(/version/);
    expect(() => validateChallenge({ ...sample, title: 7 })).toThrow(/title/);
    expect(() => validateChallenge({ ...sample, algorithm: 'dijkstra' })).toThrow(/algorithm/);
    expect(() => validateChallenge({ ...sample, targetExpanded: 0 })).toThrow(/positive/);
    expect(() => validateChallenge({ ...sample, note: 'x'.repeat(1001) })).toThrow(/note/);
    expect(() => validateChallenge({ ...sample, def: { kind: 'hanoi', disks: 99 } })).toThrow(PuzzleError);
    const minimal = validateChallenge({ v: 1, title: 't', def: { kind: 'hanoi', disks: 3 }, algorithm: 'bfs', targetExpanded: 5 });
    expect(minimal.requireAdmissible).toBe(true);
    expect(minimal.note).toBeUndefined();
  });
});

describe('judgeChallenge', () => {
  it('declares victory only when every condition holds', () => {
    expect(judgeChallenge(sample, { expanded: 120, found: true, algorithm: 'astar', admissible: true })).toEqual({ beaten: true, reasons: [] });
    const lost = judgeChallenge(sample, { expanded: 300, found: false, algorithm: 'bfs', admissible: false });
    expect(lost.beaten).toBe(false);
    expect(lost.reasons).toHaveLength(4);
    expect(lost.reasons.join(' ')).toMatch(/ASTAR.*BFS/);
    const unchecked = judgeChallenge(sample, { expanded: 10, found: true, algorithm: 'astar', admissible: null });
    expect(unchecked.reasons[0]).toMatch(/check first/);
    const relaxed = judgeChallenge({ ...sample, requireAdmissible: false }, { expanded: 10, found: true, algorithm: 'astar', admissible: null });
    expect(relaxed.beaten).toBe(true);
  });
});
