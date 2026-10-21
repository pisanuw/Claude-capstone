/**
 * The demo courses offered on the start screen: the original linked-list
 * course plus ten more topics across languages. Student code lives as plain
 * source files under src/demos/<course>/<student>/ and is bundled as text.
 * Commit histories are generated from a short description: steady work over a
 * few days, or the one-big-late-commit pattern the weak student in each course
 * shows. Names and code are invented.
 */

import { LINKED_LISTS, STARTER, buildDemo, log, type Demo, type DemoStyle } from './sample';
import { hash } from './text';
import type { Course } from './course';
import type { Commit, Submission } from './types';

const SOURCES = import.meta.glob('../demos/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Source text of a bundled demo file, by its path under src/demos. */
export function demoSource(path: string): string {
  const text = SOURCES[`../demos/${path}`];
  if (text === undefined) throw new Error(`Missing demo file ${path}`);
  return text;
}

type History = { kind: 'steady'; start: string; days: number; messages: string[] } | { kind: 'cram'; at: string };

function lines(text: string): number {
  return text.split('\n').filter((l) => l.trim()).length;
}

/** Commit history for one student's files. "steady" spreads the lines over several commits; "cram" lands nearly all of them at once. */
function history(id: string, author: string, files: { path: string; text: string }[], h: History): Commit[] {
  const total = files.reduce((s, f) => s + lines(f.text), 0);
  const main = files[0]!.path;
  const sha = (k: number) => hash(`${id}:${k}`).padEnd(16, '0');
  if (h.kind === 'cram') {
    const at = new Date(Date.parse(h.at) + 4 * 60_000).toISOString().slice(0, 19);
    const offset = h.at.slice(19);
    return log([STARTER, [sha(1), author, h.at, 'done', [[total - 1, main]]], [sha(2), author, `${at}${offset}`, 'fix', [[1, main]]]]);
  }
  const n = h.messages.length;
  const offset = h.start.slice(19);
  const entries = h.messages.map((msg, k): [string, string, string, string, [number, string][]] => {
    const t = new Date(Date.parse(h.start) + Math.round((k * h.days * 86_400_000) / Math.max(1, n - 1)));
    const local = new Date(t.getTime() + offsetMinutes(offset) * 60_000).toISOString().slice(0, 19);
    const share = k === n - 1 ? total - Math.floor(total / n) * (n - 1) : Math.floor(total / n);
    return [sha(k + 1), author, `${local}${offset}`, msg, [[share, main]]];
  });
  return log([STARTER, ...entries]);
}

function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

interface StudentDef {
  name: string;
  /** Folder under src/demos/<course>/. */
  dir: string;
  files: string[];
  style: DemoStyle | null;
  history: History;
  extraTime?: number;
}

function student(course: string, s: StudentDef): { submission: Submission; style: DemoStyle | null; extraTime?: number } {
  const id = `${course}-${s.dir}`;
  const files = s.files.map((f) => ({ path: f, text: demoSource(`${course}/${s.dir}/${f}`) }));
  return { submission: { id, student: s.name, files, commits: history(id, s.name, files, s.history) }, style: s.style, ...(s.extraTime ? { extraTime: s.extraTime } : {}) };
}

function demo(d: Omit<Demo, 'students'> & { students: StudentDef[] }): Demo {
  return { ...d, students: d.students.map((s) => student(d.id, s)) };
}

const PT = '-07:00';

export const DEMOS: Demo[] = [
  LINKED_LISTS,
  demo({
    id: 'backtracking',
    topic: 'Recursion and backtracking (N-Queens, subsets)',
    languages: 'Python',
    course: 'CS 142',
    assignment: 'A6: Backtracking',
    spec: `Write \`solve_queens(n)\`, returning every placement of n queens as a list of column indexes, and \`subsets(items)\`, returning every subset of a list.
solve_queens must use backtracking: abandon a partial board as soon as two queens attack each other, without trying every permutation.
subsets should return [[]] for an empty list.`,
    deadline: `2026-10-09T23:59:00${PT}`,
    pasted: 'Backtracking is a general technique for solving problems by building a candidate solution step by step and abandoning a partial candidate as soon as it is clear that it cannot be extended to a valid solution, then returning to the most recent choice point to try the next option.',
    students: [
      { name: 'Maya Patel', dir: 'maya', files: ['queens.py'], style: 'strong', history: { kind: 'steady', start: `2026-10-05T15:10:00${PT}`, days: 3, messages: ['is_safe and tests', 'place() backtracking', 'subsets by recursion'] } },
      { name: 'Leo Grant', dir: 'leo', files: ['queens.py'], style: 'weak', history: { kind: 'cram', at: `2026-10-09T01:34:12${PT}` } },
      { name: 'Sofia Rossi', dir: 'sofia', files: ['queens.py'], style: null, history: { kind: 'steady', start: `2026-10-06T10:00:00${PT}`, days: 2, messages: ['bitmask subsets', 'queens with diagonal sets'] }, extraTime: 1.25 },
    ],
  }),
  demo({
    id: 'bst',
    topic: 'Binary search trees',
    languages: 'Java, Python',
    course: 'CS 143',
    assignment: 'A7: Binary search trees',
    spec: `Implement a binary search tree of ints with \`insert(key)\`, \`contains(key)\`, \`height()\` and \`inOrder()\`.
Duplicate keys must be ignored.
height of an empty tree should return -1.
inOrder must return the keys in ascending order.`,
    deadline: `2026-10-16T23:59:00${PT}`,
    pasted: 'A binary search tree is a rooted binary tree in which every node stores a key that is greater than all keys in its left subtree and less than all keys in its right subtree, which allows lookup, insertion and deletion in time proportional to the height of the tree.',
    students: [
      { name: 'Omar Haddad', dir: 'omar', files: ['BST.java'], style: 'strong', history: { kind: 'steady', start: `2026-10-12T13:00:00${PT}`, days: 3, messages: ['recursive insert', 'iterative contains', 'height and in-order walk'] } },
      { name: 'Jake Miller', dir: 'jake', files: ['BST.java'], style: 'weak', history: { kind: 'cram', at: `2026-10-16T03:12:40${PT}` } },
      { name: 'Priya Nair', dir: 'priya', files: ['bst.py'], style: 'mixed', history: { kind: 'steady', start: `2026-10-13T18:30:00${PT}`, days: 2, messages: ['insert with getattr', 'contains', 'height, in_order with a stack'] } },
    ],
  }),
  demo({
    id: 'maze',
    topic: 'Graphs: breadth-first search on a grid',
    languages: 'Python, JavaScript',
    course: 'CSS 342',
    assignment: 'P3: Maze shortest path',
    spec: `Write \`neighbors(grid, cell)\` and \`shortest_path(grid, start, goal)\` (JavaScript: \`shortestPath\`).
The grid is a list of strings where "." is open and "#" is a wall; moves are up, down, left and right.
shortest_path must return the number of steps on a shortest path, or -1 when the goal cannot be reached.
It should run in O(rows * cols) time.`,
    deadline: `2026-10-14T23:59:00${PT}`,
    pasted: 'Breadth-first search explores a graph level by level: it visits every vertex at distance one from the source, then every vertex at distance two, and so on, using a first-in first-out queue, which is why it finds shortest paths in unweighted graphs.',
    students: [
      { name: 'Hana Sato', dir: 'hana', files: ['maze.py'], style: 'strong', history: { kind: 'steady', start: `2026-10-10T11:00:00${PT}`, days: 3, messages: ['neighbors with bounds check', 'BFS with deque and distance map'] } },
      { name: 'Tom Becker', dir: 'tom', files: ['maze.py'], style: 'weak', history: { kind: 'cram', at: `2026-10-14T02:05:51${PT}` } },
      { name: 'Ines Duarte', dir: 'ines', files: ['maze.js'], style: null, history: { kind: 'steady', start: `2026-10-11T09:20:00${PT}`, days: 2, messages: ['neighbors', 'BFS with index queue'] } },
    ],
  }),
  demo({
    id: 'hashtable',
    topic: 'Hash table with separate chaining',
    languages: 'C',
    course: 'CSE 333',
    assignment: 'HW2: Hash table',
    spec: `Implement \`ht_put(table, key, value)\`, \`ht_get(table, key, &out)\` and \`ht_free(table)\` for a string-keyed hash table with separate chaining.
ht_put must replace the value when the key already exists.
The table should double its capacity when the load factor goes above 0.75.
ht_free must free every node, every key and the table itself.`,
    deadline: `2026-10-13T23:59:00${PT}`,
    pasted: 'Separate chaining resolves collisions by storing all entries that hash to the same bucket in a linked list; with a good hash function and a bounded load factor the expected length of each chain is constant, so insertion and lookup take constant expected time.',
    students: [
      { name: 'Rafael Gomez', dir: 'rafael', files: ['ht.c'], style: 'strong', history: { kind: 'steady', start: `2026-10-08T14:00:00${PT}`, days: 4, messages: ['djb2 hash and put', 'get', 'grow at 0.75', 'free keys and nodes'] } },
      { name: 'Nina Volkov', dir: 'nina', files: ['ht.c'], style: 'weak', history: { kind: 'cram', at: `2026-10-13T04:21:07${PT}` } },
    ],
  }),
  demo({
    id: 'dp',
    topic: 'Dynamic programming (edit distance, LCS)',
    languages: 'TypeScript, Python',
    course: 'CS 161',
    assignment: 'A5: Dynamic programming',
    spec: `Implement \`editDistance(a, b)\` (Levenshtein distance: insert, delete and substitute each cost 1) and \`lcs(a, b)\`, returning a longest common subsequence.
Both must run in O(n * m) time.
editDistance should use only O(min(n, m)) extra memory.`,
    deadline: `2026-10-20T23:59:00${PT}`,
    pasted: 'Dynamic programming solves a problem by breaking it into overlapping subproblems, solving each subproblem once and storing its answer in a table, so that the solution to the whole problem can be assembled from the stored answers instead of recomputing them.',
    students: [
      { name: 'Grace Liu', dir: 'grace', files: ['strings.ts'], style: 'strong', history: { kind: 'steady', start: `2026-10-15T16:00:00${PT}`, days: 4, messages: ['two-row edit distance', 'swap so b is shorter', 'lcs table and walk back'] } },
      { name: 'Max Fischer', dir: 'max', files: ['strings.ts'], style: 'weak', history: { kind: 'cram', at: `2026-10-20T23:31:00${PT}` } },
      { name: 'Ahmed Khan', dir: 'ahmed', files: ['strings.py'], style: 'mixed', history: { kind: 'steady', start: `2026-10-17T10:00:00${PT}`, days: 2, messages: ['full table edit distance', 'recursive lcs'] } },
    ],
  }),
  demo({
    id: 'stacks',
    topic: 'Stacks: bracket matching and postfix evaluation',
    languages: 'Java',
    course: 'CS 2',
    assignment: 'A3: Stacks',
    spec: `Write \`isBalanced(String s)\`, which returns true when every (, [ and { is closed in the right order, and \`evalRpn(String expr)\`, which evaluates a space-separated postfix expression with + - * and /.
evalRpn must throw IllegalArgumentException on malformed input.
Use a stack, not recursion.`,
    deadline: `2026-10-07T23:59:00${PT}`,
    pasted: 'A stack is a last-in first-out collection that supports push, which adds an element to the top, and pop, which removes the most recently added element; both operations take constant time, which makes stacks a natural fit for matching nested structures.',
    students: [
      { name: 'Lucas Martin', dir: 'lucas', files: ['Stacks.java'], style: 'strong', history: { kind: 'steady', start: `2026-10-03T12:00:00${PT}`, days: 3, messages: ['isBalanced with ArrayDeque', 'evalRpn', 'reject malformed expressions'] } },
      { name: 'Zoe Clark', dir: 'zoe', files: ['Stacks.java'], style: 'weak', history: { kind: 'cram', at: `2026-10-07T00:48:19${PT}` } },
    ],
  }),
  demo({
    id: 'rest-api',
    topic: 'Web development: a REST API',
    languages: 'JavaScript (Express)',
    course: 'INFO 340',
    assignment: 'Lab 6: Todo REST API',
    spec: `Build an Express router for a todo list.
GET /todos lists todos.
POST /todos creates one and must return 400 when the title is missing or longer than 200 characters.
PATCH /todos/:id toggles done and must return 404 for an unknown id.
DELETE /todos/:id should return 204.`,
    deadline: `2026-10-12T23:59:00${PT}`,
    pasted: 'REST is an architectural style in which resources are identified by URLs and manipulated through a uniform interface of HTTP methods, with each request carrying all the information the server needs and responses using status codes to describe the outcome.',
    students: [
      { name: 'Ella Brooks', dir: 'ella', files: ['todos.js'], style: 'strong', history: { kind: 'steady', start: `2026-10-08T17:00:00${PT}`, days: 3, messages: ['router factory with a store', 'validation and 400s', 'patch, delete, 404s'] } },
      { name: 'Sam Rivera', dir: 'sam', files: ['todos.js'], style: 'weak', history: { kind: 'cram', at: `2026-10-12T02:40:00${PT}` } },
    ],
  }),
  demo({
    id: 'grades',
    topic: 'Data processing: grade statistics from a CSV',
    languages: 'Python',
    course: 'CSE 160',
    assignment: 'HW4: Grade statistics',
    spec: `Write \`load_scores(path)\` to read a CSV of scores, and \`summarize(rows)\`, which must return the mean, median and standard deviation of each assignment column, skipping blank cells.
\`letter_grade(percent)\` should map 90 and above to A, 80 to B, 70 to C, 60 to D and anything lower to F.
Do not use pandas.`,
    deadline: `2026-10-15T23:59:00${PT}`,
    pasted: 'The median is the middle value of a sorted list of numbers, or the average of the two middle values when the list has an even length, and unlike the mean it is not pulled toward extreme values, which makes it a robust measure of the center of a distribution.',
    students: [
      { name: 'Noah Kim', dir: 'noah', files: ['grades.py'], style: 'strong', history: { kind: 'steady', start: `2026-10-11T14:00:00${PT}`, days: 3, messages: ['csv.DictReader loader', 'column_values skips blanks', 'median, summarize, letter_grade'] } },
      { name: 'Ava Turner', dir: 'ava', files: ['grades.py'], style: 'weak', history: { kind: 'cram', at: `2026-10-15T03:55:30${PT}` } },
    ],
  }),
  demo({
    id: 'sorting',
    topic: 'Sorting: quicksort and insertion sort',
    languages: 'C++',
    course: 'CS 162',
    assignment: 'Lab 2: Sorting',
    spec: `Implement \`insertionSort(std::vector<int>& v)\` and \`quickSort(std::vector<int>& v, int lo, int hi)\`, both in place.
quickSort must handle arrays with many duplicate values without going quadratic.
It should switch to insertion sort for ranges shorter than 16 elements.`,
    deadline: `2026-10-10T23:59:00${PT}`,
    pasted: 'Quicksort picks a pivot element, partitions the array so that smaller elements come before the pivot and larger elements after it, and then recursively sorts the two parts; its average running time is O(n log n), although a poor choice of pivot can make it quadratic.',
    students: [
      { name: 'Ethan Wright', dir: 'ethan', files: ['sort.cpp'], style: 'strong', history: { kind: 'steady', start: `2026-10-06T13:00:00${PT}`, days: 3, messages: ['insertion sort on a range', 'three-way partition quicksort', 'cutoff to insertion sort'] } },
      { name: 'Lily Evans', dir: 'lily', files: ['sort.cpp'], style: 'weak', history: { kind: 'cram', at: `2026-10-10T01:12:45${PT}` } },
    ],
  }),
  demo({
    id: 'bank',
    topic: 'Object-oriented design: bank accounts and exceptions',
    languages: 'C#',
    course: 'CSS 360',
    assignment: 'A2: Bank accounts',
    spec: `Write a \`BankAccount\` class with \`Deposit(amount)\`, \`Withdraw(amount)\` and \`Transfer(to, amount)\`.
Withdraw must throw InvalidOperationException when the balance would go below zero.
Every method should throw ArgumentOutOfRangeException for amounts of zero or less.
Keep a history of transactions.`,
    deadline: `2026-10-08T23:59:00${PT}`,
    pasted: 'Encapsulation means keeping an object\'s data private and exposing only methods that maintain its invariants, so that no outside code can put the object into an invalid state, such as an account with a negative balance.',
    students: [
      { name: 'Chloe Adams', dir: 'chloe', files: ['BankAccount.cs'], style: 'strong', history: { kind: 'steady', start: `2026-10-04T15:00:00${PT}`, days: 3, messages: ['deposit and withdraw', 'RequirePositive guard', 'transfer and history'] } },
      { name: 'Owen Price', dir: 'owen', files: ['BankAccount.cs'], style: 'weak', history: { kind: 'cram', at: `2026-10-08T02:26:00${PT}` } },
    ],
  }),
  demo({
    id: 'wordfreq',
    topic: 'CS1 text processing: word frequencies',
    languages: 'Python',
    course: 'CS 1',
    assignment: 'Project 2: Word counts',
    spec: `Write \`tokenize(text)\`, which should lower-case the text, keep apostrophes and drop the stop words the, a, an, and, of, to, in.
\`top_words(text, k)\` must return the k most frequent words with their counts, ties broken alphabetically, and raise ValueError when k is not positive.
\`longest_word(text)\` should return None for text with no words.`,
    deadline: `2026-10-05T23:59:00${PT}`,
    pasted: 'A dictionary maps keys to values and allows a value to be looked up by its key in constant average time, which makes it the standard way to count how many times each distinct item appears in a sequence.',
    students: [
      { name: 'Isla Murphy', dir: 'isla', files: ['wordfreq.py'], style: 'strong', history: { kind: 'steady', start: `2026-10-01T16:00:00${PT}`, days: 3, messages: ['tokenize with regex', 'top_words with Counter', 'longest_word'] } },
      { name: 'Finn Walsh', dir: 'finn', files: ['wordfreq.py'], style: 'weak', history: { kind: 'cram', at: `2026-10-05T23:22:10${PT}` } },
      { name: 'Rosa Silva', dir: 'rosa', files: ['wordfreq.py'], style: 'mixed', history: { kind: 'steady', start: `2026-10-02T09:00:00${PT}`, days: 2, messages: ['translate-based tokenize', 'counts dict and sort'] }, extraTime: 1.5 },
    ],
  }),
];

export function demoById(id: string): Demo | undefined {
  return DEMOS.find((d) => d.id === id);
}

/** Builds a demo course, falling back to the original linked-list course for an unknown id. */
export function loadDemo(id: string): Course {
  return buildDemo(demoById(id) ?? LINKED_LISTS);
}
