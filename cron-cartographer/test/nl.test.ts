import { describe, expect, it } from 'vitest';
import { naturalLanguageToCron } from '../src/core/nl.js';

const cron = (text: string): string | null => naturalLanguageToCron(text)?.cron ?? null;

describe('naturalLanguageToCron', () => {
  it('handles the flagship example', () => {
    expect(cron('every weekday at 4:15am')).toBe('15 4 * * 1-5');
  });

  it('handles minute and hour intervals', () => {
    expect(cron('every 5 minutes')).toBe('*/5 * * * *');
    expect(cron('every minute')).toBe('* * * * *');
    expect(cron('every 2 hours')).toBe('0 */2 * * *');
    expect(cron('hourly')).toBe('0 * * * *');
  });

  it('handles times of day in several forms', () => {
    expect(cron('daily at 9am')).toBe('0 9 * * *');
    expect(cron('every day at 16:30')).toBe('30 16 * * *');
    expect(cron('at noon')).toBe('0 12 * * *');
    expect(cron('at midnight')).toBe('0 0 * * *');
    expect(cron('every day at 6am and 6pm')).toBe('0 6,18 * * *');
    expect(cron('at 12pm')).toBe('0 12 * * *');
    expect(cron('at 12am')).toBe('0 0 * * *');
  });

  it('handles weekdays, weekends, and named days', () => {
    expect(cron('weekdays at 8am')).toBe('0 8 * * 1-5');
    expect(cron('weekends at noon')).toBe('0 12 * * 0,6');
    expect(cron('every monday and friday at 9:30pm')).toBe('30 21 * * 1,5');
    expect(cron('on tuesdays')).toBe('0 0 * * 2');
  });

  it('handles day-of-month and month phrases', () => {
    expect(cron('at midnight on the first of each month')).toBe('0 0 1 * *');
    expect(cron('on the 15th at 6am')).toBe('0 6 15 * *');
    expect(cron('monthly')).toBe('0 0 1 * *');
    expect(cron('every quarter')).toBe('0 0 1 1,4,7,10 *');
    expect(cron('yearly')).toBe('0 0 1 1 *');
    expect(cron('every day in january at 8am')).toBe('0 8 * 1 *');
  });

  it('notes assumptions it makes', () => {
    const r = naturalLanguageToCron('weekly');
    expect(r?.cron).toBe('0 0 * * 1');
    expect(r?.notes.join(' ')).toMatch(/Monday/);
    expect(r?.notes.join(' ')).toMatch(/00:00/);
  });

  it('handles "every other day" with a month-boundary note', () => {
    const r = naturalLanguageToCron('every other day at 7am');
    expect(r?.cron).toBe('0 7 */2 * *');
    expect(r?.notes.join(' ')).toMatch(/month boundary/);
  });

  it('is honest about what cron cannot express', () => {
    expect(naturalLanguageToCron('every 2 weeks')).toBeNull();
    expect(naturalLanguageToCron('on the last day of the month')).toBeNull();
  });

  it('returns null for input with no schedule signal', () => {
    expect(naturalLanguageToCron('hello world')).toBeNull();
    expect(naturalLanguageToCron('')).toBeNull();
    expect(naturalLanguageToCron('the quick brown fox')).toBeNull();
  });
});
