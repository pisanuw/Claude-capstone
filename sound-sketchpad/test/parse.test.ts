import { describe, expect, it } from 'vitest';
import { parseDescription, tokenize } from '../src/core/parse.js';

describe('tokenize', () => {
  it('lowercases, strips punctuation, and splits', () => {
    expect(tokenize('A Muffled, EXPLOSION!')).toEqual(['a', 'muffled', 'explosion']);
  });

  it('merges known two-word forms and hyphenations', () => {
    expect(tokenize('power up sound')).toEqual(['powerup', 'sound']);
    expect(tokenize('8-bit level up')).toEqual(['8bit', 'levelup']);
    expect(tokenize('foot steps on gravel')).toEqual(['footsteps', 'on', 'gravel']);
  });

  it('handles empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ...   ')).toEqual([]);
  });
});

describe('parseDescription', () => {
  it('picks the base sound and applies modifiers in order', () => {
    const r = parseDescription('muffled explosion heard from underground');
    expect(r.baseId).toBe('explosion');
    expect(r.baseWord).toBe('explosion');
    expect(r.fallback).toBe(false);
    expect(r.modifiers.map((m) => m.id)).toEqual(['muffled']);
  });

  it('first matching base wins; later distinct bases are reported ignored', () => {
    const r = parseDescription('a coin dropped during an explosion');
    expect(r.baseId).toBe('coin');
    expect(r.ignoredBases).toEqual(['explosion']);
  });

  it('repeated words of the same base are not reported as ignored', () => {
    const r = parseDescription('boom boom explosion');
    expect(r.baseId).toBe('explosion');
    expect(r.ignoredBases).toEqual([]);
  });

  it('deduplicates modifiers mapping to the same id', () => {
    const r = parseDescription('a huge massive giant thud');
    expect(r.modifiers.map((m) => m.id)).toEqual(['huge']);
  });

  it('falls back to a generic whoosh when nothing matches', () => {
    const r = parseDescription('xylophone zeitgeist');
    expect(r.fallback).toBe(true);
    expect(r.baseId).toBe('whoosh');
    expect(r.baseWord).toBeNull();
  });

  it('modifiers still apply in fallback mode', () => {
    const r = parseDescription('something deep and echoing');
    expect(r.fallback).toBe(true);
    expect(r.modifiers.map((m) => m.id).sort()).toEqual(['deep', 'echoing']);
  });

  it('is deterministic: same words, same seed and spec', () => {
    const a = parseDescription('tiny metallic coin');
    const b = parseDescription('tiny metallic coin');
    expect(a.seed).toBe(b.seed);
    expect(a.spec).toEqual(b.spec);
  });

  it('different descriptions get different seeds', () => {
    expect(parseDescription('coin').seed).not.toBe(parseDescription('laser').seed);
  });

  it('keeps the raw description as the spec name', () => {
    expect(parseDescription('Muffled explosion').spec.name).toBe('Muffled explosion');
    expect(parseDescription('').spec.name).toBe('whoosh');
  });

  it('example descriptions from the idea both resolve sensibly', () => {
    const a = parseDescription('muffled explosion heard from underground');
    expect(a.baseId).toBe('explosion');
    expect(a.modifiers.map((m) => m.id)).toContain('muffled');

    const b = parseDescription('coin flicked across a marble table');
    expect(b.baseId).toBe('coin');
    expect(b.modifiers.map((m) => m.id)).toContain('wooden');
  });
});
