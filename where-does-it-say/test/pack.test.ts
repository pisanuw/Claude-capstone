import { describe, expect, it } from 'vitest';
import { MAX_DOCS, decodePack, encodePack, packId, parsePack, validatePack, type CoursePack } from '../src/core/pack.js';
import { SAMPLE_PACK } from '../src/core/sample.js';

describe('course packs', () => {
  it('round-trips through the URL fragment', async () => {
    const frag = await encodePack(SAMPLE_PACK);
    expect(frag).toMatch(/^pack=[A-Za-z0-9_-]+$/);
    // Compression keeps the sample link comfortably short.
    expect(frag.length).toBeLessThan(JSON.stringify(SAMPLE_PACK).length * 0.6);
    const back = await decodePack('#' + frag);
    expect(back).toEqual({ pack: SAMPLE_PACK });
    expect(await decodePack('#x=1&' + frag)).toEqual({ pack: SAMPLE_PACK });
  });

  it('keeps non-ASCII text intact', async () => {
    const p: CoursePack = { v: 1, title: 'Cours été — 数学', docs: [{ title: 'É', format: 'text', source: 'Café 😀' }] };
    expect(await decodePack('#' + (await encodePack(p)))).toEqual({ pack: p });
  });

  it('reports damaged or missing links', async () => {
    expect(await decodePack('#nothing')).toBeNull();
    expect(await decodePack('#pack=AAAA')).toMatchObject({ error: expect.stringContaining('damaged') });
    const notJson = await encodePack({ v: 1, title: 'x', docs: [] } as unknown as CoursePack);
    // Valid compression, valid JSON, invalid pack (no documents).
    expect(await decodePack('#' + notJson)).toMatchObject({ error: expect.stringContaining('docs') });
  });

  it('reports a link whose content is not JSON', async () => {
    const bytes = new TextEncoder().encode('not json');
    const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const b64 = btoa(String.fromCharCode(...out)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodePack('#pack=' + b64)).toEqual({ error: 'The course link does not contain a valid pack.' });
  });

  it('validates untrusted packs', () => {
    expect(validatePack(null)).toMatchObject({ error: expect.any(String) });
    expect(validatePack({ v: 2 })).toMatchObject({ error: expect.stringContaining('version') });
    expect(validatePack({ v: 1 })).toMatchObject({ error: expect.stringContaining('title') });
    expect(validatePack({ v: 1, title: 't', docs: [] })).toMatchObject({ error: expect.stringContaining('docs') });
    expect(validatePack({ v: 1, title: 't', docs: new Array(MAX_DOCS + 1).fill({ title: 'a', format: 'text', source: 'b' }) })).toMatchObject({
      error: expect.stringContaining('at most'),
    });
    expect(validatePack({ v: 1, title: 't', docs: [5] })).toMatchObject({ error: expect.stringContaining('not an object') });
    expect(validatePack({ v: 1, title: 't', docs: [{ title: 'a' }] })).toMatchObject({ error: expect.stringContaining('"source"') });
    expect(validatePack({ v: 1, title: 't', docs: [{ title: 'a', source: 'b', format: 'docx' }] })).toMatchObject({ error: expect.stringContaining('format') });
    expect(validatePack({ v: 1, title: 't', docs: [{ title: 'a', source: 'x'.repeat(400_001), format: 'text' }] })).toMatchObject({
      error: expect.stringContaining('longer'),
    });
    expect(validatePack({ v: 1, title: 't'.repeat(300), docs: [{ title: 'a', source: 'b', format: 'text', extra: 1 }] })).toEqual({
      pack: { v: 1, title: 't'.repeat(200), docs: [{ title: 'a', format: 'text', source: 'b' }] },
    });
  });

  it('ids change with content and parse every document', () => {
    const changed = { ...SAMPLE_PACK, title: 'Other' };
    expect(packId(SAMPLE_PACK)).toBe(packId(structuredClone(SAMPLE_PACK)));
    expect(packId(changed)).not.toBe(packId(SAMPLE_PACK));
    expect(parsePack(SAMPLE_PACK).map((d) => d.title)).toEqual(SAMPLE_PACK.docs.map((d) => d.title));
  });
});
