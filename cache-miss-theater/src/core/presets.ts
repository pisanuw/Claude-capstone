import type { CacheConfig } from './cache';

export interface Preset {
  id: string;
  name: string;
  a: string;
  /** Second kernel for side-by-side comparison. */
  b?: string;
  cache?: Partial<CacheConfig>;
  /** Suggested sweep: a constant name and values. */
  sweep?: { name: string; values: number[] };
  note: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'row-col',
    name: 'Row-major vs column-major sum',
    a: `#define N 32
double A[N][N];
double sum = 0;

for (int i = 0; i < N; i++)
  for (int j = 0; j < N; j++)
    sum += A[i][j];   // walks memory in order
`,
    b: `#define N 32
double A[N][N];
double sum = 0;

for (int j = 0; j < N; j++)
  for (int i = 0; i < N; i++)
    sum += A[i][j];   // jumps N*8 bytes each step
`,
    cache: { size: 1024, lineSize: 32, ways: 2 },
    sweep: { name: 'N', values: [8, 16, 24, 32, 40, 48, 64] },
    note: 'Same 1,024 reads, same 8 KB array, 1 KB cache. Row order uses all four doubles of every line it fetches; column order evicts each line before coming back for its neighbours.',
  },
  {
    id: 'matmul-order',
    name: 'Matrix multiply: ijk vs ikj',
    a: `#define N 16
double A[N][N], B[N][N], C[N][N];

for (int i = 0; i < N; i++)
  for (int j = 0; j < N; j++)
    for (int k = 0; k < N; k++)
      C[i][j] += A[i][k] * B[k][j];
`,
    b: `#define N 16
double A[N][N], B[N][N], C[N][N];

for (int i = 0; i < N; i++)
  for (int k = 0; k < N; k++)
    for (int j = 0; j < N; j++)
      C[i][j] += A[i][k] * B[k][j];
`,
    cache: { size: 1024, lineSize: 32, ways: 2 },
    sweep: { name: 'N', values: [4, 8, 12, 16, 20, 24] },
    note: 'Interchanging the two inner loops turns the column walk down B into a row walk. Look at the per-array misses: B carries almost all of them in ijk.',
  },
  {
    id: 'blocked-matmul',
    name: 'Blocked matrix multiply (block size sweep)',
    a: `#define N 24
double A[N][N], B[N][N], C[N][N];

for (int i = 0; i < N; i++)
  for (int k = 0; k < N; k++)
    for (int j = 0; j < N; j++)
      C[i][j] += A[i][k] * B[k][j];
`,
    b: `#define N 24
#define BS 8
double A[N][N], B[N][N], C[N][N];

for (int kk = 0; kk < N; kk += BS)
  for (int jj = 0; jj < N; jj += BS)
    for (int i = 0; i < N; i++)
      for (int k = kk; k < min(kk + BS, N); k++)
        for (int j = jj; j < min(jj + BS, N); j++)
          C[i][j] += A[i][k] * B[k][j];
`,
    cache: { size: 1024, lineSize: 32, ways: 4 },
    sweep: { name: 'BS', values: [1, 2, 3, 4, 6, 8, 12, 24] },
    note: 'Already in the good ikj order, the 24×24 matrices (4.5 KB each) still do not fit a 1 KB cache. Blocking keeps an 8×8 tile of B (512 B) resident while every row of C uses it: misses drop from about 3,700 to about 1,000. Sweep BS: small tiles waste most of each line, and past 8 the tile no longer fits.',
  },
  {
    id: 'transpose',
    name: 'Transpose: naive vs blocked',
    a: `#define N 32
float A[N][N], T[N][N];

for (int i = 0; i < N; i++)
  for (int j = 0; j < N; j++)
    T[j][i] = A[i][j];
`,
    b: `#define N 32
#define BS 8
float A[N][N], T[N][N];

for (int ii = 0; ii < N; ii += BS)
  for (int jj = 0; jj < N; jj += BS)
    for (int i = ii; i < ii + BS; i++)
      for (int j = jj; j < jj + BS; j++)
        T[j][i] = A[i][j];
`,
    cache: { size: 1024, lineSize: 32, ways: 2 },
    sweep: { name: 'BS', values: [1, 2, 4, 8, 16, 32] },
    note: 'One of the two arrays is always walked by column. An 8×8 block of floats is exactly one line wide, so each fetched line of T is fully written before it is evicted.',
  },
  {
    id: 'conflict',
    name: 'Conflict misses and padding',
    a: `#define N 256
float X[N], Y[N];   // Y starts exactly 1 KB after X
float dot = 0;

for (int i = 0; i < N; i++)
  dot += X[i] * Y[i];
`,
    b: `#define N 256
#define PAD 8
float X[N + PAD], Y[N];   // Y moves to the next 64-byte boundary
float dot = 0;

for (int i = 0; i < N; i++)
  dot += X[i] * Y[i];
`,
    cache: { size: 1024, lineSize: 32, ways: 1 },
    sweep: { name: 'PAD', values: [0, 1, 8, 16, 17, 32] },
    note: 'Direct-mapped, 1 KB. X[i] and Y[i] are 1 KB apart, so they map to the same set and evict each other on every access: almost every miss is a conflict miss. Padding X moves Y to a different set (arrays are placed on 64-byte boundaries, so any PAD from 1 to 16 shifts it by two lines); so does 2-way associativity.',
  },
  {
    id: 'stride',
    name: 'Stride walk',
    a: `#define N 1024
#define STRIDE 4
int A[N];
int s = 0;

for (int i = 0; i < N; i += STRIDE)
  s += A[i];
`,
    cache: { size: 1024, lineSize: 32, ways: 2 },
    sweep: { name: 'STRIDE', values: [1, 2, 4, 8, 16, 32] },
    note: 'Every access misses once the stride reaches the line size (8 ints): sweep STRIDE and watch the miss rate climb to 1, then the number of accesses fall.',
  },
  {
    id: 'stencil',
    name: '1D stencil (reuse across iterations)',
    a: `#define N 512
double in[N], out[N];

for (int i = 1; i < N - 1; i++)
  out[i] = (in[i - 1] + in[i] + in[i + 1]) / 3;
`,
    cache: { size: 512, lineSize: 64, ways: 2 },
    note: 'Each element of in is read three times, by three iterations in a row, so only the first touch of each line misses. All misses are compulsory.',
  },
  {
    id: 'write-policy',
    name: 'Write policies: initialise an array',
    a: `#define N 512
int A[N];

for (int i = 0; i < N; i++)
  A[i] = 0;
`,
    cache: { size: 1024, lineSize: 32, ways: 2, writeAllocate: true, writeBack: true },
    note: 'Writes only. Toggle write-allocate: without it every write misses and nothing is cached; with it one write per line misses. Toggle write-back to see the memory traffic change.',
  },
];
