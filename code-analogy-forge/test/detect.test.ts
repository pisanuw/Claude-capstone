import { describe, expect, it } from 'vitest';
import { detectConcepts, selfCallingFunctions } from '../src/core/detect';

const FIB_PY = `def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)`;

const BINARY_SEARCH_JS = `function search(arr, target) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`;

const CLASS_JAVA = `public class Dog extends Animal {
  private String name;
  public Dog(String name) { this.name = name; }
  public String speak() { return this.name + " says woof"; }
}`;

const ASYNC_JS = `async function load() {
  const res = await fetch('/api/items');
  return res.json();
}`;

const STACK_JS = `const undo = [];
undo.push(change);
const last = undo.pop();`;

const DICT_PY = `ages = {"ada": 36, "alan": 41}
if "ada" in ages:
    print(ages["ada"])`;

describe('detectConcepts', () => {
  it('returns nothing for empty or blank input', () => {
    expect(detectConcepts('')).toEqual([]);
    expect(detectConcepts('   \n  ')).toEqual([]);
  });

  it('returns nothing for prose without CS content', () => {
    expect(detectConcepts('The weather was lovely and we had picnic sandwiches.')).toEqual([]);
  });

  it('is deterministic: same input, same ranking', () => {
    const a = detectConcepts(FIB_PY);
    const b = detectConcepts(FIB_PY);
    expect(a).toEqual(b);
  });

  it('detects recursion from a self-calling function and ranks it first', () => {
    const results = detectConcepts(FIB_PY);
    expect(results[0].conceptId).toBe('recursion');
    expect(results[0].evidence.join(' ')).toContain('fib');
  });

  it('detects a concept named in plain English', () => {
    const results = detectConcepts('How do I explain recursion to a ten year old?');
    expect(results[0].conceptId).toBe('recursion');
    expect(results[0].evidence[0]).toContain('recursion');
  });

  it('detects multi-word concept names like "hash map" and "binary search"', () => {
    expect(detectConcepts('what is a hash map')[0].conceptId).toBe('hashmap');
    expect(detectConcepts('binary search explained')[0].conceptId).toBe('binary-search');
  });

  it('detects binary search from lo/hi/mid code shape', () => {
    const ids = detectConcepts(BINARY_SEARCH_JS).map((d) => d.conceptId);
    expect(ids).toContain('binary-search');
    expect(ids).toContain('loop');
  });

  it('detects classes and inheritance from Java-style code', () => {
    const results = detectConcepts(CLASS_JAVA);
    expect(results[0].conceptId).toBe('class-oop');
    const evidence = results[0].evidence.join('; ');
    expect(evidence).toContain('class');
    expect(evidence).toContain('inheritance');
  });

  it('detects async/await', () => {
    const results = detectConcepts(ASYNC_JS);
    expect(results[0].conceptId).toBe('async');
  });

  it('detects a stack from push/pop usage', () => {
    const ids = detectConcepts(STACK_JS).map((d) => d.conceptId);
    expect(ids).toContain('stack');
  });

  it('detects a dictionary literal plus key check', () => {
    const results = detectConcepts(DICT_PY);
    const hash = results.find((d) => d.conceptId === 'hashmap');
    expect(hash).toBeDefined();
  });

  it('detects loops and conditionals in ordinary imperative code', () => {
    const code = `for (let i = 0; i < items.length; i++) {
      if (items[i] > 10) { big += 1; } else { small += 1; }
    }`;
    const ids = detectConcepts(code).map((d) => d.conceptId);
    expect(ids).toContain('loop');
    expect(ids).toContain('conditional');
    expect(ids).toContain('array');
  });

  it('detects queue operations', () => {
    const ids = detectConcepts('const next = jobs.shift(); // dequeue the oldest job').map((d) => d.conceptId);
    expect(ids).toContain('queue');
  });

  it('detects sorting calls', () => {
    const ids = detectConcepts('names.sort((a, b) => a.localeCompare(b));').map((d) => d.conceptId);
    expect(ids).toContain('sorting');
  });

  it('detects tree shapes from left/right children', () => {
    const code = `function depth(node) {
      if (!node) return 0;
      return 1 + Math.max(depth(node.left), depth(node.right));
    }`;
    const results = detectConcepts(code);
    const ids = results.map((d) => d.conceptId);
    expect(ids).toContain('tree');
    expect(ids).toContain('recursion');
  });

  it('detects a closure from a returned inner function', () => {
    const code = `function makeGreeter(name) {
      return () => console.log('hi ' + name);
    }`;
    const ids = detectConcepts(code).map((d) => d.conceptId);
    expect(ids).toContain('closure');
  });

  it('detects pointers from C-style declarations and dereferences', () => {
    const results = detectConcepts('struct Node *head = NULL;\nhead->next = malloc(sizeof(struct Node));');
    expect(results[0].conceptId).toBe('pointer-reference');
  });

  it('detects exception handling across languages', () => {
    expect(detectConcepts('try:\n    risky()\nexcept ValueError:\n    pass')[0].conceptId).toBe('exception-handling');
    expect(detectConcepts('try { risky(); } catch (e) { report(e); } finally { close(); }')[0].conceptId).toBe(
      'exception-handling',
    );
  });

  it('detects threads and locking', () => {
    const results = detectConcepts('const m = new Mutex();\nawait m.lock();\n// threads must not race');
    const ids = results.map((d) => d.conceptId);
    expect(ids).toContain('threads-parallelism');
  });

  it('detects complexity talk', () => {
    expect(detectConcepts('why is this O(n^2) and how do I make it O(n log n)?')[0].conceptId).toBe('big-o');
  });

  it('detects git workflows', () => {
    expect(detectConcepts('git checkout -b fix; git commit -m "fix"; git rebase main')[0].conceptId).toBe(
      'git-version-control',
    );
  });

  it('detects graph traversal shapes', () => {
    const code = `for (const neighbor of adjacencyList[node]) {
      if (!visited.has(neighbor)) visited.add(neighbor);
    }`;
    const ids = detectConcepts(code).map((d) => d.conceptId);
    expect(ids[0]).toBe('graph');
  });

  it('detects prose mentions of the newer concepts', () => {
    expect(detectConcepts('what is a closure in javascript')[0].conceptId).toBe('closure');
    expect(detectConcepts('explain public key encryption')[0].conceptId).toBe('encryption');
    expect(detectConcepts('how do binary numbers work')[0].conceptId).toBe('binary');
    expect(detectConcepts('what is an api endpoint')[0].conceptId).toBe('api');
    expect(detectConcepts('explain caching to my manager')[0].conceptId).toBe('cache');
  });

  it('scores every detection positively and sorts descending', () => {
    const results = detectConcepts(BINARY_SEARCH_JS);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].score).toBeGreaterThan(0);
      if (i > 0) expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe('selfCallingFunctions', () => {
  it('finds python self-calls', () => {
    expect(selfCallingFunctions(FIB_PY)).toEqual(['fib']);
  });

  it('finds JS function-declaration self-calls', () => {
    const code = `function walk(dir) { for (const d of dirs(dir)) walk(d); }`;
    expect(selfCallingFunctions(code)).toEqual(['walk']);
  });

  it('finds arrow-function self-calls', () => {
    const code = `const fact = (n) => n <= 1 ? 1 : n * fact(n - 1);`;
    expect(selfCallingFunctions(code)).toEqual(['fact']);
  });

  it('finds Java-style method self-calls', () => {
    const code = `int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); }`;
    expect(selfCallingFunctions(code)).toContain('gcd');
  });

  it('does not flag non-recursive functions, even ones called elsewhere', () => {
    expect(selfCallingFunctions('function lonely(a) { return a; }')).toEqual([]);
    const code = `function add(a, b) { return a + b; }\nconst sum = add(1, 2);`;
    expect(selfCallingFunctions(code)).toEqual([]);
  });

  it('only looks inside the body: a python helper called later is not recursive', () => {
    const code = `def helper(x):\n    return x * 2\n\nprint(helper(3))`;
    expect(selfCallingFunctions(code)).toEqual([]);
  });
});
