import { describe, expect, it } from 'vitest';
import { validateSet } from '../src/core/library';
import { bundledSets } from '../src/data/sets';
import { isBrowserReserved, parseCombo, comboForPlatform } from '../src/core/keys';

const good = {
  version: 1,
  id: 'my-tool',
  name: 'My tool',
  tool: 'MyTool',
  shortcuts: [
    { id: 'one', task: 'Do one', combo: 'Ctrl+1' },
    { id: 'two', task: 'Do two', combo: 'Ctrl+K Ctrl+S', mac: 'Meta+K', hint: 'a chord' },
  ],
};

describe('validateSet', () => {
  it('accepts a well-formed set and trims fields', () => {
    const r = validateSet({ ...good, name: '  My tool  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.set.name).toBe('My tool');
      expect(r.set.shortcuts).toHaveLength(2);
      expect(r.warnings).toEqual([]);
    }
  });

  it('rejects non-objects and wrong versions', () => {
    expect(validateSet(null).ok).toBe(false);
    expect(validateSet('x').ok).toBe(false);
    const r = validateSet({ ...good, version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/"version"/);
  });

  it('rejects bad ids, names, and empty shortcut lists', () => {
    expect(validateSet({ ...good, id: 'Bad Id!' }).ok).toBe(false);
    expect(validateSet({ ...good, name: '' }).ok).toBe(false);
    expect(validateSet({ ...good, tool: 'x'.repeat(81) }).ok).toBe(false);
    expect(validateSet({ ...good, shortcuts: [] }).ok).toBe(false);
  });

  it('rejects duplicate and malformed shortcuts with useful messages', () => {
    const r = validateSet({
      ...good,
      shortcuts: [
        { id: 'one', task: 'A', combo: 'Ctrl+1' },
        { id: 'one', task: 'B', combo: 'Ctrl+2' },
        { id: 'bad', task: 'C', combo: 'Ctrl+' },
        { id: 'no-task', task: '', combo: 'Ctrl+3' },
        'not-an-object',
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('duplicate id'))).toBe(true);
      expect(r.errors.some((e) => e.includes('bad combo'))).toBe(true);
      expect(r.errors.some((e) => e.includes('"task"'))).toBe(true);
      expect(r.errors.some((e) => e.includes('not an object'))).toBe(true);
    }
  });

  it('validates mac overrides and hints', () => {
    expect(
      validateSet({ ...good, shortcuts: [{ id: 'x', task: 'X', combo: 'Ctrl+1', mac: 'nope+' }] }).ok,
    ).toBe(false);
    expect(
      validateSet({ ...good, shortcuts: [{ id: 'x', task: 'X', combo: 'Ctrl+1', hint: 'h'.repeat(201) }] })
        .ok,
    ).toBe(false);
  });

  it('drops browser-reserved combos with a warning, not an error', () => {
    const r = validateSet({
      ...good,
      shortcuts: [
        { id: 'ok', task: 'Fine', combo: 'Ctrl+1' },
        { id: 'closes', task: 'Close tab', combo: 'Ctrl+W' },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.set.shortcuts.map((s) => s.id)).toEqual(['ok']);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatch(/reserves/);
    }
  });

  it('fails when every shortcut is reserved', () => {
    const r = validateSet({ ...good, shortcuts: [{ id: 'w', task: 'W', combo: 'Ctrl+W' }] });
    expect(r.ok).toBe(false);
  });

  it('accepts vim notation and rejects other values', () => {
    const withNotation = { ...good, notation: 'vim' };
    const r = validateSet(withNotation);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set.notation).toBe('vim');
    expect(validateSet({ ...good, notation: 'emacs' }).ok).toBe(false);
  });
});

describe('bundled sets', () => {
  it('every bundled set validates against the same rules as uploads', () => {
    for (const set of bundledSets) {
      const r = validateSet(set);
      expect(r.ok, `${set.id} should validate`).toBe(true);
      if (r.ok) expect(r.warnings, `${set.id} should have no reserved combos`).toEqual([]);
    }
  });

  it('every combo (and mac variant, translated or not) parses and is capturable', () => {
    for (const set of bundledSets) {
      for (const s of set.shortcuts) {
        expect(() => parseCombo(s.combo)).not.toThrow();
        const macCombo = comboForPlatform(s, true);
        expect(() => parseCombo(macCombo)).not.toThrow();
        expect(isBrowserReserved(s.combo), `${set.id}/${s.id}`).toBe(false);
        expect(isBrowserReserved(macCombo), `${set.id}/${s.id} mac`).toBe(false);
      }
    }
  });

  it('has the four advertised tools', () => {
    expect(bundledSets.map((s) => s.id)).toEqual(['vscode', 'devtools', 'figma', 'vim']);
  });
});
