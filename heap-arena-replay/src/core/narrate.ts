// Plain-English account of what one trace step did, derived from the event.

import { hex, type HeapConfig } from './heap';
import { describeOp, policyLabel, type Step } from './trace';

function fitName(cfg: HeapConfig): string {
  if (cfg.list !== 'implicit' && cfg.fit === 'next') return 'first-fit';
  return `${cfg.fit}-fit`;
}

function searchSentence(examined: { bp: number; size: number }[], cfg: HeapConfig, asize: number): string {
  if (examined.length === 0) return `${fitName(cfg)} found no free block to examine`;
  const list = examined.map((e) => `${hex(e.bp)} (${e.size}${e.size >= asize ? '' : ', too small'})`).join(', ');
  const where = cfg.list === 'segregated' ? 'in the size-class lists' : cfg.list === 'explicit' ? 'on the free list' : 'along the heap';
  return `${fitName(cfg)} examined ${examined.length} free block${examined.length === 1 ? '' : 's'} ${where}: ${list}`;
}

export function narrate(step: Step): string {
  const e = step.event;
  const cfg = step.cfg;
  const w = cfg.word;
  const parts: string[] = [];
  if (step.switched) parts.push(`Policy switched to ${policyLabel(cfg)} and the free lists were rebuilt.`);
  if (e.kind === 'malloc') {
    if (e.error && e.asize === 0) {
      parts.push(`${describeOp(step.op)} is invalid: ${e.error}.`);
      return parts.join(' ');
    }
    parts.push(
      `${describeOp(step.op)} needs ${e.req} payload bytes plus a ${w}-byte header and footer, rounded up to ${cfg.word * 2}-byte alignment` +
        (e.asize > e.req + 2 * w ? ` with ${e.asize - e.req - 2 * w} bytes of padding` : '') +
        `: a ${e.asize}-byte block.`,
    );
    if (e.deferredMerges !== undefined) {
      parts.push(
        e.deferredMerges > 0
          ? `The first search failed, so deferred coalescing merged ${e.deferredMerges} pair${e.deferredMerges === 1 ? '' : 's'} of adjacent free blocks and searched again.`
          : 'The search failed and a coalescing sweep found nothing adjacent to merge.',
      );
    }
    parts.push(searchSentence(e.examined, cfg, e.asize) + '.');
    if (e.result === null) {
      parts.push(`No block of ${e.asize} bytes exists, so malloc returns NULL.`);
      return parts.join(' ');
    }
    const found = e.found!;
    if (e.split) {
      parts.push(
        `It chose the ${found.size}-byte block at ${hex(found.bp)} and split it: ${e.asize} bytes allocated, the remaining ${e.split.size} bytes become a free block at ${hex(e.split.bp)}.`,
      );
    } else if (found.size > e.asize) {
      parts.push(
        `It chose the ${found.size}-byte block at ${hex(found.bp)}; the ${found.size - e.asize} spare bytes are too few for a block (minimum ${w * 4}), so they stay inside as padding.`,
      );
    } else {
      parts.push(`It chose the ${found.size}-byte block at ${hex(found.bp)}, an exact fit.`);
    }
    parts.push(`Returns ${hex(e.result)}.`);
    return parts.join(' ');
  }
  if (e.kind === 'free') {
    if (e.error) {
      parts.push(`${describeOp(step.op)} is invalid: ${e.error}.`);
      return parts.join(' ');
    }
    parts.push(`${describeOp(step.op)} marks the ${e.size}-byte block at ${hex(e.bp)} free in its header and footer.`);
    if (cfg.coalesce === 'none') {
      parts.push('Coalescing is off, so neighbouring free blocks stay separate.');
    } else if (cfg.coalesce === 'deferred') {
      parts.push('Coalescing is deferred until a malloc fails, so the block is kept as it is.');
    } else if (e.merged === 1) {
      parts.push('Both neighbours are allocated: nothing to coalesce (case 1).');
    } else if (e.prevFree && e.nextFree) {
      parts.push(`Both neighbours are free: three blocks merge into one ${e.resultSize}-byte block at ${hex(e.resultBp)} (case 4).`);
    } else if (e.nextFree) {
      parts.push(`The next block is free: they merge into one ${e.resultSize}-byte block at ${hex(e.resultBp)} (case 2).`);
    } else {
      parts.push(`The previous block is free: they merge into one ${e.resultSize}-byte block at ${hex(e.resultBp)} (case 3).`);
    }
    if (cfg.list !== 'implicit') {
      parts.push(
        cfg.insert === 'lifo'
          ? `The free block is pushed on the front of ${cfg.list === 'segregated' ? 'its size-class list' : 'the free list'}.`
          : `The free block is linked into ${cfg.list === 'segregated' ? 'its size-class list' : 'the free list'} in address order.`,
      );
    }
    return parts.join(' ');
  }
  if (e.error && e.asize === 0) {
    parts.push(`${describeOp(step.op)} is invalid: ${e.error}.`);
    return parts.join(' ');
  }
  parts.push(`${describeOp(step.op)} needs a ${e.asize}-byte block; the block at ${hex(e.oldBp)} is ${e.oldSize} bytes.`);
  switch (e.strategy) {
    case 'keep':
      parts.push('The current block is big enough and the spare bytes cannot form a block, so nothing moves.');
      break;
    case 'shrink':
      parts.push(`The block shrinks in place and its tail of ${e.oldSize - e.asize} bytes is freed.`);
      break;
    case 'absorb':
      parts.push('The next block is free and big enough, so it is absorbed in place: no copy needed.');
      break;
    case 'move':
      parts.push(`${searchSentence(e.examined, cfg, e.asize)}. The payload is copied to ${hex(e.result!)} and the old block is freed.`);
      break;
    case 'fail':
      parts.push(`${searchSentence(e.examined, cfg, e.asize)}. ${e.error}.`);
      return parts.join(' ');
  }
  parts.push(`Returns ${hex(e.result!)}.`);
  return parts.join(' ');
}
