import { describe, expect, it } from 'vitest';
import { decodeResponses, decodeViva, encodeResponse, encodeViva, fromBase64Url, toBase64Url, vivaId, vivaLink } from '../src/core/pack';
import { Session } from '../src/core/session';
import { viva } from './fixtures';

describe('base64url', () => {
  it('round-trips bytes of every value, including large arrays', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 37) % 256);
    const s = toBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(fromBase64Url(s)).toEqual(bytes);
  });
});

describe('viva links', () => {
  it('round-trips a viva through the link fragment', () => {
    const v = viva();
    const link = vivaLink('https://x.test/app/?a=1#old', v);
    expect(link.startsWith('https://x.test/app/?a=1#viva=cv1.')).toBe(true);
    expect(decodeViva(link.slice(link.indexOf('#')))).toEqual(v);
    expect(decodeViva(encodeViva(v))).toEqual(v);
  });
  it('rejects damaged or foreign codes', () => {
    expect(decodeViva('#viva=cv1.AAAA')).toBeNull();
    expect(decodeViva('nonsense')).toBeNull();
    const bad = encodeViva({ ...viva(), questions: [{ id: 1 } as never] });
    expect(decodeViva(bad)).toBeNull();
  });
  it('changes the viva id when questions or timing change', () => {
    const v = viva();
    expect(vivaId(v)).toBe(vivaId(viva()));
    expect(vivaId({ ...v, timeMultiplier: 1.5 })).not.toBe(vivaId(v));
    expect(vivaId({ ...v, questions: [{ ...v.questions[0]!, prompt: 'edited' }] })).not.toBe(vivaId(v));
  });
});

describe('response codes', () => {
  it('finds every code in pasted text and counts damaged ones', () => {
    const s = new Session(viva(), () => 0);
    s.answer('An answer about _sort');
    const code = encodeResponse(s.transcript());
    expect(code.startsWith('CVR1.')).toBe(true);
    const text = `Hi prof, here it is:\n${code}\nthanks\n\nAnd mine: ${code} also CVR1.broken and CVR1.${toBase64Url(new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]))}`;
    const res = decodeResponses(text);
    expect(res.transcripts).toHaveLength(2);
    expect(res.transcripts[0]!.questions[0]!.turns[1]!.text).toBe('An answer about _sort');
    expect(res.errors).toBe(2);
  });
});
