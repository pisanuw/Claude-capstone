import { describe, expect, it } from 'vitest';
import { CONCEPTS, getAnalogy, getConcept } from '../src/core/corpus/index';
import { AUDIENCES } from '../src/core/types';

describe('corpus integrity', () => {
  it('ships at least a dozen concepts', () => {
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(12);
  });

  it('has globally unique concept and analogy ids', () => {
    const conceptIds = CONCEPTS.map((c) => c.id);
    expect(new Set(conceptIds).size).toBe(conceptIds.length);
    const analogyIds = CONCEPTS.flatMap((c) => c.analogies.map((a) => a.id));
    expect(new Set(analogyIds).size).toBe(analogyIds.length);
  });

  it('gives every concept at least three analogies from distinct domains', () => {
    for (const concept of CONCEPTS) {
      expect(concept.analogies.length, concept.id).toBeGreaterThanOrEqual(3);
      const domains = concept.analogies.map((a) => a.domain);
      expect(new Set(domains).size, concept.id).toBe(domains.length);
    }
  });

  it('names analogy ids as conceptId--domain', () => {
    for (const concept of CONCEPTS) {
      for (const analogy of concept.analogies) {
        expect(analogy.id).toBe(`${concept.id}--${analogy.domain}`);
      }
    }
  });

  it('writes a substantial variant for all four audiences of every analogy', () => {
    for (const concept of CONCEPTS) {
      for (const analogy of concept.analogies) {
        for (const audience of AUDIENCES) {
          const text = analogy.text[audience];
          expect(text.length, `${analogy.id}/${audience}`).toBeGreaterThan(120);
        }
      }
    }
  });

  it('keeps child variants shorter than undergrad variants on average', () => {
    let child = 0;
    let undergrad = 0;
    let n = 0;
    for (const concept of CONCEPTS) {
      for (const analogy of concept.analogies) {
        child += analogy.text.child.length;
        undergrad += analogy.text.undergrad.length;
        n += 1;
      }
    }
    expect(child / n).toBeLessThan(undergrad / n);
  });

  it('gives every analogy a mapping table with at least three rows', () => {
    for (const concept of CONCEPTS) {
      for (const analogy of concept.analogies) {
        expect(analogy.maps.length, analogy.id).toBeGreaterThanOrEqual(3);
        for (const m of analogy.maps) {
          expect(m.code.trim()).not.toBe('');
          expect(m.analog.trim()).not.toBe('');
        }
      }
    }
  });

  it('has non-empty names and taglines, and titles without trailing whitespace', () => {
    for (const concept of CONCEPTS) {
      expect(concept.name.trim()).toBe(concept.name);
      expect(concept.name).not.toBe('');
      expect(concept.tagline).not.toBe('');
      for (const analogy of concept.analogies) {
        expect(analogy.title.trim()).toBe(analogy.title);
        expect(analogy.domainLabel.trim()).not.toBe('');
      }
    }
  });

  it('contains no em dashes in any prose (house style)', () => {
    for (const concept of CONCEPTS) {
      expect(concept.tagline).not.toContain('—');
      for (const analogy of concept.analogies) {
        expect(analogy.title).not.toContain('—');
        for (const audience of AUDIENCES) {
          expect(analogy.text[audience], `${analogy.id}/${audience}`).not.toContain('—');
        }
      }
    }
  });

  it('looks up concepts and analogies by id', () => {
    expect(getConcept('recursion')?.name).toBe('Recursion');
    expect(getConcept('nope')).toBeUndefined();
    const hit = getAnalogy('recursion--cooking');
    expect(hit?.concept.id).toBe('recursion');
    expect(hit?.analogy.domain).toBe('cooking');
    expect(getAnalogy('recursion--nope')).toBeUndefined();
  });
});
