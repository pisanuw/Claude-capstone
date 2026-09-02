import { describe, expect, it } from 'vitest';
import { interpretInput } from '../src/core/interpret.js';

describe('interpretInput', () => {
  it('recognizes a plain cron expression', () => {
    const r = interpretInput('15 4 * * 1-5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('cron');
      expect(r.cron).toBe('15 4 * * 1-5');
      expect(r.description).toBe('At 04:15 on Monday through Friday');
    }
  });

  it('recognizes @shortcuts and RRULEs', () => {
    const daily = interpretInput('@daily');
    expect(daily.ok && daily.kind === 'cron').toBe(true);
    const rrule = interpretInput('FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9');
    expect(rrule.ok).toBe(true);
    if (rrule.ok) {
      expect(rrule.kind).toBe('rrule');
      expect(rrule.cron).toBeNull();
      expect(rrule.description).toBe('Every week on Monday and Friday at 09:00');
    }
  });

  it('recognizes a pasted GitHub Actions snippet', () => {
    const r = interpretInput('on:\n  schedule:\n    - cron: "15 4 * * 1-5"\n    - cron: "0 0 * * 0"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('github-actions');
      expect(r.cron).toBe('15 4 * * 1-5');
      expect(r.notes.join(' ')).toMatch(/UTC/);
      expect(r.notes.join(' ')).toMatch(/2 cron entries/);
    }
  });

  it('falls back to natural language', () => {
    const r = interpretInput('every weekday at 4:15am');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('natural-language');
      expect(r.cron).toBe('15 4 * * 1-5');
    }
  });

  it('keeps the cron error for cron-shaped input', () => {
    const r = interpretInput('61 4 * * *');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/out of range/);
  });

  it('reports honest failure for unparseable input', () => {
    const empty = interpretInput('   ');
    expect(empty.ok).toBe(false);
    const gibberish = interpretInput('the quick brown fox');
    expect(gibberish.ok).toBe(false);
    if (!gibberish.ok) expect(gibberish.hint).toMatch(/every weekday/);
    const badRRule = interpretInput('FREQ=SECONDLY');
    expect(badRRule.ok).toBe(false);
    if (!badRRule.ok) expect(badRRule.error).toMatch(/RRULE/);
  });
});
