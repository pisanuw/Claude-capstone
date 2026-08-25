/**
 * Bundled example snippets for the "Try an example" menu. Each one is chosen
 * so the detector ranks its `highlights` concept first; a test enforces that,
 * so a detector change can never silently break the examples.
 */
export interface Example {
  id: string;
  label: string;
  /** The concept the detector must rank first for this snippet. */
  highlights: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'grading-loop',
    label: 'Grading loop (JavaScript)',
    highlights: 'loop',
    code: `// Loop through all grades
const grades = [88, 92, 79, 61, 95];
let passing = 0;
for (let i = 0; i < grades.length; i++) {
  if (grades[i] >= 70) {
    passing += 1;
  } else {
    console.log(\`Student \${i} needs help\`);
  }
}`,
  },
  {
    id: 'word-counter',
    label: 'Word counter (Python)',
    highlights: 'hashmap',
    code: `# Count words with a dictionary
counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1`,
  },
  {
    id: 'undo-stack',
    label: 'Undo stack (JavaScript)',
    highlights: 'stack',
    code: `const stack = [];
function record(change) {
  stack.push(change);
}
function undo() {
  return stack.pop();
}`,
  },
  {
    id: 'print-queue',
    label: 'Print queue (JavaScript)',
    highlights: 'queue',
    code: `const queue = ['tax-report.pdf', 'slides.pdf'];
function nextJob() {
  return queue.shift(); // dequeue the oldest job
}`,
  },
  {
    id: 'tree-depth',
    label: 'Tree depth (JavaScript)',
    highlights: 'tree',
    code: `// Depth of a binary tree
function depth(node) {
  if (!node) return 0;
  return 1 + Math.max(depth(node.left), depth(node.right));
}`,
  },
  {
    id: 'binary-search',
    label: 'Binary search (JavaScript)',
    highlights: 'binary-search',
    code: `// Binary search over sorted data
function search(arr, target) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
  },
  {
    id: 'bubble-sort',
    label: 'Bubble sort (Python)',
    highlights: 'sorting',
    code: `# Bubble sort: the largest values sink to the end
for i in range(len(nums)):
    for j in range(len(nums) - i - 1):
        if nums[j] > nums[j + 1]:
            nums[j], nums[j + 1] = nums[j + 1], nums[j]`,
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci (Python)',
    highlights: 'recursion',
    code: `def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)`,
  },
  {
    id: 'async-fetch',
    label: 'Fetch a profile with async/await (JavaScript)',
    highlights: 'async',
    code: `async function loadProfile(userId) {
  const res = await fetch(\`/api/users/\${userId}\`);
  return await res.json();
}`,
  },
  {
    id: 'dog-class',
    label: 'Dog extends Animal (Java)',
    highlights: 'class-oop',
    code: `public class Dog extends Animal {
    private String name;
    public Dog(String name) { this.name = name; }
    public String speak() { return this.name + " says woof"; }
}`,
  },
];
