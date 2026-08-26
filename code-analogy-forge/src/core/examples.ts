/**
 * Bundled example snippets for the "Try an example" menu, one per concept, in
 * corpus order. Each one is chosen so the detector ranks its `highlights`
 * concept first; a test enforces that, so a detector change can never
 * silently break the examples.
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
    id: 'score-tracker',
    label: 'Score tracker (JavaScript)',
    highlights: 'variable',
    code: `// Update the score variable as the game goes on
let score = 0;
score += 10;
score += 25;
let best = score;`,
  },
  {
    id: 'tip-calculator',
    label: 'Tip calculator (Python)',
    highlights: 'function-return',
    code: `# A function that returns the tip
def tip(bill, percent=20):
    return round(bill * percent / 100, 2)`,
  },
  {
    id: 'shipping-rules',
    label: 'Shipping rules (JavaScript)',
    highlights: 'conditional',
    code: `// if/else branching over the order total
if (order.total >= 50) {
  order.shipping = 0;
} else if (order.isMember) {
  order.shipping = 2;
} else {
  order.shipping = 5;
}`,
  },
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
    id: 'temperature-readings',
    label: 'Temperature readings (Python)',
    highlights: 'array',
    code: `# Array indexing: positions, not searching
readings = [18.5, 19.2, 21.0, 22.4, 20.9]
first = readings[0]
latest = readings[len(readings) - 1]
readings[2] = 21.5`,
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
  {
    id: 'counter-factory',
    label: 'Counter factory (JavaScript)',
    highlights: 'closure',
    code: `// A closure keeps its captured variable alive
function makeCounter() {
  let count = 0;
  return () => {
    count += 1;
    return count;
  };
}`,
  },
  {
    id: 'linked-list-node',
    label: 'Linked list node (C)',
    highlights: 'pointer-reference',
    code: `// Pointers: the node holds the address of the next node
struct Node *head = malloc(sizeof(struct Node));
head->value = 7;
head->next = NULL;`,
  },
  {
    id: 'safe-file-read',
    label: 'Safe file read (Python)',
    highlights: 'exception-handling',
    code: `# Exception handling around a risky read
try:
    with open(path) as f:
        data = f.read()
except FileNotFoundError:
    data = ""
except PermissionError:
    raise
finally:
    log("attempted read of " + path)`,
  },
  {
    id: 'memoized-lookup',
    label: 'Memoized lookup (Python)',
    highlights: 'cache',
    code: `# Cache results (memoization): compute once, reuse forever
cache = {}
def expensive(x):
    if x not in cache:
        cache[x] = slow_compute(x)
    return cache[x]`,
  },
  {
    id: 'worker-threads',
    label: 'Worker threads (Python)',
    highlights: 'threads-parallelism',
    code: `# Threads run in parallel; a lock prevents a race condition
workers = [threading.Thread(target=crunch, args=(chunk,)) for chunk in chunks]
for w in workers:
    w.start()
for w in workers:
    w.join()`,
  },
  {
    id: 'counting-pairs',
    label: 'Counting pairs (Python)',
    highlights: 'big-o',
    code: `# Big O: the nested scan makes this O(n^2) time complexity
pairs = 0
for i in range(len(items)):
    for j in range(i + 1, len(items)):
        if items[i] == items[j]:
            pairs += 1`,
  },
  {
    id: 'feature-branch',
    label: 'Feature branch flow (shell)',
    highlights: 'git-version-control',
    code: `# Version control basics: branch, commit, merge
git checkout -b add-login
git commit -m "Add login form"
git checkout main
git merge add-login`,
  },
  {
    id: 'orders-endpoint',
    label: 'Orders endpoint (JavaScript)',
    highlights: 'api',
    code: `// A REST API endpoint
app.get('/api/orders/:id', (req, res) => {
  const order = orders[req.params.id];
  res.json(order);
});`,
  },
  {
    id: 'lock-a-message',
    label: 'Lock a message (Python)',
    highlights: 'encryption',
    code: `# Encrypt and decrypt with a cipher key
cipher = Fernet(key)
token = cipher.encrypt(b"meet at noon")
plain = cipher.decrypt(token)`,
  },
  {
    id: 'decimal-to-binary',
    label: 'Decimal to binary (Python)',
    highlights: 'binary',
    code: `# Binary representation, one bit at a time
n = 0b101101
digits = []
while n > 0:
    digits.append(n & 1)
    n = n >> 1
assert digits[::-1] == [1, 0, 1, 1, 0, 1]`,
  },
  {
    id: 'friend-network',
    label: 'Friend network layers (Python)',
    highlights: 'graph',
    code: `# Graph traversal over an adjacency list
friends = {"ana": ["ben", "col"], "ben": ["ana"], "col": ["ana", "dia"], "dia": ["col"]}
visited = {"ana"}
frontier = deque(["ana"])
while frontier:
    person = frontier.popleft()
    for neighbor in friends[person]:
        if neighbor not in visited:
            visited.add(neighbor)
            frontier.append(neighbor)`,
  },
];
