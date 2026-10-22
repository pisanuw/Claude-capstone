import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isDay, prettyDay, relative, termKey, today } from '../src/core/dates';
import { gradePoints, meets } from '../src/core/grades';

describe('dates', () => {
  it('validates calendar days', () => {
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('26-01-01')).toBe(false);
  });

  it('counts days across DST and month ends', () => {
    expect(daysBetween('2026-10-22', '2026-11-05')).toBe(14);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-05', '2026-10-22')).toBe(-14);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats local today and pretty days', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(prettyDay('2026-12-01')).toBe('Dec 1, 2026');
    expect(prettyDay('soon')).toBe('soon');
  });

  it('describes relative days', () => {
    expect(relative('2026-10-22', '2026-10-22')).toBe('today');
    expect(relative('2026-10-22', '2026-10-23')).toBe('tomorrow');
    expect(relative('2026-10-22', '2026-10-21')).toBe('yesterday');
    expect(relative('2026-10-22', '2026-10-30')).toBe('in 8 days');
    expect(relative('2026-10-22', '2026-10-12')).toBe('10 days ago');
  });

  it('orders terms in any common spelling', () => {
    expect(termKey('Fall 2025')).toBe(20254);
    expect(termKey('Autumn 2025')).toBe(20254);
    expect(termKey('Wi26')).toBe(20261);
    expect(termKey('2026 Spring')).toBe(20262);
    expect(termKey('Summer 2024')).toBe(20243);
    expect(termKey('2024')).toBe(20240);
    expect(termKey('last year')).toBeNull();
    expect(termKey('Winter 2026')! < termKey('Spring 2026')!).toBe(true);
    expect(termKey('Fall 2025')! < termKey('Winter 2026')!).toBe(true);
  });
});

describe('grades', () => {
  it('ranks letters and grade points', () => {
    expect(gradePoints('a-')).toBe(3.7);
    expect(gradePoints(' B+ ')).toBe(3.3);
    expect(gradePoints('3.8')).toBe(3.8);
    expect(gradePoints('4')).toBe(4);
    expect(gradePoints('P')).toBeNull();
    expect(gradePoints('')).toBeNull();
    expect(gradePoints('9.5')).toBeNull();
  });

  it('compares across scales', () => {
    expect(meets('A', 'A-')).toBe(true);
    expect(meets('3.7', 'A-')).toBe(true);
    expect(meets('3.6', 'A-')).toBe(false);
    expect(meets('A+', '4.0')).toBe(true);
    expect(meets('CR', 'B')).toBeNull();
    expect(meets('A', 'excellent')).toBeNull();
  });
});
