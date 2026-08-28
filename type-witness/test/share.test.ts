import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../src/core/share';

describe('share links', () => {
  it('round-trips plain code', () => {
    const code = 'const x: number = 42;\nlet y = "hi";\n';
    expect(decodeShare('#code=' + encodeShare(code))).toBe(code);
  });

  it('round-trips unicode', () => {
    const code = 'const emoji = "🔎 été";';
    expect(decodeShare('#code=' + encodeShare(code))).toBe(code);
  });

  it('produces URL-safe output', () => {
    const encoded = encodeShare('??>>~~\xff\xfe');
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('rejects hashes without the code prefix', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#other=abc')).toBeNull();
    expect(decodeShare('#code=')).toBeNull();
  });

  it('returns null for mangled payloads', () => {
    expect(decodeShare('#code=!!!not-base64!!!')).toBeNull();
    expect(decodeShare('#code=_w')).toBeNull(); // invalid UTF-8 byte 0xff
  });
});
