import { describe, expect, it } from 'vitest';
import { packText } from '../src/core/codec';
import { decodePolicy, defaultPolicy, encodePolicy, isEmail, policyProblems, requestLink } from '../src/core/policy';
import { policy } from './fixtures';

describe('policy', () => {
  it('starts with sensible defaults', () => {
    const p = defaultPolicy('K');
    expect(p.leadDays).toBe(21);
    expect(p.requiredDocs).toEqual(['cv', 'statement']);
    expect(policyProblems(p).map((x) => x.field)).toEqual(['professor']);
  });

  it('flags every unusable setting', () => {
    const p = { ...policy(), professor: ' ', email: 'nope', leadDays: -1, maxPrograms: 0, minGrade: 'great', minCourses: 11, publicKey: '' };
    expect(policyProblems(p).map((x) => x.field)).toEqual(['professor', 'email', 'leadDays', 'maxPrograms', 'minGrade', 'minCourses', 'publicKey']);
    expect(policyProblems({ ...policy(), minGrade: '3.5' })).toEqual([]);
  });

  it('checks emails loosely', () => {
    expect(isEmail(' a.b@uw.edu ')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.d')).toBe(false);
  });

  it('round-trips through a link fragment', () => {
    const p = policy({ questions: ['Why?'], conditions: 'Ask early.' });
    const link = requestLink('https://letter-ledger.netlify.app/?x=1#old', p);
    expect(link.startsWith('https://letter-ledger.netlify.app/#ask=ll1.')).toBe(true);
    expect(decodePolicy(new URL(link).hash)).toEqual(p);
    expect(decodePolicy(encodePolicy(p))).toEqual(p);
  });

  it('rejects malformed fragments', () => {
    expect(decodePolicy('#ask=xx')).toBeNull();
    expect(decodePolicy('#ask=ll1.!!!')).toBeNull();
    expect(decodePolicy(`ll1.${packText({ v: 1, professor: 'x' })}`)).toBeNull();
    expect(decodePolicy(`ll1.${packText({ ...policy(), requiredDocs: ['diploma'] })}`)).toBeNull();
    expect(decodePolicy(`ll1.${packText({ ...policy(), publicKey: '' })}`)).toBeNull();
  });
});
