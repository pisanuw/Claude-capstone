/**
 * The original demo course (four submissions to a linked-list assignment in
 * Python, Java and JavaScript) and the machinery every demo uses: scripted
 * sessions played through the real Session class so the review dashboard has
 * something to show. Names and code are invented.
 */

import { emptyCourse, generateAll, acceptTranscript, type Course } from './course';
import { parseGitLog } from './commits';
import { Session } from './session';
import type { Question, Submission } from './types';

export const SAMPLE_SPEC = `Assignment 4: Linked lists and merge sort.
Implement a singly linked list with \`append(value)\`, \`remove(value)\` and \`merge_sort()\` (Java/JS: \`mergeSort()\`).
merge_sort must sort the list in place in O(n log n) time without copying the values into an array.
remove must raise an error when the value is not in the list.
Also write \`dedupe()\`, which should remove repeated values while keeping the first occurrence.`;

const ANA = `class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


class LinkedList:
    def __init__(self):
        self.head = None
        self.size = 0

    def append(self, value):
        node = Node(value)
        if self.head is None:
            self.head = node
        else:
            cur = self.head
            while cur.next is not None:
                cur = cur.next
            cur.next = node
        self.size += 1

    def remove(self, value):
        prev, cur = None, self.head
        while cur is not None and cur.value != value:
            prev, cur = cur, cur.next
        if cur is None:
            raise ValueError(f"{value} not in list")
        if prev is None:
            self.head = cur.next
        else:
            prev.next = cur.next
        self.size -= 1

    def dedupe(self):
        seen = set()
        prev, cur = None, self.head
        while cur is not None:
            if cur.value in seen:
                prev.next = cur.next
                self.size -= 1
            else:
                seen.add(cur.value)
                prev = cur
            cur = cur.next

    def merge_sort(self):
        self.head = self._sort(self.head)

    def _sort(self, head):
        if head is None or head.next is None:
            return head
        middle = self._middle(head)
        right = middle.next
        middle.next = None
        return self._merge(self._sort(head), self._sort(right))

    def _middle(self, head):
        slow, fast = head, head.next
        while fast is not None and fast.next is not None:
            slow = slow.next
            fast = fast.next.next
        return slow

    def _merge(self, a, b):
        dummy = tail = Node(None)
        while a is not None and b is not None:
            if a.value <= b.value:
                tail.next, a = a, a.next
            else:
                tail.next, b = b, b.next
            tail = tail.next
        tail.next = a if a is not None else b
        return dummy.next
`;

const BEN = `class Node:
    def __init__(self, data):
        self.data = data
        self.next = None


class LinkedList:
    def __init__(self):
        self.head = None

    def append(self, data):
        n = Node(data)
        if not self.head:
            self.head = n
            return
        t2 = self.head
        while t2.next:
            t2 = t2.next
        t2.next = n

    def remove(self, data):
        if self.head is None:
            raise ValueError("empty")
        if self.head.data == data:
            self.head = self.head.next
            return
        tmp1 = self.head
        while tmp1.next and tmp1.next.data != data:
            tmp1 = tmp1.next
        if tmp1.next is None:
            raise ValueError("not found")
        tmp1.next = tmp1.next.next

    def dedupe(self):
        cur = self.head
        while cur:
            r = cur
            while r.next:
                if r.next.data == cur.data:
                    r.next = r.next.next
                else:
                    r = r.next
            cur = cur.next

    def merge_sort(self):
        self.head = self.ms(self.head)

    def ms(self, h):
        if h is None or h.next is None:
            return h
        sl, fs = h, h
        pv = None
        while fs and fs.next:
            pv = sl
            sl = sl.next
            fs = fs.next.next
        pv.next = None
        l1 = self.ms(h)
        l2 = self.ms(sl)
        return self.mg(l1, l2)

    def mg(self, l1, l2):
        d = Node(0)
        t = d
        while l1 and l2:
            if l1.data < l2.data:
                t.next = l1
                l1 = l1.next
            else:
                t.next = l2
                l2 = l2.next
            t = t.next
        t.next = l1 or l2
        return d.next
`;

const CHEN = `import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

public class LinkedList {
    private static class Node {
        int value;
        Node next;
        Node(int value) { this.value = value; }
    }

    private Node head;
    private Node tail;

    public void append(int value) {
        Node node = new Node(value);
        if (head == null) {
            head = node;
        } else {
            tail.next = node;
        }
        tail = node;
    }

    public void remove(int value) {
        Node dummy = new Node(0);
        dummy.next = head;
        Node prev = dummy;
        while (prev.next != null && prev.next.value != value) {
            prev = prev.next;
        }
        if (prev.next == null) {
            throw new NoSuchElementException("value " + value + " not found");
        }
        if (prev.next == tail) {
            tail = prev == dummy ? null : prev;
        }
        prev.next = prev.next.next;
        head = dummy.next;
    }

    public void dedupe() {
        Map<Integer, Boolean> counts = new HashMap<>();
        Node prev = null;
        for (Node cur = head; cur != null; cur = cur.next) {
            if (counts.containsKey(cur.value)) {
                prev.next = cur.next;
            } else {
                counts.put(cur.value, true);
                prev = cur;
            }
        }
        tail = prev;
    }

    public void mergeSort() {
        head = sort(head);
        tail = head;
        while (tail != null && tail.next != null) {
            tail = tail.next;
        }
    }

    private Node sort(Node start) {
        if (start == null || start.next == null) {
            return start;
        }
        Node slow = start;
        Node fast = start.next;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        Node second = slow.next;
        slow.next = null;
        return merge(sort(start), sort(second));
    }

    private Node merge(Node a, Node b) {
        Node dummy = new Node(0);
        Node end = dummy;
        while (a != null && b != null) {
            if (a.value <= b.value) {
                end.next = a;
                a = a.next;
            } else {
                end.next = b;
                b = b.next;
            }
            end = end.next;
        }
        end.next = (a != null) ? a : b;
        return dummy.next;
    }
}
`;

const DANA = `export class LinkedList {
  constructor() {
    this.head = null;
    this.length = 0;
  }

  append(value) {
    const node = { value, next: null };
    if (!this.head) {
      this.head = node;
    } else {
      let cur = this.head;
      while (cur.next) cur = cur.next;
      cur.next = node;
    }
    this.length++;
  }

  remove(value) {
    let prev = null;
    let cur = this.head;
    while (cur && cur.value !== value) {
      prev = cur;
      cur = cur.next;
    }
    if (!cur) throw new Error(\`\${value} is not in the list\`);
    if (prev) prev.next = cur.next;
    else this.head = cur.next;
    this.length--;
  }

  dedupe() {
    const seen = new Set();
    let prev = null;
    for (let cur = this.head; cur; cur = cur.next) {
      if (seen.has(cur.value)) {
        prev.next = cur.next;
        this.length--;
      } else {
        seen.add(cur.value);
        prev = cur;
      }
    }
  }

  mergeSort() {
    let width = 1;
    while (width < this.length) {
      const dummy = { value: null, next: this.head };
      let tail = dummy;
      let rest = this.head;
      while (rest) {
        const left = rest;
        const right = split(left, width);
        rest = split(right, width);
        tail = merge(left, right, tail);
      }
      this.head = dummy.next;
      width *= 2;
    }
  }
}

function split(start, count) {
  let node = start;
  for (let i = 1; node && i < count; i++) node = node.next;
  if (!node) return null;
  const after = node.next;
  node.next = null;
  return after;
}

function merge(a, b, tail) {
  while (a && b) {
    if (a.value <= b.value) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a || b;
  while (tail.next) tail = tail.next;
  return tail;
}
`;

export const log = (entries: [string, string, string, string, [number, string][]][]) =>
  parseGitLog(
    entries
      .map(([sha, author, date, msg, files]) => `commit ${sha}\nAuthor: ${author} <x@example.edu>\nDate:   ${date}\n\n    ${msg}\n\n${files.map(([n, f]) => `${n}\t0\t${f}`).join('\n')}\n`)
      .join('\n'),
  );

export const STARTER: [string, string, string, string, [number, string][]] = ['a0a0a0a0a0a0a0a0', 'github-classroom[bot]', '2026-09-28T09:00:00-07:00', 'Initial commit', [[12, 'README.md']]];

export const SAMPLE_SUBMISSIONS: Submission[] = [
  {
    id: 'a4-ana-ruiz',
    student: 'Ana Ruiz',
    files: [{ path: 'linked_list.py', text: ANA }],
    commits: log([
      STARTER,
      ['b1c2d3e4f5a6b7c8', 'Ana Ruiz', '2026-09-29T16:12:40-07:00', 'Node and append', [[22, 'linked_list.py']]],
      ['c2d3e4f5a6b7c8d9', 'Ana Ruiz', '2026-09-29T17:05:02-07:00', 'remove with ValueError', [[13, 'linked_list.py']]],
      ['d3e4f5a6b7c8d9e0', 'Ana Ruiz', '2026-09-30T20:41:19-07:00', 'merge sort, recursive', [[24, 'linked_list.py']]],
      ['e4f5a6b7c8d9e0f1', 'Ana Ruiz', '2026-10-01T11:30:55-07:00', 'fix middle for 2-node lists', [[3, 'linked_list.py']]],
      ['f5a6b7c8d9e0f1a2', 'Ana Ruiz', '2026-10-01T12:02:10-07:00', 'dedupe with a set', [[11, 'linked_list.py']]],
    ]),
  },
  {
    id: 'a4-ben-okafor',
    student: 'Ben Okafor',
    files: [{ path: 'linked_list.py', text: BEN }],
    commits: log([
      STARTER,
      ['9f8e7d6c5b4a3921', 'Ben Okafor', '2026-10-02T02:47:10-07:00', 'done', [[86, 'linked_list.py']]],
      ['8e7d6c5b4a392110', 'Ben Okafor', '2026-10-02T02:51:33-07:00', 'fix', [[1, 'linked_list.py']]],
    ]),
  },
  {
    id: 'a4-chen-wei',
    student: 'Chen Wei',
    files: [{ path: 'src/LinkedList.java', text: CHEN }],
    commits: log([
      STARTER,
      ['1a2b3c4d5e6f7a8b', 'Chen Wei', '2026-09-30T14:20:00-07:00', 'append and remove with tail pointer', [[38, 'src/LinkedList.java']]],
      ['2b3c4d5e6f7a8b9c', 'Chen Wei', '2026-09-30T15:48:31-07:00', 'dedupe', [[14, 'src/LinkedList.java']]],
      ['3c4d5e6f7a8b9c0d', 'Chen Wei', '2026-10-01T19:10:12-07:00', 'merge sort', [[40, 'src/LinkedList.java']]],
      ['4d5e6f7a8b9c0d1e', 'Chen Wei', '2026-10-01T19:55:47-07:00', 'keep tail correct after sort and remove', [[8, 'src/LinkedList.java']]],
    ]),
  },
  {
    id: 'a4-dana-kim',
    student: 'Dana Kim',
    files: [{ path: 'linkedList.js', text: DANA }],
    commits: log([
      STARTER,
      ['5e6f7a8b9c0d1e2f', 'Dana Kim', '2026-09-29T10:02:00-07:00', 'list, append, remove', [[30, 'linkedList.js']]],
      ['6f7a8b9c0d1e2f3a', 'Dana Kim', '2026-10-01T22:14:09-07:00', 'bottom-up merge sort (no recursion)', [[52, 'linkedList.js']]],
      ['7a8b9c0d1e2f3a4b', 'Dana Kim', '2026-10-01T23:40:41-07:00', 'dedupe', [[16, 'linkedList.js']]],
    ]),
  },
];

const tick = (q: Question) => `\`${q.identifiers[0] ?? 'it'}\``;

const DESIGN_ANSWERS: Record<string, (id: string) => string> = {
  key: (id) => `I used a map because looking a key up in ${id} is a hash lookup, so each one is O(1) on average and the whole pass stays linear. With a list of pairs I would have to search every pair for each lookup, which is quadratic time; the cost is the extra memory for the table.`,
  duplicate: (id) => `I used a set because I only need to know whether a value was already seen, and membership in ${id} is a hash lookup, O(1) on average, so the whole pass stays linear. A list would make each check a scan, which is quadratic time, and the cost is the memory for the set.`,
  order: (id) => `I kept the values in ${id} because I need them in order and by index, and appending is O(1) amortised. A dictionary would lose the order I rely on later, so the list is faster for this and uses less memory.`,
  fifo: (id) => `${id} is used as a stack or queue because I always need the most recent (or oldest) item first, and pushing and popping at that end is O(1). With a plain list and pop(0) every removal shifts all the items, which is slow, linear time per operation.`,
  smallest: (id) => `A heap gives me the smallest item in O(log n) per push and pop, so ${id} stays fast as the input grows. A sorted list would need O(n) inserts each time.`,
};

/** A strong answer built from the question's own identifiers and concepts (for the demo only). */
export function strongAnswer(q: Question): string {
  const id = tick(q);
  const second = q.identifiers[1] ? `\`${q.identifiers[1]}\`` : id;
  switch (q.kind) {
    case 'recursion':
      return `The base case is when ${second} reaches the smallest input, empty, zero or a single element, because there is nothing left to split, so ${id} returns straight away. Every recursive call passes a smaller piece of the input, so the size shrinks on each call and must reach that base case after a bounded number of levels.`;
    case 'edge':
      return `That check is true when ${id} is empty, zero, missing or past the last element, for example on an empty input. If I deleted it the code would read past the end or use a null value and crash with an error, or give a wrong result, so the check is what keeps the empty and single element cases from failing.`;
    case 'design':
      return (DESIGN_ANSWERS[q.concepts[0]?.[0] ?? ''] ?? DESIGN_ANSWERS.order!)(id);
    case 'naming':
      return `${id} holds the current item we are working on, so it keeps track of where we are while the loop moves forward and stores the value we need next. A clearer name would be current or next_item, because that says what value it keeps.`;
    case 'commit':
      return `I started with the simplest function first and tested it on small inputs, then built the rest on top of it. The first version had a bug on the empty input, so I added a test for that case, found the error and fixed the check. I changed it again after a test with duplicate values failed.`;
    case 'scale':
      return `The loops dominate: each pass touches every element once, and the nested loop or recursion repeats that, so the time grows like O(n log n) or worse, roughly quadratic if both loops run n times. If the input is 1,000 times larger that line runs far more often, because it sits inside the innermost loop.`;
    case 'spec':
      return `That is ${id}: the line where it checks the input and returns or raises the error. I tested it by calling it with an input that should fail and checked that the error comes out, and with a normal case to make sure it still works, because both cases are in the spec.`;
    default:
      return `I would start with a small input of three values. First ${id} sets ${second} from the input, then each step of the loop moves forward and updates the result, so after the last pass it returns the final answer. For my example the output was correct because each step only changes one value at a time.`;
  }
}

/** Off-topic, vague and pasted replies for the weak demo student; the long one is the course's pasted "textbook" text. */
export function weakAnswers(pasted: string): string[] {
  return ['It basically just works I think.', pasted, 'not sure, it works though', 'It goes through the input.'];
}

export type DemoStyle = 'strong' | 'weak' | 'mixed';

/** Plays scripted sessions through the real Session class with a fake clock. */
export function simulate(course: Course, id: string, style: DemoStyle, pasted: string): Course {
  const v = course.vivas[id];
  if (!v) return course;
  let now = Date.parse('2026-10-06T15:00:00Z');
  const s = new Session(v, () => now);
  const weakTexts = weakAnswers(pasted);
  let k = 0;
  while (!s.done) {
    const step = s.current();
    if (step.kind === 'done') break;
    const weak = style === 'weak' || (style === 'mixed' && step.index % 2 === 1 && step.followUps === 0);
    const text = weak ? weakTexts[k++ % weakTexts.length]! : strongAnswer(step.question);
    const pasteLen = weak && text.length > 150 ? text.length : 0;
    now += pasteLen ? 8_000 : Math.max(25_000, text.split(' ').length * 1_600);
    if (style === 'weak' && k === 3) for (let b = 0; b < 3; b++) s.blur();
    s.answer(text, pasteLen);
  }
  const res = acceptTranscript(course, s.transcript());
  return res.ok ? res.course : course;
}

export interface Demo {
  id: string;
  /** Short topic label for the picker. */
  topic: string;
  languages: string;
  course: string;
  assignment: string;
  spec: string;
  deadline: string;
  /** A textbook paragraph the weak student pastes. */
  pasted: string;
  students: { submission: Submission; style: DemoStyle | null; extraTime?: number }[];
}

export function buildDemo(d: Demo): Course {
  let c = emptyCourse({ course: d.course, assignment: d.assignment, spec: d.spec, minutes: 20, questions: 5, maxFollowUps: 2, deadline: d.deadline });
  const accommodations: Record<string, number> = {};
  for (const s of d.students) if (s.extraTime) accommodations[s.submission.id] = s.extraTime;
  c = generateAll({ ...c, submissions: d.students.map((s) => s.submission), accommodations });
  for (const s of d.students) if (s.style) c = simulate(c, s.submission.id, s.style, d.pasted);
  return c;
}

export const LINKED_LISTS: Demo = {
  id: 'linked-lists',
  topic: 'Linked lists and merge sort',
  languages: 'Python, Java, JavaScript',
  course: 'CS 143',
  assignment: 'A4: Linked lists',
  spec: SAMPLE_SPEC,
  deadline: '2026-10-02T23:59:00-07:00',
  pasted:
    'Merge sort is an efficient, general-purpose, comparison-based sorting algorithm. Most implementations produce a stable sort, which means that the relative order of equal elements is the same in the input and output. Merge sort is a divide-and-conquer algorithm.',
  students: [
    { submission: SAMPLE_SUBMISSIONS[0]!, style: 'strong' },
    { submission: SAMPLE_SUBMISSIONS[1]!, style: 'weak' },
    { submission: SAMPLE_SUBMISSIONS[2]!, style: 'mixed' },
    { submission: SAMPLE_SUBMISSIONS[3]!, style: null, extraTime: 1.5 },
  ],
};

export function sampleCourse(): Course {
  return buildDemo(LINKED_LISTS);
}
