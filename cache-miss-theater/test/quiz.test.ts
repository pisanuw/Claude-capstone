import { describe, expect, it } from 'vitest';
import { simulate, sets, validateConfig } from '../src/core/cache';
import { TEMPLATE_NAMES, describeCache, generate, toMarkdown, toQti } from '../src/core/quiz';
import { buildTrace } from '../src/core/trace';

describe('question generator', () => {
  const qs = generate(11, 24);

  it('is deterministic per seed and cycles through templates', () => {
    expect(generate(11, 24)).toEqual(qs);
    expect(qs).toHaveLength(24);
    expect(new Set(qs.map((q) => q.template))).toEqual(new Set(TEMPLATE_NAMES));
    expect(generate(12, 6)).not.toEqual(generate(11, 6));
  });

  it('only uses valid caches and code that runs', () => {
    for (const q of qs) {
      expect(validateConfig(q.cache)).toEqual([]);
      expect(() => buildTrace(q.code)).not.toThrow();
    }
  });

  it('answers agree with an independent simulation', () => {
    for (const q of qs) {
      const st = simulate(buildTrace(q.code), q.cache).stats;
      if (q.template === 'traversal') expect(q.answer).toBe(st.misses);
      if (q.template === 'stride') expect(q.answer).toBe(st.hits);
      if (q.template === 'conflict') expect(q.answer).toBe(st.conflict);
      if (q.template === 'classify') expect(q.answer).toBe(st.capacity);
      if (q.template === 'which-set') {
        const t = buildTrace(q.code);
        expect(q.answer).toBe(Math.floor((t.addr[0] as number) / q.cache.lineSize) % sets(q.cache));
      }
      if (q.template === 'loop-order') {
        expect(q.options?.filter((o) => o.correct)).toHaveLength(1);
        expect(q.options?.[q.answer]?.correct).toBe(true);
      }
    }
  });

  it('respects the template filter', () => {
    expect(generate(1, 4, ['stride']).every((q) => q.template === 'stride')).toBe(true);
    expect(generate(1, 4, ['nope'])).toEqual([]);
  });

  it('describes caches', () => {
    expect(describeCache({ size: 1024, lineSize: 32, ways: 1, policy: 'lru', writeAllocate: true, writeBack: true, seed: 1 })).toMatch(/^1 KB direct-mapped cache, 32-byte lines \(32 sets\)/);
    expect(describeCache({ size: 256, lineSize: 32, ways: 8, policy: 'fifo', writeAllocate: false, writeBack: false, seed: 1 })).toMatch(/256 B fully associative cache, 32-byte lines \(1 set\), FIFO.*no-write-allocate, write-through/);
    expect(describeCache({ size: 512, lineSize: 16, ways: 4, policy: 'lru', writeAllocate: true, writeBack: true, seed: 1 })).toMatch(/4-way set-associative/);
  });

  it('exports Markdown with an answer key', () => {
    const md = toMarkdown(qs.slice(0, 6));
    expect(md).toMatch(/^# Cache questions/);
    expect(md.match(/## Question/g)).toHaveLength(6);
    expect(md).toContain('# Answer key');
    expect(md).toContain('```c');
  });

  it('exports well-formed QTI with escaped code', () => {
    const xml = toQti(qs.slice(0, 6));
    expect(xml).toContain('<questestinterop');
    expect(xml).toContain('numerical_question');
    expect(xml).toContain('multiple_choice_question');
    expect(xml).not.toMatch(/<pre>/);
    expect(xml).toContain('&lt;pre&gt;');
    expect(xml).toContain('i &amp;lt; ');
    expect((xml.match(/<item /g) ?? []).length).toBe(6);
  });
});
