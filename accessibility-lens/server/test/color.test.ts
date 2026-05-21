import { describe, it, expect } from 'vitest';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  styleValue,
} from '../src/engine/color.js';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses 3-digit shorthand hex', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses rgb() and rgba()', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30 });
  });

  it('parses named colors', () => {
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('BLACK')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('returns null for transparent, empty, and unsupported values', () => {
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor('hsl(0,0,0)')).toBeNull();
    expect(parseColor('#zz')).toBeNull();
  });

  it('clamps out-of-range rgb values', () => {
    expect(parseColor('rgb(300, -5, 20)')).toEqual({ r: 255, g: 0, b: 20 });
  });
});

describe('contrast math', () => {
  it('computes luminance of pure white and black', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });

  it('gives 21:1 for black on white', () => {
    const ratio = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeCloseTo(21, 1);
  });

  it('is symmetric regardless of argument order', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 200, g: 200, b: 200 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });

  it('flags low contrast grey on white as below AA', () => {
    const ratio = contrastRatio({ r: 170, g: 170, b: 170 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('styleValue', () => {
  it('extracts a declared property value', () => {
    expect(styleValue('color: red; background: blue', 'color')).toBe('red');
    expect(styleValue('color:red;background:blue', 'background')).toBe('blue');
  });

  it('is case-insensitive on the property name', () => {
    expect(styleValue('COLOR: #fff', 'color')).toBe('#fff');
  });

  it('returns null when the property is absent', () => {
    expect(styleValue('color: red', 'background-color')).toBeNull();
  });
});
