import type { StepSeed } from './analyze';

const code = (s: string) => '`' + s + '`';

/**
 * Turn a step seed into one plain-English sentence. Deterministic by design:
 * the narration is generated from what the checker actually computed, so it
 * can never disagree with the highlighted code.
 */
export function narrate(seed: StepSeed): string {
  const t = code(seed.type);
  switch (seed.kind) {
    case 'literal':
      return `The literal ${code(seed.subject)} gets type ${t}.`;
    case 'identifier':
      return `${code(seed.subject)} has type ${t} here.`;
    case 'narrow':
      return `Control flow narrows ${code(seed.subject)} from ${code(seed.extra ?? 'unknown')} to ${t} at this location.`;
    case 'member':
      return `Member access ${code(seed.subject)} resolves to type ${t}.`;
    case 'call':
      if (seed.extra) {
        return `Calling ${code(seed.subject)} infers ${seed.extra}; the call returns ${t}.`;
      }
      return `Calling ${code(seed.subject)} returns ${t}.`;
    case 'function':
      return `This ${seed.subject} gets signature ${t}.`;
    case 'param':
      return `Parameter ${code(seed.subject)} has no annotation, so its type comes from context: ${t}.`;
    case 'expression':
      if (seed.extra) {
        return `The ${code(seed.extra)} expression evaluates to type ${t}.`;
      }
      return `This expression evaluates to type ${t}.`;
    case 'var-infer':
      return `${seed.keyword} ${code(seed.subject)} has no annotation; its type is inferred as ${t}.`;
    case 'widen':
      return `${seed.keyword} ${code(seed.subject)} starts from the fresh literal type ${code(seed.extra ?? '')} and widens to ${t}, because a ${seed.keyword} binding can be reassigned.`;
    case 'var-declared':
      return `${seed.keyword} ${code(seed.subject)} is annotated, so its type is ${t} by declaration, not inference.`;
    case 'return-infer':
      return `${code(seed.subject)} has no return annotation; the compiler infers the return type ${t} from its return statements.`;
    case 'error':
      return seed.subject;
    default:
      return `Type ${t}.`;
  }
}
