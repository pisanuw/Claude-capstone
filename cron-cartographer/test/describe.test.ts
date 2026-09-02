import { describe, expect, it } from 'vitest';
import { parseCron } from '../src/core/cron.js';
import { describeCron, describeRRule } from '../src/core/describe.js';
import { parseRRule } from '../src/core/rrule.js';

const d = (expr: string): string => describeCron(parseCron(expr));

describe('describeCron', () => {
  it('describes clock-time schedules', () => {
    expect(d('15 4 * * 1-5')).toBe('At 04:15 on Monday through Friday');
    expect(d('0 0 * * *')).toBe('At 00:00');
    expect(d('0 9,17 * * *')).toBe('At 09:00 and 17:00');
  });

  it('describes step and star fields', () => {
    expect(d('* * * * *')).toBe('Every minute');
    expect(d('*/10 * * * *')).toBe('Every 10th minute');
    expect(d('0 * * * *')).toBe('At minute 0 past every hour');
    expect(d('*/5 9-17 * * *')).toBe('Every 5th minute past hour 9 through 17');
  });

  it('describes date restrictions', () => {
    expect(d('0 0 1 1 *')).toBe('At 00:00 on day-of-month 1 in January');
    expect(d('0 12 * * 0,6')).toBe('At 12:00 on Sunday and Saturday');
    expect(d('30 6 1,15 * *')).toBe('At 06:30 on day-of-month 1 and 15');
  });

  it('phrases the dom/dow union with "or"', () => {
    expect(d('0 0 13 * 5')).toBe('At 00:00 on day-of-month 13 or on Friday');
  });

  it('falls back to field-wise wording for large time sets', () => {
    expect(d('0,10,20,30 8,12,16 * * *')).toBe('At minute 0, 10, 20, and 30 past hour 8, 12, and 16');
  });
});

describe('describeRRule', () => {
  const r = (rule: string): string => describeRRule(parseRRule(rule));

  it('describes weekly rules with days and times', () => {
    expect(r('FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9')).toBe('Every week on Monday and Friday at 09:00');
    expect(r('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('Every 2 weeks on Monday');
  });

  it('describes monthly ordinals and yearly rules', () => {
    expect(r('FREQ=MONTHLY;BYDAY=1MO')).toBe('Every month on the 1st Monday');
    expect(r('FREQ=MONTHLY;BYDAY=-1FR')).toBe('Every month on the last Friday');
    expect(r('FREQ=MONTHLY;BYMONTHDAY=1,15')).toBe('Every month on the 1st and 15th');
    expect(r('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1')).toBe('Every year on the 1st in January');
  });

  it('mentions COUNT and UNTIL', () => {
    expect(r('FREQ=DAILY;COUNT=10')).toBe('Every day, 10 times');
    expect(r('FREQ=DAILY;UNTIL=20261231')).toBe('Every day, until 2026-12-31');
  });
});
