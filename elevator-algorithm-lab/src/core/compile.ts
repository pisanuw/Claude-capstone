import { PRELUDE } from './policies';
import type { DispatchFn } from './types';

export class PolicyError extends Error {}

/**
 * Turn student source into a dispatch function. The source must define
 * `function dispatch(car, state)`; anything else at top level (helper
 * functions, `let` state that persists across calls) is allowed. In the
 * browser this runs inside a Web Worker so an infinite loop can be killed.
 */
export function compilePolicy(source: string): DispatchFn {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new PolicyError('the policy is empty');
  }
  let factory: () => unknown;
  try {
    factory = new Function(
      `"use strict";\n${PRELUDE}\n${source}\n;return typeof dispatch === 'function' ? dispatch : undefined;`,
    ) as () => unknown;
  } catch (e) {
    throw new PolicyError(`syntax error: ${(e as Error).message}`);
  }
  let fn: unknown;
  try {
    fn = factory();
  } catch (e) {
    throw new PolicyError(`error while loading the policy: ${(e as Error).message}`);
  }
  if (typeof fn !== 'function') {
    throw new PolicyError('the policy must define function dispatch(car, state)');
  }
  return fn as DispatchFn;
}

/** FNV-1a over whitespace-normalised source: a short, stable id for a policy. */
export function policyHash(source: string): string {
  const text = source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
