import { describe, expect, it } from 'vitest';
import { allSets, defaultProgress, deserialize, serialize } from '../src/core/store';
import { initialCard } from '../src/core/sm2';
import { bundledSets } from '../src/data/sets';
import type { Progress } from '../src/core/types';

function sample(): Progress {
  const p = defaultProgress();
  p.cards.vscode = { 'command-palette': { ...initialCard(100), seen: 3, correct: 2 } };
  p.days = ['2026-08-19', '2026-08-20'];
  p.settings.setId = 'vim';
  p.settings.newPerDay = 5;
  p.customSets = [
    {
      version: 1,
      id: 'custom',
      name: 'Custom',
      tool: 'Custom',
      shortcuts: [{ id: 'x', task: 'X', combo: 'Ctrl+1' }],
    },
  ];
  return p;
}

describe('serialize/deserialize', () => {
  it('round-trips progress', () => {
    const p = sample();
    expect(deserialize(serialize(p))).toEqual(p);
  });

  it('returns defaults for null, garbage, and unknown versions', () => {
    expect(deserialize(null)).toEqual(defaultProgress());
    expect(deserialize('not json {')).toEqual(defaultProgress());
    expect(deserialize('"just a string"')).toEqual(defaultProgress());
    expect(deserialize(JSON.stringify({ v: 99 }))).toEqual(defaultProgress());
  });

  it('drops malformed card states but keeps valid ones', () => {
    const raw = {
      v: 1,
      cards: {
        vscode: {
          good: initialCard(1),
          bad: { ef: 'high' },
          worse: null,
        },
        empty: { alsoBad: 42 },
      },
    };
    const p = deserialize(JSON.stringify(raw));
    expect(Object.keys(p.cards)).toEqual(['vscode']);
    expect(Object.keys(p.cards.vscode)).toEqual(['good']);
  });

  it('filters malformed days and sorts them', () => {
    const p = deserialize(JSON.stringify({ v: 1, days: ['2026-08-20', 'nope', 3, '2026-08-19'] }));
    expect(p.days).toEqual(['2026-08-19', '2026-08-20']);
  });

  it('drops invalid custom sets silently', () => {
    const p = deserialize(
      JSON.stringify({ v: 1, customSets: [{ nope: true }, sample().customSets[0]] }),
    );
    expect(p.customSets).toHaveLength(1);
    expect(p.customSets[0].id).toBe('custom');
  });

  it('clamps bad settings back to defaults', () => {
    const p = deserialize(
      JSON.stringify({ v: 1, settings: { setId: 42, newPerDay: 999, macMode: 'yes' } }),
    );
    expect(p.settings).toEqual(defaultProgress().settings);
  });
});

describe('allSets', () => {
  it('lists bundled then custom', () => {
    const p = sample();
    const sets = allSets(bundledSets, p);
    expect(sets.map((s) => s.id)).toEqual(['vscode', 'devtools', 'figma', 'vim', 'custom']);
  });
});
