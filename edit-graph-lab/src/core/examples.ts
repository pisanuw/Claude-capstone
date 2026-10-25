// Curated inputs. The line-mode ones are "readability traps": cases where a
// minimal diff is technically correct but aligns the wrong lines.

import type { Mode } from './script';

export interface Example {
  id: string;
  title: string;
  mode: Mode;
  a: string;
  b: string;
  note: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'paper',
    title: "Myers' paper: ABCABBA to CBABAC",
    mode: 'char',
    a: 'ABCABBA',
    b: 'CBABAC',
    note: 'The running example from the 1986 paper. D = 5: five furthest-reaching steps and the V array fit on one screen.',
  },
  {
    id: 'kitten',
    title: 'kitten to sitting',
    mode: 'char',
    a: 'kitten',
    b: 'sitting',
    note: 'Levenshtein distance is 3, but diff has no substitution: each changed letter costs a delete plus an insert, so D = 5.',
  },
  {
    id: 'braces',
    title: 'Inserted function (sliding braces)',
    mode: 'line',
    a: `int one(void) {
    return 1;
}

int three(void) {
    return 3;
}
`,
    b: `int one(void) {
    return 1;
}

int two(void) {
    return 2;
}

int three(void) {
    return 3;
}
`,
    note: 'All four find D = 4, but the inserted block can slide by one line because "}" and the blank line repeat. Myers and patience insert the function cleanly; histogram keeps the second "}" instead and splits the new function across the old brace. (Real git runs an extra "indent heuristic" pass to slide such hunks; the lab shows raw algorithm output.)',
  },
  {
    id: 'moved',
    title: 'Swapped functions',
    mode: 'line',
    a: `void chunk_copy(chunk *src, size_t n, chunk *dst)
{
    if (!chunk_check(src, n)) return;
    if (!chunk_check(dst, n)) return;

    memcpy(dst->data, src->data, n);
}

int chunk_check(chunk *c, size_t n)
{
    if (c == NULL) return 0;

    return n <= c->length;
}
`,
    b: `int chunk_check(chunk *c, size_t n)
{
    if (c == NULL) return 0;

    return n <= c->length;
}

void chunk_copy(chunk *src, size_t n, chunk *dst)
{
    if (!chunk_check(src, n)) return;
    if (!chunk_check(dst, n)) return;

    memcpy(dst->data, src->data, n);
}
`,
    note: 'Adapted from James Coglan\'s patience-diff write-up. The LCS table keeps every shared "{", "}" and blank line and interleaves the two functions. Myers and histogram move one function as two clean hunks; patience moves it in one hunk but slides the closing brace.',
  },
  {
    id: 'frobnitz',
    title: 'Frobnitz (Bram Cohen)',
    mode: 'line',
    a: `#include <stdio.h>

// Frobs foo heartily
int frobnitz(int foo)
{
    int i;
    for(i = 0; i < 10; i++)
    {
        printf("Your answer is: ");
        printf("%d\\n", foo);
    }
}

int fact(int n)
{
    if(n > 1)
    {
        return fact(n-1) * n;
    }
    return 1;
}

int main(int argc, char **argv)
{
    frobnitz(fact(10));
}
`,
    b: `#include <stdio.h>

int fib(int n)
{
    if(n > 2)
    {
        return fib(n-1) + fib(n-2);
    }
    return 1;
}

// Frobs foo heartily
int frobnitz(int foo)
{
    int i;
    for(i = 0; i < 10; i++)
    {
        printf("%d\\n", foo);
    }
}

int main(int argc, char **argv)
{
    frobnitz(fib(10));
}
`,
    note: 'The example Bram Cohen used to introduce patience diff: fact() is replaced by fib() and moved up. The LCS table interleaves old and new functions line by line; Myers and patience show the move; histogram needs two hunks.',
  },
  {
    id: 'list',
    title: 'Reordered list',
    mode: 'line',
    a: `apples
bananas
cherries
dates
elderberries
figs
grapes
`,
    b: `bananas
cherries
dates
apples
elderberries
figs
grapes
`,
    note: 'One item moved. Diff has no "move" operation, so the best it can do is delete it in one place and insert it in another (D = 2).',
  },
  {
    id: 'blank',
    title: 'Paragraphs and blank lines',
    mode: 'line',
    a: `# Notes

Lists are ordered.

Sets are not.

Maps pair keys with values.
`,
    b: `# Notes

Arrays are contiguous.

Lists are ordered.

Maps pair keys with values.

Sets are not.
`,
    note: 'Blank lines are the most common line in prose and the least informative. LCS anchors on them and pairs unrelated sentences; Myers and patience keep each sentence with its paragraph; histogram slides a blank line.',
  },
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
