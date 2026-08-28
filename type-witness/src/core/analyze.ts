import ts from 'typescript';
import { libFiles, defaultLibFileName } from './libs';
import type { AnalyzeResult, Diag, HoverEntry, Step, StepKind } from './types';
import { narrate } from './narrate';

const MAIN = '/main.ts';

// Minimal ambient console so example code can log without pulling in lib.dom.
const EXTRA = '/lib.extra.d.ts';
const EXTRA_TEXT = `declare var console: {
  log(...data: unknown[]): void;
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  info(...data: unknown[]): void;
};
`;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  lib: ['lib.es2022.d.ts'],
  noEmit: true,
  skipLibCheck: true,
};

const FORMAT = ts.TypeFormatFlags.NoTruncation;

/** Fields carried by every step before narration and indexing. */
export interface StepSeed {
  kind: StepKind;
  start: number;
  end: number;
  type: string;
  details: string[];
  /** Narration ingredients; see narrate.ts. */
  subject: string;
  extra?: string;
  keyword?: string;
}

function createHost(code: string): ts.CompilerHost {
  const files = new Map<string, string>([
    [MAIN, code],
    [EXTRA, EXTRA_TEXT],
    ...Object.entries(libFiles),
  ]);
  return {
    fileExists: (f) => files.has(f),
    readFile: (f) => files.get(f),
    getSourceFile: (f, languageVersion) => {
      const text = files.get(f);
      return text === undefined
        ? undefined
        : ts.createSourceFile(f, text, languageVersion, true);
    },
    getDefaultLibFileName: () => defaultLibFileName,
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
}

function snippet(code: string, start: number, end: number): string {
  const text = code.slice(start, end).replace(/\s+/g, ' ').trim();
  return text.length > 64 ? text.slice(0, 61) + '...' : text;
}

/** Internal TypeScript shapes, read defensively; see notes in extractTypeArgs. */
export interface InternalMapper {
  kind?: number;
  source?: ts.Type;
  target?: ts.Type;
  sources?: ts.Type[];
  targets?: ts.Type[];
  mapper1?: InternalMapper;
  mapper2?: InternalMapper;
}
interface InternalSignature {
  target?: ts.Signature;
  mapper?: InternalMapper;
}

export function mapperPairs(m: InternalMapper | undefined): Array<[ts.Type, ts.Type | undefined]> {
  if (!m || typeof m.kind !== 'number') return [];
  // ts.TypeMapKind (internal): Simple=0, Array=1, Deferred=2, Function=3, Composite=4, Merged=5.
  switch (m.kind) {
    case 0:
      return m.source ? [[m.source, m.target]] : [];
    case 1:
      return (m.sources ?? []).map((s, i) => [s, m.targets?.[i]] as [ts.Type, ts.Type | undefined]);
    case 4:
    case 5:
      return [...mapperPairs(m.mapper1), ...mapperPairs(m.mapper2)];
    default:
      return [];
  }
}

/**
 * For a resolved generic call, recover "T = string" style bindings. The
 * instantiated signature's link back to its generic original (`target`) and
 * the substitution it was built with (`mapper`) are internal compiler state,
 * so everything here is optional: on any surprise we return no bindings and
 * the step simply omits them (the declared vs resolved signatures still show
 * the inference outcome).
 */
function extractTypeArgs(
  checker: ts.TypeChecker,
  sig: ts.Signature,
): { generic: ts.Signature | undefined; bindings: string[] } {
  const internal = sig as unknown as InternalSignature;
  const generic = internal.target;
  if (!generic || !generic.typeParameters || generic.typeParameters.length === 0) {
    return { generic: undefined, bindings: [] };
  }
  const pairs = mapperPairs(internal.mapper);
  const bindings: string[] = [];
  for (const tp of generic.typeParameters) {
    const hit = pairs.find(([source]) => source === tp);
    const name = checker.typeToString(tp);
    if (hit) {
      bindings.push(`${name} = ${hit[1] ? checker.typeToString(hit[1], undefined, FORMAT) : 'unknown'}`);
    }
  }
  return { generic, bindings };
}

function isValueReference(node: ts.Identifier): boolean {
  const p = node.parent;
  if (!p) return false;
  // Skip names that declare or label things rather than reference values.
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isClassDeclaration(p) ||
      ts.isInterfaceDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isEnumDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isBindingElement(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodSignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isEnumMember(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isTypeParameterDeclaration(p) ||
      ts.isShorthandPropertyAssignment(p)) &&
    p.name === node
  ) {
    // Shorthand `{ x }` both declares the property and references the value.
    return ts.isShorthandPropertyAssignment(p);
  }
  // The `b` in `a.b` is covered by the member-access step for `a.b` itself.
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p)) return false;
  return true;
}

function isInsideTypeNode(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node; cur; cur = cur.parent) {
    if (ts.isTypeNode(cur)) return true;
  }
  return false;
}

/** Analyze a snippet and produce the full inference story. */
export function analyze(code: string): AnalyzeResult {
  const host = createHost(code);
  const program = ts.createProgram([MAIN, EXTRA], COMPILER_OPTIONS, host);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(MAIN);
  if (!source) throw new Error('source file missing');

  const seeds: StepSeed[] = [];
  const hover: HoverEntry[] = [];

  const typeAt = (node: ts.Node): string =>
    checker.typeToString(checker.getTypeAtLocation(node), node, FORMAT);

  const push = (seed: StepSeed) => {
    seeds.push(seed);
  };

  const recordHover = (node: ts.Node) => {
    hover.push({ start: node.getStart(source), end: node.getEnd(), type: typeAt(node) });
  };

  const emitVarDeclaration = (decl: ts.VariableDeclaration) => {
    if (!ts.isIdentifier(decl.name)) return; // destructuring: element steps suffice
    const start = decl.getStart(source);
    const end = decl.getEnd();
    const name = decl.name.text;
    const flags = ts.getCombinedNodeFlags(decl);
    const keyword = flags & ts.NodeFlags.Const ? 'const' : flags & ts.NodeFlags.Let ? 'let' : 'var';
    const varType = typeAt(decl.name);
    recordHover(decl.name);
    if (decl.type) {
      push({
        kind: 'var-declared',
        start,
        end,
        type: varType,
        subject: name,
        keyword,
        details: decl.initializer
          ? [`initializer type: ${typeAt(decl.initializer)}`]
          : [],
      });
      return;
    }
    if (!decl.initializer) {
      push({ kind: 'var-infer', start, end, type: varType, subject: name, keyword, details: [] });
      return;
    }
    const initType = typeAt(decl.initializer);
    if (initType !== varType) {
      push({
        kind: 'widen',
        start,
        end,
        type: varType,
        subject: name,
        keyword,
        extra: initType,
        details: [`initializer: ${initType}`, `${keyword} ${name}: ${varType}`],
      });
    } else {
      push({ kind: 'var-infer', start, end, type: varType, subject: name, keyword, details: [] });
    }
  };

  const emitCall = (node: ts.CallExpression | ts.NewExpression) => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const sig = checker.getResolvedSignature(node);
    const callee = ts.isCallExpression(node) ? node.expression : node.expression;
    const calleeText = snippet(code, callee.getStart(source), callee.getEnd());
    const resultType = typeAt(node);
    if (!sig) {
      push({
        kind: 'call',
        start,
        end,
        type: resultType,
        subject: calleeText,
        details: [],
      });
      return;
    }
    const details: string[] = [];
    const { generic, bindings } = extractTypeArgs(checker, sig);
    if (generic) {
      details.push(`declared: ${checker.signatureToString(generic, undefined, FORMAT)}`);
      for (const b of bindings) details.push(`inferred: ${b}`);
    }
    details.push(`resolved: ${checker.signatureToString(sig, undefined, FORMAT)}`);
    push({
      kind: 'call',
      start,
      end,
      type: resultType,
      subject: calleeText,
      extra: bindings.join(', '),
      details,
    });
  };

  const emitFunctionLike = (node: ts.ArrowFunction | ts.FunctionExpression) => {
    for (const param of node.parameters) {
      if (!param.type && ts.isIdentifier(param.name)) {
        const t = typeAt(param.name);
        recordHover(param.name);
        push({
          kind: 'param',
          start: param.getStart(source),
          end: param.getEnd(),
          type: t,
          subject: param.name.text,
          details: [],
        });
      }
    }
  };

  const emitReturnInference = (
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration,
  ) => {
    if (node.type) return; // annotated: nothing inferred
    const sig = checker.getSignatureFromDeclaration(node);
    if (!sig) return;
    const ret = checker.typeToString(sig.getReturnType(), node, FORMAT);
    const name =
      (node.name && ts.isIdentifier(node.name) && node.name.text) ||
      (ts.isArrowFunction(node) ? 'this arrow function' : 'this function');
    const anchor = node.name ?? node;
    push({
      kind: 'return-infer',
      start: anchor.getStart(source),
      end: anchor.getEnd(),
      type: ret,
      subject: name,
      details: [`signature: ${checker.signatureToString(sig, undefined, FORMAT)}`],
    });
  };

  const visit = (node: ts.Node) => {
    if (isInsideTypeNode(node) && ts.isTypeNode(node)) return;

    // Recurse first: children before parents gives evaluation order within a
    // statement, which is the "watch it unfold" ordering the UI plays back.
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) visit(node.initializer);
      emitVarDeclaration(node);
      return;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      emitFunctionLike(node);
      ts.forEachChild(node, visit);
      emitReturnInference(node);
      recordHover(node);
      push({
        kind: 'function',
        start: node.getStart(source),
        end: node.getEnd(),
        type: typeAt(node),
        subject: ts.isArrowFunction(node) ? 'arrow function' : 'function expression',
        details: [],
      });
      return;
    }
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      ts.forEachChild(node, visit);
      emitReturnInference(node as ts.FunctionDeclaration);
      return;
    }

    ts.forEachChild(node, visit);

    if (ts.isTypeNode(node)) return;

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      recordHover(node);
      emitCall(node);
      return;
    }

    const start = node.getStart(source);
    const end = node.getEnd();

    if (
      ts.isNumericLiteral(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isBigIntLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      ts.isArrayLiteralExpression(node) ||
      ts.isObjectLiteralExpression(node)
    ) {
      recordHover(node);
      push({
        kind: 'literal',
        start,
        end,
        type: typeAt(node),
        subject: snippet(code, start, end),
        details: [],
      });
      return;
    }

    if (ts.isIdentifier(node) && isValueReference(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      const flowType = typeAt(node);
      recordHover(node);
      let declaredType: string | undefined;
      if (
        symbol &&
        symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.FunctionScopedVariable | ts.SymbolFlags.BlockScopedVariable)
      ) {
        declaredType = checker.typeToString(checker.getTypeOfSymbol(symbol), node, FORMAT);
      }
      if (declaredType !== undefined && declaredType !== flowType) {
        push({
          kind: 'narrow',
          start,
          end,
          type: flowType,
          subject: node.text,
          extra: declaredType,
          details: [`declared: ${declaredType}`, `here: ${flowType}`],
        });
      } else {
        push({
          kind: 'identifier',
          start,
          end,
          type: flowType,
          subject: node.text,
          details: [],
        });
      }
      return;
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      recordHover(node);
      push({
        kind: 'member',
        start,
        end,
        type: typeAt(node),
        subject: snippet(code, start, end),
        details: [],
      });
      return;
    }

    if (
      ts.isBinaryExpression(node) ||
      ts.isPrefixUnaryExpression(node) ||
      ts.isPostfixUnaryExpression(node) ||
      ts.isConditionalExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      recordHover(node);
      const opText = ts.isBinaryExpression(node) ? node.operatorToken.getText(source) : '';
      push({
        kind: 'expression',
        start,
        end,
        type: typeAt(node),
        subject: snippet(code, start, end),
        extra: opText,
        details: [],
      });
      return;
    }
  };

  ts.forEachChild(source, visit);

  const rawDiags = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ];
  const diagnostics: Diag[] = rawDiags
    .filter((d) => d.file?.fileName === MAIN && typeof d.start === 'number')
    .map((d) => ({
      start: d.start ?? 0,
      end: (d.start ?? 0) + (d.length ?? 0),
      message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
      code: d.code,
    }));

  // Build the final step list: narrate every seed, then thread each diagnostic
  // in right after the last step its span touches, so the error surfaces at
  // the point where inference went astray.
  const steps: Step[] = seeds.map((seed) => ({
    index: 0,
    kind: seed.kind,
    start: seed.start,
    end: seed.end,
    snippet: snippet(code, seed.start, seed.end),
    type: seed.type,
    narration: narrate(seed),
    details: seed.details,
  }));

  for (const diag of diagnostics) {
    const errStep: Step = {
      index: 0,
      kind: 'error',
      start: diag.start,
      end: Math.max(diag.end, diag.start + 1),
      snippet: snippet(code, diag.start, Math.max(diag.end, diag.start + 1)),
      type: '',
      narration: diag.message,
      details: [`TS${diag.code}`],
    };
    let insertAt = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.kind === 'error') continue;
      if (s.start < diag.end && diag.start < s.end) {
        insertAt = i + 1;
        break;
      }
    }
    if (insertAt === -1) {
      const after = steps.findIndex((s) => s.start > diag.start);
      insertAt = after === -1 ? steps.length : after;
    }
    steps.splice(insertAt, 0, errStep);
  }

  steps.forEach((s, i) => {
    s.index = i;
  });

  // Sort hover spans so the UI can pick the smallest containing span fast.
  hover.sort((a, b) => a.start - b.start || b.end - a.end);

  return { steps, diagnostics, hover };
}
