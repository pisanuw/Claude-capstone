/** One step in the inference story, anchored to a source span. */
export interface Step {
  /** Position in the story, 0-based, assigned after merging in diagnostics. */
  index: number;
  kind: StepKind;
  /** Character offsets into the analyzed source. */
  start: number;
  end: number;
  /** Trimmed source excerpt for the span (truncated for display). */
  snippet: string;
  /** The primary type the compiler produced at this step ('' for errors). */
  type: string;
  /** One-sentence plain-English account of what the compiler did. */
  narration: string;
  /** Extra lines: declared vs resolved signatures, type-argument bindings, etc. */
  details: string[];
}

export type StepKind =
  | 'literal' // a literal expression and the (possibly fresh literal) type it gets
  | 'identifier' // a reference to a value; its type at this exact location
  | 'narrow' // a reference whose flow type differs from its declared type
  | 'member' // property/element access
  | 'call' // call or new expression with its resolved signature
  | 'function' // a function/arrow expression and its inferred signature
  | 'param' // an unannotated parameter typed from context
  | 'expression' // any other computed expression (binary, conditional, assertion...)
  | 'var-infer' // unannotated variable, type taken from its initializer
  | 'widen' // unannotated let/var whose fresh literal type widened
  | 'var-declared' // annotated variable; the annotation wins
  | 'return-infer' // function without a return annotation; return type inferred
  | 'error'; // a compiler diagnostic, placed where inference went astray

/** A compiler diagnostic mapped to a source span. */
export interface Diag {
  start: number;
  end: number;
  message: string;
  code: number;
}

/** Dense span -> type map used for hover; smallest containing span wins. */
export interface HoverEntry {
  start: number;
  end: number;
  type: string;
}

export interface AnalyzeResult {
  steps: Step[];
  diagnostics: Diag[];
  hover: HoverEntry[];
}

/** Message shapes exchanged with the worker. */
export interface AnalyzeRequest {
  id: number;
  code: string;
}
export interface AnalyzeResponse {
  id: number;
  result: AnalyzeResult;
}
