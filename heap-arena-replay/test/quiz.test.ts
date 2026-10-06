import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type HeapConfig } from '../src/core/heap';
import { PRESETS, parseTrace, runTrace } from '../src/core/trace';
import { QUESTION_TYPES, checkAnswer, generateQuiz, quizToMarkdown, type QuestionType } from '../src/core/quiz';
import { assessmentXml, buildQtiPackage, escapeXml, manifestXml } from '../src/core/qti';
import { buildZip, crc32, listZip } from '../src/core/zip';
import { annotateTrace, diffTraces } from '../src/core/diff';
import { decodeShare, encodeShare } from '../src/core/share';

const cfg = (patch: Partial<HeapConfig> = {}): HeapConfig => ({ ...DEFAULT_CONFIG, heapSize: 256, ...patch });
const textbook = parseTrace(PRESETS[0].text).ops;

describe('quiz', () => {
  it('generates every question type with simulator-checked answers', () => {
    const types = QUESTION_TYPES.map((t) => t.key);
    const seen = new Set<QuestionType>();
    for (const type of types) {
      const qs = generateQuiz(textbook, cfg(), { count: 3, seed: 5, types: [type] });
      expect(qs.length, type).toBeGreaterThan(0);
      for (const q of qs) {
        seen.add(q.type);
        expect(checkAnswer(q, q.answer)).toBe(true);
        expect(checkAnswer(q, ' ' + q.answer.toUpperCase() + ' ')).toBe(true);
        expect(checkAnswer(q, '')).toBe(false);
        expect(q.context).toMatch(/<- this op/);
        expect(q.explanation.length).toBeGreaterThan(20);
      }
    }
    expect(seen.size).toBe(types.length);
  });

  it('answers agree with a direct replay', () => {
    const run = runTrace(textbook, cfg());
    const qs = generateQuiz(textbook, cfg(), { count: 20, seed: 11, types: ['address', 'coalesce', 'freeblocks', 'largest', 'blocksize', 'success', 'examined', 'padding'] });
    expect(qs.length).toBeGreaterThan(8);
    for (const q of qs) {
      const s = run.steps[q.step];
      const e = s.event;
      if (q.type === 'address') expect(q.answer).toBe(e.kind !== 'free' && e.result !== null ? '0x' + e.result.toString(16) : 'NULL');
      if (q.type === 'coalesce') expect(e.kind === 'free' && String(e.merged)).toBe(q.answer);
      if (q.type === 'freeblocks') expect(String(s.metrics.freeBlocks)).toBe(q.answer);
      if (q.type === 'largest') expect(String(s.metrics.largestFree)).toBe(q.answer);
      if (q.type === 'blocksize') expect(e.kind === 'malloc' && String(e.asize)).toBe(q.answer);
      if (q.type === 'examined') expect(e.kind !== 'free' && String(e.examined.length)).toBe(q.answer);
      if (q.type === 'success') expect(q.answer).toBe(e.kind === 'malloc' && e.result !== null ? 'succeeds' : 'NULL');
    }
    const nulls = qs.filter((q) => q.type === 'address' && q.answer === 'NULL');
    for (const q of nulls) expect(checkAnswer(q, '0x0')).toBe(true);
  });

  it('is deterministic, deduplicates, and falls back to all types', () => {
    const a = generateQuiz(textbook, cfg(), { count: 6, seed: 3, types: [] });
    const b = generateQuiz(textbook, cfg(), { count: 6, seed: 3, types: [] });
    expect(a.map((q) => q.prompt)).toEqual(b.map((q) => q.prompt));
    const keys = new Set(a.map((q) => `${q.type}:${q.step}`));
    expect(keys.size).toBe(a.length);
    expect(generateQuiz([], cfg(), { count: 3, seed: 1, types: [] })).toEqual([]);
    expect(generateQuiz(parseTrace('a 0 8').ops, cfg({ coalesce: 'none' }), { count: 3, seed: 1, types: ['coalesce'] })).toEqual([]);
  });

  it('exports Markdown with and without the key', () => {
    const qs = generateQuiz(textbook, cfg(), { count: 3, seed: 9, types: [] });
    const md = quizToMarkdown(qs, cfg(), false);
    expect(md).toMatch(/# Heap Arena Replay quiz/);
    expect(md).not.toMatch(/\*\*Answer:\*\*/);
    const key = quizToMarkdown(qs, cfg(), true);
    expect(key).toMatch(/\*\*Answer:\*\*/);
    expect(key.split('## Question')).toHaveLength(4);
  });
});

describe('zip and QTI', () => {
  it('computes the standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('builds a stored zip whose directory lists every entry', () => {
    const zip = buildZip([
      { name: 'a.txt', data: 'hello' },
      { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const list = listZip(zip);
    expect(list).toEqual([
      { name: 'a.txt', size: 5, crc: crc32(new TextEncoder().encode('hello')) },
      { name: 'dir/b.bin', size: 3, crc: crc32(new Uint8Array([1, 2, 3])) },
    ]);
    expect(() => listZip(new Uint8Array(30))).toThrow();
  });

  it('escapes XML and writes a Canvas-shaped package', () => {
    expect(escapeXml('a < b & "c" > d')).toBe('a &lt; b &amp; &quot;c&quot; &gt; d');
    const qs = generateQuiz(textbook, cfg(), { count: 4, seed: 2, types: ['address', 'coalesce'] });
    const xml = assessmentXml(qs, cfg(), 'id1', 'T & T');
    expect(xml).toMatch(/short_answer_question/);
    expect(xml).toMatch(/title="T &amp; T"/);
    expect(xml.match(/<item /g)).toHaveLength(qs.length);
    for (const q of qs) for (const a of q.accepted) expect(xml).toContain(`<varequal respident="response1">${escapeXml(a)}</varequal>`);
    expect(manifestXml('id1', 'T')).toMatch(/imsqti_xmlv1p2/);
    const pkg = buildQtiPackage(qs, cfg(), 'Quiz');
    const names = listZip(pkg).map((e) => e.name);
    expect(names[0]).toBe('imsmanifest.xml');
    expect(names[1]).toMatch(/^heap_arena_[0-9a-f]+\/heap_arena_[0-9a-f]+\.xml$/);
    expect(listZip(buildQtiPackage(qs, cfg(), 'Other')).map((e) => e.name)[1]).not.toBe(names[1]);
  });
});

describe('diff', () => {
  it('matches the reference output exactly and annotates it', () => {
    const run = runTrace(textbook, cfg());
    const text = annotateTrace(textbook, run);
    expect(text.split('\n')[0]).toBe('a 0 24 -> 0x10');
    expect(text).toMatch(/-> NULL/);
    const parsed = parseTrace(text);
    expect(parsed.errors).toEqual([]);
    const d = diffTraces(parsed, cfg());
    expect(d.firstDivergence).toBeNull();
    expect(d.firstError).toBeNull();
    expect(d.matched).toBe(d.compared);
    expect(d.compared).toBe(textbook.filter((o) => o.kind !== 'free').length);
  });

  it('finds the first divergence under a different policy without calling it a bug', () => {
    const best = runTrace(textbook, cfg({ fit: 'best' }));
    const d = diffTraces(parseTrace(annotateTrace(textbook, best)), cfg({ fit: 'first' }));
    expect(d.firstError).toBeNull();
    // The textbook trace happens to place identically under first and best fit until the last malloc.
    expect(d.firstDivergence === null || d.matched < d.compared).toBe(true);
    const pre = parseTrace(PRESETS.find((p) => p.key === 'first-vs-best')!.text).ops;
    const b2 = runTrace(pre, cfg({ fit: 'best' }));
    const d2 = diffTraces(parseTrace(annotateTrace(pre, b2)), cfg({ fit: 'first' }));
    expect(d2.firstDivergence).toBe(6);
    expect(d2.steps[6].diverges).toBe(true);
    expect(d2.steps[6].errors).toEqual([]);
    expect(d2.firstError).toBeNull();
  });

  it('flags misalignment, overlap, bounds and wrong NULLs', () => {
    const d = diffTraces(parseTrace('a 0 24 -> 0x14\na 1 8 -> 0x18\na 2 8 -> 0x3f0\na 3 8 -> NULL\nf 0\na 4 8'), cfg());
    expect(d.steps[0].errors[0]).toMatch(/not 8-byte aligned/);
    expect(d.steps[1].errors.some((e) => /overlaps live block p0/.test(e))).toBe(true);
    expect(d.steps[2].errors[0]).toMatch(/does not fit inside/);
    expect(d.steps[3].errors[0]).toMatch(/returned NULL but/);
    expect(d.firstError).toBe(0);
    expect(d.steps[4].live.map((b) => b.id)).toEqual([1, 2]);
    expect(d.steps[5].student).toBeUndefined();
    expect(d.steps[5].live.some((b) => b.id === 4)).toBe(true);
  });
});

describe('share links', () => {
  it('round-trips config, trace, switches and step', () => {
    const shared = { cfg: cfg({ list: 'segregated', fit: 'best', word: 8 as const, heapSize: 512 }), trace: 'a 0 8\n# ünïcode\nf 0', switches: [{ at: 1, patch: { fit: 'first' as const } }], step: 1 };
    const hash = encodeShare(shared);
    expect(hash).toMatch(/^h=[A-Za-z0-9_-]+$/);
    expect(decodeShare('#' + hash)).toEqual(shared);
    expect(decodeShare('#x=1&' + hash)!.trace).toBe(shared.trace);
  });

  it('rejects garbage and bad configs', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#h=!!!')).toBeNull();
    expect(decodeShare('#h=' + btoa('{"c":1}'))).toBeNull();
    expect(decodeShare('#h=' + btoa('{"c":[4,100,"x","y","z","w"],"t":"a 0 8"}'))).toBeNull();
    const d = decodeShare('#h=' + btoa('{"c":[4,256,"x","y","z","w"],"t":"a 0 8","s":[[0,{"fit":"best"}],"junk"]}'))!;
    expect(d.cfg).toEqual(cfg());
    expect(d.switches).toEqual([{ at: 0, patch: { fit: 'best' } }]);
    expect(d.step).toBeUndefined();
  });
});
