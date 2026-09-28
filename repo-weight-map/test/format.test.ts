import { describe, expect, it } from 'vitest';
import { baseName, dirName, extensionOf, formatBytes, formatPct, normalizePath, stripFirstSegment } from '../src/core/format.js';

describe('formatBytes', () => {
  it('picks units and precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(15 * 1024)).toBe('15.0 KB');
    expect(formatBytes(150 * 1024)).toBe('150 KB');
    expect(formatBytes(3.5 * 1024 ** 3)).toBe('3.50 GB');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.00 TB');
    expect(formatBytes(5000 * 1024 ** 4)).toBe('5000 TB');
  });
  it('is defensive about bad numbers', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('formatPct', () => {
  it('formats with one decimal under 10%', () => {
    expect(formatPct(1, 200)).toBe('0.5%');
    expect(formatPct(50, 200)).toBe('25%');
    expect(formatPct(1, 0)).toBe('0%');
  });
});

describe('path helpers', () => {
  it('normalizes separators and dots', () => {
    expect(normalizePath('.\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizePath('/a//b/')).toBe('a/b');
    expect(normalizePath('')).toBe('');
  });
  it('strips the picked folder name from webkitRelativePath', () => {
    expect(stripFirstSegment('proj/src/a.ts')).toBe('src/a.ts');
    expect(stripFirstSegment('proj')).toBe('');
  });
  it('splits names and extensions', () => {
    expect(baseName('a/b/c.txt')).toBe('c.txt');
    expect(baseName('c.txt')).toBe('c.txt');
    expect(dirName('a/b/c.txt')).toBe('a/b');
    expect(dirName('c.txt')).toBe('');
    expect(extensionOf('a/b/c.TXT')).toBe('txt');
    expect(extensionOf('a/.env')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('x.tar.gz')).toBe('gz');
  });
});
