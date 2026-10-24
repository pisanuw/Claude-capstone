import { describe, expect, it } from 'vitest';
import { buildTrace, elementLabel, RunError } from '../src/core/trace';

const refs = (src: string) => {
  const t = buildTrace(src);
  return [...Array(t.length).keys()].map((i) => {
    const a = t.arrays[t.array[i] as number];
    return `${t.write[i] ? 'W' : 'R'} ${elementLabel(a!, t.elem[i] as number)}`;
  });
};

describe('layout', () => {
  it('places arrays row-major at 64-byte boundaries from 0x10000', () => {
    const t = buildTrace('char c[3]; double A[2][3]; int B[4] @ 0x200; A[1][2] = c[2] + B[3];');
    const [c, A, B] = t.arrays;
    expect(c?.base).toBe(0x10000);
    expect(A?.base).toBe(0x10040);
    expect(A?.bytes).toBe(48);
    expect(B?.base).toBe(0x200);
    expect([...t.addr]).toEqual([0x10002, 0x200 + 12, 0x10040 + 5 * 8]);
    expect([...t.write]).toEqual([0, 0, 1]);
  });

  it('honours baseAddress and align options', () => {
    const t = buildTrace('char a[3]; char b[3];', { baseAddress: 0, align: 4 });
    expect(t.arrays.map((a) => a.base)).toEqual([0, 4]);
  });

  it('labels elements', () => {
    const t = buildTrace('int A[3][4][5];');
    expect(elementLabel(t.arrays[0]!, 2 * 20 + 3 * 5 + 4)).toBe('A[2][3][4]');
  });
});

describe('evaluation order', () => {
  it('reads the right-hand side left to right, then writes', () => {
    expect(refs('int A[4], B[4]; A[0] = B[1] + A[2] * B[3];')).toEqual(['R B[1]', 'R A[2]', 'R B[3]', 'W A[0]']);
  });

  it('reads the target first for compound assignment and increments', () => {
    expect(refs('int A[4], B[4]; A[0] += B[1]; A[2]++; --A[3];')).toEqual(['R A[0]', 'R B[1]', 'W A[0]', 'R A[2]', 'W A[2]', 'R A[3]', 'W A[3]']);
  });

  it('keeps scalars in registers', () => {
    expect(refs('int A[2]; int s = 0; for (int i = 0; i < 2; i++) { s += A[i]; s = s * 2; }')).toEqual(['R A[0]', 'R A[1]']);
  });

  it('short-circuits && and || and evaluates one ternary branch', () => {
    expect(refs('int A[4]; int i = 0; int x = (i == 1 && A[0]) || 0; x = i ? A[1] : A[2];')).toEqual(['R A[2]']);
  });
});

describe('loops and constants', () => {
  it('runs nested loops with min() bounds and steps', () => {
    const t = buildTrace(`#define N 5
#define BS 2
int A[N];
for (int jj = 0; jj < N; jj += BS)
  for (int j = jj; j < min(jj + BS, N); j++)
    A[j] = 0;`);
    expect([...t.elem]).toEqual([0, 1, 2, 3, 4]);
    expect(t.constants).toEqual([
      { name: 'N', value: 5 },
      { name: 'BS', value: 2 },
    ]);
  });

  it('applies overrides to #define and top-level constants', () => {
    const t = buildTrace('#define N 4\nint M = 2;\nint A[N][M];\nA[N-1][M-1] = 1;', { overrides: { N: 3, M: 5 } });
    expect(t.arrays[0]?.dims).toEqual([3, 5]);
    expect(t.constants).toEqual([
      { name: 'N', value: 3 },
      { name: 'M', value: 5 },
    ]);
  });

  it('treats a function body as top level and supports while, if, casts, shifts and %', () => {
    const t = buildTrace(`void k(void) {
  const int N = 8;
  int A[N];
  int i = 0;
  while (i < N) {
    if (i % 2 == 0) A[i] = 1; else A[(int)(i >> 1)] = 2;
    i++;
  }
}`);
    expect(t.constants).toEqual([{ name: 'N', value: 8 }]);
    expect([...t.elem]).toEqual([0, 0, 2, 1, 4, 2, 6, 3]);
  });

  it('evaluates C integer arithmetic', () => {
    const t = buildTrace('int A[100]; A[-7 / 2 + 10] = 0; A[7 % 3] = 0; A[(1 << 4) | 1] = 0; A[6 & 3 ^ 1] = 0; A[!0 + ~0 + 5] = 0; A[max(3, 9) - abs(-2)] = 0; A[+3 >= 3] = 0;');
    expect([...t.elem]).toEqual([7, 1, 17, 3, 5, 7, 1]);
  });
});

describe('errors', () => {
  const err = (src: string, opts = {}) => {
    try {
      buildTrace(src, opts);
    } catch (e) {
      return e as RunError;
    }
    throw new Error('expected an error');
  };

  it('reports out-of-bounds indices with the line', () => {
    const e = err('int A[4][4];\nfor (int i = 0; i <= 4; i++) A[i][0] = 0;');
    expect(e.message).toBe('line 2: A[4][…] is out of bounds (dimension 1 has size 4)');
    expect(e.line).toBe(2);
  });

  it('rejects indices and conditions that depend on array contents', () => {
    expect(err('int A[4], B[4]; A[B[0]] = 1;').message).toMatch(/depends on array contents/);
    expect(err('int A[4]; if (A[0]) A[1] = 0;').message).toMatch(/depends on array contents/);
    expect(err('int A[4]; int x = A[0] && 1;').message).toMatch(/depends on array contents/);
  });

  it('rejects unknown names and misuse', () => {
    expect(err('A[0] = 1;').message).toMatch(/unknown array 'A'/);
    expect(err('int x; x[0] = 1;').message).toMatch(/is a scalar/);
    expect(err('y = 1;').message).toMatch(/unknown variable 'y'/);
    expect(err('int z = w;').message).toMatch(/unknown variable 'w'/);
    expect(err('int A[2]; int x = A;').message).toMatch(/without an index/);
    expect(err('int A[2][2]; A[0] = 1;').message).toMatch(/2 dimensions but is indexed with 1/);
    expect(err('int A[2]; int A[3];').message).toMatch(/declared twice/);
    expect(err('#define N 1\n#define N 2').message).toMatch(/already defined/);
    expect(err('int A[0];').message).toMatch(/positive sizes/);
    expect(err('int A[2] @ -4;').message).toMatch(/non-negative/);
    expect(err('int A[16] @ 0; int B[4] @ 32;').message).toMatch(/overlaps/);
    expect(err('int A[100000][100000];').message).toMatch(/too large/);
    expect(err('int x = 1 / 0;').message).toMatch(/division by zero/);
    expect(err('int x = 1 % 0;').message).toMatch(/division by zero/);
    expect(err('int A[2]; A[1e308 * 10] = 1;').message).toMatch(/not a finite number/);
  });

  it('stops runaway programs', () => {
    expect(err('int i = 0; while (1) i++;', { maxSteps: 1000 }).message).toMatch(/stopped after 1,000 steps/);
    expect(err('int A[10]; for (;;) A[0] = 1;', { maxAccesses: 50 }).message).toMatch(/more than 50 memory accesses/);
  });

  it('wraps parse errors', () => {
    expect(err('int A[2]').name).toBe('Error');
  });
});
