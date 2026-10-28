import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SCENES } from '../src/core/scenes';
import { CHORDS } from '../src/core/guitar';
import { FILTER_PRESETS } from '../src/core/filters';
import { tuningTable, AUDIBLE_CENTS } from '../src/core/analysis';
import { TUNING_NOTES } from '../src/core/guitar';

describe('scenes', () => {
  it('reference real chords, presets and settings', () => {
    const chordNames = new Set(CHORDS.map((c) => c.name));
    const presets = new Set(FILTER_PRESETS.map((p) => p.id));
    const keys = new Set(Object.keys(DEFAULT_SETTINGS));
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    for (const scene of SCENES) {
      expect(scene.steps.length).toBeGreaterThan(0);
      if (scene.preset) expect(presets.has(scene.preset)).toBe(true);
      for (const k of Object.keys(scene.set)) expect(keys.has(k), k).toBe(true);
      for (const step of scene.steps) {
        if (step.chord) expect(chordNames.has(step.chord), step.chord).toBe(true);
        if (step.preset) expect(presets.has(step.preset)).toBe(true);
        for (const k of Object.keys(step.set ?? {})) expect(keys.has(k), k).toBe(true);
      }
    }
    expect(CHORDS[DEFAULT_SETTINGS.chord]).toBeDefined();
  });

  it('the quantization scene numbers match the tuning table', () => {
    const at48 = tuningTable(48000, 0.5, TUNING_NOTES);
    expect(Math.max(...at48.slice(0, 6).map((r) => Math.abs(r.cents)))).toBeLessThan(3);
    const e5 = at48.find((r) => r.note === 'E5')!;
    expect(e5.length).toBe(72);
    expect(e5.cents).toBeCloseTo(7.4, 1);
    const at8 = tuningTable(8000, 0.5, TUNING_NOTES);
    expect(at8.find((r) => r.note === 'E4')!.cents).toBeCloseTo(-16.3, 1);
    expect(Math.abs(at8.find((r) => r.note === 'E6')!.cents)).toBeGreaterThan(100);
    expect(AUDIBLE_CENTS).toBeGreaterThan(0);
  });
});

describe('scene speeds', () => {
  it('only use speeds the speed menu offers', () => {
    const offered = new Set([0, 256, 64, 16, 6, 1]);
    for (const scene of SCENES) {
      if (scene.set.speed !== undefined) expect(offered.has(scene.set.speed)).toBe(true);
      for (const step of scene.steps) if (step.set?.speed !== undefined) expect(offered.has(step.set.speed)).toBe(true);
    }
  });
});
