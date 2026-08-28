export interface Example {
  id: string;
  title: string;
  /** What the example is built to demonstrate; shown under the picker. */
  blurb: string;
  code: string;
}

export const examples: Example[] = [
  {
    id: 'literal-widening',
    title: 'Literal types and widening',
    blurb: 'const keeps the fresh literal type; let widens it so the binding stays reassignable.',
    code: `const answer = 42;
let counter = 42;
const greeting = "hello";
let mutable = "hello";
`,
  },
  {
    id: 'generic-inference',
    title: 'Generic function inference',
    blurb: 'No type arguments written anywhere: the compiler binds T from the argument it sees.',
    code: `function wrap<T>(value: T): T[] {
  return [value];
}

const words = wrap("witness");
const nums = wrap(7);
const both = wrap(nums);
`,
  },
  {
    id: 'contextual-callback',
    title: 'Contextual typing in callbacks',
    blurb: "map's callback parameter has no annotation; its type flows in from the array.",
    code: `const lengths = ["one", "two", "three"].map(word => word.length);
const doubled = [1, 2, 3].map(n => n * 2);
`,
  },
  {
    id: 'typeof-narrowing',
    title: 'Union narrowing with typeof',
    blurb: 'One variable, three types: the declared union narrows differently in each branch.',
    code: `function describe(value: string | number) {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  return value.toFixed(2);
}
`,
  },
  {
    id: 'discriminated-union',
    title: 'Discriminated union',
    blurb: 'Checking the shared "kind" property narrows the whole object type per branch.',
    code: `type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number };

function area(shape: Shape) {
  if (shape.kind === "circle") {
    return 3.14159 * shape.radius * shape.radius;
  }
  return shape.width * shape.height;
}
`,
  },
  {
    id: 'inference-gone-astray',
    title: 'An error, step by step',
    blurb: 'Rewind to the exact step where the compiler and the code disagree.',
    code: `const ids = [1, 2, 3];
const first = ids[0];
const label: string = first;
const shout = label.toUpperCase();
`,
  },
  {
    id: 'return-inference',
    title: 'Return type inference',
    blurb: 'No return annotations: each function type is assembled from its return statements.',
    code: `function pick(flag: boolean) {
  if (flag) {
    return "yes";
  }
  return 0;
}

const result = pick(true);
`,
  },
  {
    id: 'truthiness-narrowing',
    title: 'Truthiness and equality narrowing',
    blurb: 'Plain if-checks against null strip members from a union without any typeof.',
    code: `function shorten(text: string | null) {
  if (text === null) {
    return "";
  }
  return text.slice(0, 10);
}
`,
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}
