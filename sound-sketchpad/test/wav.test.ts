import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/core/wav.js';

const ascii = (view: DataView, offset: number, len: number) => {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
};

describe('encodeWav', () => {
  it('writes a valid 16-bit mono RIFF header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const view = new DataView(encodeWav(samples, 44100, 16));
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(36 + 8); // 4 samples * 2 bytes
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(88200); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
  });

  it('encodes 16-bit samples with clipping', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2]), 8000, 16));
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
    expect(view.getInt16(50, true)).toBe(32767); // clipped
    expect(view.getInt16(52, true)).toBe(-32767); // clipped
  });

  it('encodes 24-bit little-endian samples', () => {
    const view = new DataView(encodeWav(new Float32Array([1, -1]), 48000, 24));
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint16(32, true)).toBe(3);
    expect(view.getUint32(28, true)).toBe(144000);
    // +1 -> 0x7fffff
    expect(view.getUint8(44)).toBe(0xff);
    expect(view.getUint8(45)).toBe(0xff);
    expect(view.getUint8(46)).toBe(0x7f);
    // -1 -> two's complement of -0x7fffff
    const raw = view.getUint8(47) | (view.getUint8(48) << 8) | (view.getUint8(49) << 16);
    const signed = raw > 0x7fffff ? raw - 0x1000000 : raw;
    expect(signed).toBe(-8388607);
  });

  it('total size matches header + data for both depths', () => {
    expect(encodeWav(new Float32Array(100), 22050, 16).byteLength).toBe(44 + 200);
    expect(encodeWav(new Float32Array(100), 22050, 24).byteLength).toBe(44 + 300);
  });
});
