import type { Detection } from './types';
import { CONCEPTS } from './corpus/index';

/**
 * Deterministic concept detection over pasted code or prose.
 *
 * Two signal sources, summed per concept:
 *  - keyword mentions ("recursion", "hash map"), matched as whole words/phrases;
 *  - code-shape patterns (a `while` loop, `.push(` + `.pop(`, a function calling itself).
 *
 * No AI, no network: the same paste always yields the same ranking.
 */

const KEYWORD_SCORE = 4;
const PATTERN_SCORE = 2;
const SELF_CALL_SCORE = 6;

interface PatternRule {
  re: RegExp;
  why: string;
}

interface ConceptRules {
  conceptId: string;
  keywords: string[];
  patterns: PatternRule[];
}

const RULES: ConceptRules[] = [
  {
    conceptId: 'variable',
    keywords: ['variable', 'variables', 'assignment', 'mutable state'],
    patterns: [
      { re: /\b(?:let|const|var)\s+[A-Za-z_$][\w$]*\s*=/, why: 'declares and assigns a variable' },
      { re: /\b(?:int|long|double|float|boolean|String)\s+\w+\s*=/, why: 'typed variable declaration' },
      { re: /^\s*[A-Za-z_]\w*\s*=\s*[^=\s]/m, why: 'assigns a value to a name' },
      { re: /\b\w+\s*(?:\+=|-=|\*=)\s*/, why: 'updates a variable in place' },
    ],
  },
  {
    conceptId: 'function-return',
    // "a function" / "functions" catch prose without firing on the JS
    // `function` keyword, which the patterns below already score.
    keywords: ['a function', 'functions', 'return value', 'method', 'parameter', 'subroutine'],
    patterns: [
      { re: /\breturn\b/, why: 'uses return' },
      { re: /\bdef\s+\w+\s*\(/, why: 'defines a function (def)' },
      { re: /\bfunction\b\s*\w*\s*\(/, why: 'defines a function' },
      { re: /=>/, why: 'arrow function' },
    ],
  },
  {
    conceptId: 'conditional',
    keywords: ['conditional', 'conditionals', 'if statement', 'if/else', 'branching', 'ternary'],
    patterns: [
      { re: /\bif\s*\(|^\s*(?:el)?if\b[^\n]*:/m, why: 'has an if' },
      { re: /\belse\b/, why: 'has an else branch' },
      { re: /\b(?:elif|else if)\b/, why: 'chains conditions' },
      { re: /\bswitch\s*\(/, why: 'has a switch' },
    ],
  },
  {
    conceptId: 'loop',
    keywords: ['loop', 'loops', 'iteration', 'iterate', 'for loop', 'while loop'],
    patterns: [
      { re: /\bfor\s*[(\s]\s*\w/, why: 'has a for loop' },
      { re: /\bwhile\s*[(\s]/, why: 'has a while loop' },
      { re: /\.forEach\s*\(/, why: 'iterates with forEach' },
      { re: /\brange\s*\(/, why: 'iterates over a range' },
      { re: /\bfor\s+\w+\s+in\b/, why: 'has a for-in/for-each loop' },
    ],
  },
  {
    conceptId: 'array',
    keywords: ['array', 'arrays', 'arraylist', 'indexing', 'out of bounds'],
    patterns: [
      { re: /\b\w+\[[^\]\n]*\]/, why: 'indexes with square brackets' },
      { re: /\.append\s*\(/, why: 'appends to a list' },
      { re: /\bnew\s+\w+\[\d*\]/, why: 'allocates an array' },
      { re: /\.length\b|\blen\s*\(/, why: 'reads a length' },
    ],
  },
  {
    conceptId: 'hashmap',
    keywords: ['hash map', 'hashmap', 'hash table', 'dictionary', 'key-value', 'lookup table'],
    patterns: [
      { re: /\bnew\s+(?:Map|HashMap|WeakMap)\b/, why: 'creates a map' },
      { re: /\bdict\s*\(|\{\s*['"][^'"\n]+['"]\s*:/, why: 'builds a dictionary literal' },
      { re: /\.(?:get|set|has)\s*\(\s*['"\w]/, why: 'looks up by key' },
      { re: /\bin\s+\w+\s*:\s*$|\.containsKey\s*\(/m, why: 'checks for a key' },
    ],
  },
  {
    conceptId: 'stack',
    keywords: ['stack', 'lifo', 'last in first out', 'call stack', 'undo history'],
    patterns: [
      { re: /\bnew\s+Stack\b|\bStack</, why: 'creates a stack' },
      { re: /\.push\s*\([\s\S]*\.pop\s*\(|\.pop\s*\([\s\S]*\.push\s*\(/, why: 'pushes and pops' },
      { re: /\.peek\s*\(/, why: 'peeks at a top element' },
    ],
  },
  {
    conceptId: 'queue',
    keywords: ['queue', 'fifo', 'first in first out', 'enqueue', 'dequeue'],
    patterns: [
      { re: /\bnew\s+Queue\b|\bQueue</, why: 'creates a queue' },
      { re: /\.shift\s*\(|\.poll\s*\(|\bpopleft\b/, why: 'removes from the front' },
    ],
  },
  {
    conceptId: 'tree',
    keywords: ['tree', 'binary tree', 'binary search tree', 'bst', 'hierarchy', 'treenode'],
    patterns: [
      { re: /\.left\b[\s\S]*\.right\b|\.right\b[\s\S]*\.left\b/, why: 'nodes with left and right children' },
      { re: /\bTreeNode\b|\broot\b/, why: 'mentions a root or tree node' },
      { re: /\.children\b/, why: 'nodes with children' },
    ],
  },
  {
    conceptId: 'binary-search',
    keywords: ['binary search', 'bisect', 'halving the range'],
    patterns: [
      { re: /\b(?:lo|low|left)\b[\s\S]{0,120}?\b(?:hi|high|right)\b[\s\S]{0,120}?\bmid\b/, why: 'keeps low/high/mid bounds' },
      { re: /\(\s*(?:lo|low|left)\s*\+\s*(?:hi|high|right)\s*\)\s*(?:\/|\/\/|>>)\s*[21]/, why: 'computes a midpoint' },
    ],
  },
  {
    conceptId: 'sorting',
    keywords: [
      'sort',
      'sorting',
      'sorted order',
      'quicksort',
      'merge sort',
      'mergesort',
      'bubble sort',
      'insertion sort',
      'selection sort',
    ],
    patterns: [
      { re: /\.sort\s*\(|\bsorted\s*\(|Collections\.sort|Arrays\.sort/, why: 'calls a sort' },
      { re: /\bswap\s*\(|\b(?:temp|tmp)\s*=\s*\w+\s*[;\n]\s*\w+\s*=\s*\w+/, why: 'swaps two elements' },
    ],
  },
  {
    conceptId: 'recursion',
    keywords: ['recursion', 'recursive', 'recurse', 'base case', 'self-referential'],
    patterns: [],
  },
  {
    conceptId: 'async',
    keywords: ['async', 'asynchronous', 'await', 'promise', 'promises', 'callback', 'non-blocking'],
    patterns: [
      { re: /\basync\s+(?:function|def|\w+\s*\()|\basync\s*\(/, why: 'declares async work' },
      { re: /\bawait\b/, why: 'awaits a result' },
      { re: /\bPromise\b|\.then\s*\(/, why: 'uses promises' },
      { re: /\bsetTimeout\s*\(|\bsetInterval\s*\(/, why: 'schedules work for later' },
    ],
  },
  {
    conceptId: 'class-oop',
    keywords: [
      'class',
      'classes',
      'object-oriented',
      'oop',
      'inheritance',
      'polymorphism',
      'encapsulation',
      'instance',
      'constructor',
    ],
    patterns: [
      { re: /\bclass\s+[A-Z]\w*/, why: 'defines a class' },
      { re: /\bextends\b|\bimplements\b|\bsuper\s*[(.]/, why: 'uses inheritance' },
      { re: /\bself\.\w+|\bthis\.\w+/, why: 'accesses instance state' },
      { re: /\bnew\s+[A-Z]\w*\s*\(|__init__/, why: 'constructs an object' },
    ],
  },
  {
    conceptId: 'closure',
    keywords: ['closure', 'closures', 'captured variable', 'lexical scope'],
    patterns: [
      { re: /\breturn\s+function\b/, why: 'returns a function' },
      { re: /\breturn\s+(?:\([^)\n]*\)|[\w$]+)\s*=>/, why: 'returns an arrow function' },
      { re: /^([ \t]*)def\s+\w+[^\n]*:\n(?:\1[ \t]+[^\n]*\n)*?\1[ \t]+def\s+\w+/m, why: 'defines a nested function' },
      { re: /\bnonlocal\b/, why: 'reaches into an enclosing scope' },
    ],
  },
  {
    conceptId: 'pointer-reference',
    keywords: ['pointer', 'pointers', 'reference', 'references', 'dereference', 'alias', 'pass by reference'],
    patterns: [
      { re: /\b(?:int|char|float|double|void|struct\s+\w+|Node)\s*\*+\s*\w+/, why: 'declares a pointer' },
      { re: /\w+\s*->\s*\w+/, why: 'dereferences with ->' },
      { re: /=\s*&\w+/, why: 'takes an address with &' },
      { re: /\bnullptr\b|\bNULL\b|\bmalloc\s*\(|\bfree\s*\(/, why: 'manages memory through pointers' },
    ],
  },
  {
    conceptId: 'exception-handling',
    keywords: ['exception', 'exceptions', 'error handling', 'try catch', 'try/catch'],
    patterns: [
      { re: /\btry\s*[{:]/, why: 'has a try block' },
      { re: /\bcatch\s*[({]|\bexcept\b/, why: 'catches a failure' },
      { re: /\bfinally\b/, why: 'has cleanup that always runs' },
      { re: /\bthrow\s+|\braise\s+/, why: 'throws or raises' },
    ],
  },
  {
    conceptId: 'cache',
    keywords: ['cache', 'caching', 'cached', 'memoization', 'memoize', 'memoized'],
    patterns: [
      { re: /\b(?:memo|cache)\w*\s*[[.(=]/, why: 'keeps results in a cache structure' },
      { re: /lru_cache|@cache\b/, why: 'uses a caching decorator' },
      { re: /Cache-Control|max-age=/, why: 'sets HTTP cache headers' },
    ],
  },
  {
    conceptId: 'threads-parallelism',
    keywords: [
      'thread',
      'threads',
      'parallel',
      'parallelism',
      'concurrency',
      'race condition',
      'mutex',
      'deadlock',
      'thread-safe',
    ],
    patterns: [
      { re: /\bThread\s*\(|threading\.|pthread_|\bgo\s+func\b/, why: 'starts a thread' },
      { re: /\bsynchronized\b|\bmutex\w*\b|\.lock\s*\(\)|\bLock\s*\(\)/, why: 'locks shared state' },
      { re: /multiprocessing\.|\bWorker\s*\(|new\s+Worker\b/, why: 'runs work on parallel workers' },
      { re: /\.join\s*\(\s*\)/, why: 'waits for a thread to finish' },
    ],
  },
  {
    conceptId: 'big-o',
    keywords: ['big o', 'big-o', 'time complexity', 'space complexity', 'quadratic time', 'linear time', 'asymptotic'],
    patterns: [{ re: /\bO\s*\(\s*(?:1|n|log\s*n|n\s*(?:\^|\*\*)?\s*2|n\s*log\s*n|2\s*\^\s*n)\s*\)/i, why: 'names a complexity class' }],
  },
  {
    conceptId: 'git-version-control',
    keywords: ['git', 'version control', 'commit', 'commits', 'merge conflict', 'pull request', 'rebase'],
    patterns: [
      { re: /\bgit\s+(?:commit|merge|checkout|switch|branch|push|pull|rebase|log|diff|init|clone|status)\b/, why: 'runs git commands' },
      { re: /^diff --git|^@@ .* @@|^[+-]{3}\s/m, why: 'looks like a diff' },
    ],
  },
  {
    conceptId: 'api',
    keywords: ['api', 'apis', 'endpoint', 'endpoints', 'rest api', 'web service'],
    patterns: [
      { re: /fetch\s*\(\s*['"`][^'"`\n]*\/api\/|https?:\/\/[^\s'"`]*\/api\//, why: 'calls an /api/ URL' },
      { re: /app\.(?:get|post|put|delete|patch)\s*\(|@app\.route|@(?:Get|Post|Put|Delete)Mapping/, why: 'defines a route handler' },
      { re: /\bres\.(?:json|send|status)\s*\(|\breq\.(?:params|query|body)\b/, why: 'handles requests and responses' },
    ],
  },
  {
    conceptId: 'encryption',
    keywords: ['encryption', 'encrypt', 'decrypt', 'cipher', 'public key', 'private key', 'cryptography'],
    patterns: [
      { re: /\bAES\b|\bRSA\b|\bSHA-?\d|\bHMAC\b/, why: 'names a crypto algorithm' },
      { re: /crypto\.|Fernet\b|cipher\w*\s*[.([=]/i, why: 'uses a crypto library' },
    ],
  },
  {
    conceptId: 'binary',
    keywords: ['binary number', 'binary numbers', 'binary representation', 'in binary', 'base 2', 'bitwise', 'bits'],
    patterns: [
      { re: /\b0b[01]+\b/, why: 'has a binary literal' },
      { re: /(?:<<|>>>?)\s*\d|&\s*1\b|\^\s*\w|\|\s*\(?\s*1\s*<</, why: 'does bitwise arithmetic' },
      { re: /\bbin\s*\(|toString\s*\(\s*2\s*\)/, why: 'converts to base 2' },
    ],
  },
  {
    conceptId: 'graph',
    keywords: ['graph', 'graphs', 'vertex', 'vertices', 'adjacency', 'shortest path', 'bfs', 'dfs'],
    patterns: [
      { re: /adjacency[_ ]?(?:list|matrix)|\badj\b/i, why: 'keeps an adjacency structure' },
      { re: /\bvisited\b/, why: 'tracks visited nodes' },
      { re: /\bneighbors?\b/i, why: 'walks neighbors' },
    ],
  },
  {
    conceptId: 'linked-list',
    keywords: ['linked list', 'linked lists', 'singly linked', 'doubly linked', 'listnode'],
    patterns: [
      { re: /\.next\s*=|\.next\s*!==?|\w+\s*=\s*\w+\.next\b/, why: 'follows .next links' },
      { re: /->\s*next\b/, why: 'follows ->next links' },
      { re: /\bListNode\b/, why: 'names a list node' },
    ],
  },
  {
    conceptId: 'set',
    keywords: ['a set', 'hash set', 'hashset', 'unique elements', 'duplicates', 'membership', 'deduplicate'],
    patterns: [
      { re: /\bnew\s+Set\b|\bset\s*\(\s*[)[]/, why: 'creates a set' },
      { re: /\.intersection\b|\.union\b|\bissubset\b|\.difference\b/, why: 'uses set algebra' },
    ],
  },
  {
    conceptId: 'heap-priority-queue',
    keywords: ['heap', 'priority queue', 'min-heap', 'max-heap', 'heapq', 'binary heap'],
    patterns: [
      { re: /heapq|heappush|heappop|PriorityQueue|BinaryHeap/, why: 'uses a heap structure' },
      { re: /sift(?:Up|Down)|bubbleUp|percolate/i, why: 'restores the heap property' },
    ],
  },
  {
    conceptId: 'hashing',
    keywords: ['hash', 'hashing', 'checksum', 'digest', 'fingerprint', 'sha256', 'md5'],
    patterns: [
      { re: /hashlib\.|\bsha-?(?:1|256|512)\b|\bmd5\b/i, why: 'computes a digest' },
      { re: /\bhashCode\s*\(|\bhash\s*\(/, why: 'calls a hash function' },
    ],
  },
  {
    conceptId: 'state-machine',
    keywords: ['state machine', 'finite state', 'transition', 'transitions', 'fsm'],
    patterns: [
      { re: /\bstate\s*=\s*['"]\w+['"]/, why: 'tracks a named state' },
      { re: /switch\s*\(\s*\w*[Ss]tate\s*\)/, why: 'branches on the current state' },
      { re: /transitions?\s*[:=[{]/, why: 'declares a transition table' },
    ],
  },
  {
    conceptId: 'boolean-logic',
    keywords: ['boolean', 'booleans', 'truth table', 'logical operators', 'de morgan', 'and or not'],
    patterns: [
      { re: /&&[\s\S]*\|\||\|\|[\s\S]*&&/, why: 'combines AND with OR' },
      { re: /\b(?:bool|boolean)\b/, why: 'declares a boolean' },
      { re: /\bnot\s+\(|![a-zA-Z(]/, why: 'negates a condition' },
    ],
  },
  {
    conceptId: 'scope',
    keywords: ['scope', 'scopes', 'global variable', 'local variable', 'shadowing', 'shadows'],
    patterns: [{ re: /\bglobal\s+\w+/, why: 'declares a global' }],
  },
  {
    conceptId: 'abstraction',
    keywords: ['abstraction', 'abstraction layer', 'implementation details', 'under the hood', 'high-level interface'],
    patterns: [
      { re: /\binterface\s+[A-Z]\w*/, why: 'declares an interface' },
      { re: /\babstract\s+class\b/, why: 'declares an abstract class' },
    ],
  },
  {
    conceptId: 'regex',
    keywords: ['regex', 'regexp', 'regular expression', 'regular expressions', 'wildcard'],
    patterns: [
      { re: /\bre\.(?:match|search|findall|sub|compile)\s*\(/, why: "uses Python's re module" },
      { re: /new\s+RegExp\b/, why: 'builds a RegExp' },
      { re: /\.test\s*\(|\.exec\s*\(/, why: 'tests a pattern' },
      { re: /\\[dws][{+*]?/, why: 'uses regex character classes' },
    ],
  },
  {
    conceptId: 'floating-point',
    keywords: ['floating point', 'floating-point', 'float', 'floats', 'rounding', 'precision', 'rounding error'],
    patterns: [
      { re: /0\.1\s*\+\s*0\.2/, why: 'adds 0.1 and 0.2' },
      { re: /\.toFixed\s*\(|Math\.round\b|\bround\s*\(/, why: 'rounds a value' },
      { re: /\bNaN\b|\bInfinity\b|\bepsilon\b/i, why: 'handles float edge values' },
    ],
  },
  {
    conceptId: 'compiler-interpreter',
    keywords: ['compiler', 'compilers', 'compiled', 'compile', 'interpreter', 'interpreted', 'bytecode', 'source code'],
    patterns: [
      { re: /\bgcc\b|\bjavac\b|\btsc\b|\bclang\b/, why: 'invokes a compiler' },
      { re: /SyntaxError|\.compile\s*\(/, why: 'compiles or fails to parse' },
    ],
  },
  {
    conceptId: 'sql-database',
    keywords: ['sql', 'database', 'databases', 'query', 'queries', 'primary key', 'foreign key'],
    patterns: [
      { re: /\bSELECT\b[\s\S]*\bFROM\b/i, why: 'has a SELECT ... FROM' },
      { re: /\bINSERT\s+INTO\b|\bCREATE\s+TABLE\b|\bUPDATE\s+\w+\s+SET\b/i, why: 'writes to tables' },
      { re: /\bJOIN\b/i, why: 'joins tables' },
    ],
  },
  {
    conceptId: 'http',
    keywords: ['http', 'https', 'http request', 'status code', 'get request', 'post request', 'headers'],
    patterns: [
      { re: /\b(?:GET|POST|PUT|DELETE|PATCH)\s+\/\S*/, why: 'has a request line' },
      { re: /HTTP\/\d(?:\.\d)?/, why: 'names the HTTP protocol version' },
      { re: /status(?:Code)?\s*[:=]\s*\d{3}\b|\b(?:200 OK|404 Not Found|500 Internal)/, why: 'carries a status code' },
    ],
  },
  {
    conceptId: 'dns',
    keywords: ['dns', 'domain name', 'nameserver', 'name server', 'dns record', 'resolver'],
    patterns: [
      { re: /\bnslookup\b|\bdig\s+(?:\+\w+\s+)?[\w.-]+\.\w{2,}/, why: 'looks up a name' },
      { re: /\b(?:A|AAAA|CNAME|MX|TXT)\s+record/i, why: 'names a DNS record type' },
    ],
  },
  {
    conceptId: 'packets-routing',
    keywords: ['packet', 'packets', 'router', 'routers', 'routing', 'tcp', 'ip address', 'latency', 'bandwidth'],
    patterns: [
      { re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/, why: 'contains an IP address' },
      { re: /\btraceroute\b|\bping\s+[\w.-]/, why: 'traces the network path' },
      { re: /\bTTL\b|\bhops?\b/i, why: 'talks about hops' },
    ],
  },
  {
    conceptId: 'event-driven',
    keywords: ['event', 'events', 'listener', 'listeners', 'event listener', 'subscribe', 'publish', 'emit'],
    patterns: [
      { re: /addEventListener\s*\(|\.on\s*\(\s*['"]/, why: 'registers a listener' },
      { re: /\.emit\s*\(|dispatchEvent\s*\(/, why: 'fires an event' },
      { re: /\.subscribe\s*\(|\.publish\s*\(/, why: 'uses publish/subscribe' },
    ],
  },
  {
    conceptId: 'debugging',
    keywords: ['debug', 'debugging', 'debugger', 'breakpoint', 'stack trace', 'bisect', 'reproduce the bug'],
    patterns: [
      { re: /\bbreakpoint\s*\(|\bdebugger\s*;|\bpdb\b/, why: 'sets a breakpoint' },
      { re: /console\.log\s*\(\s*['"](?:here|got here|debug)/i, why: 'printf-debugs' },
      { re: /git\s+bisect/, why: 'bisects history' },
    ],
  },
  {
    conceptId: 'testing',
    keywords: ['unit test', 'unit tests', 'test case', 'test cases', 'testing', 'assertion', 'assertions', 'tdd', 'regression test'],
    patterns: [
      { re: /\bassert(?:\w*\s*\(|\s+\S)|\bexpect\s*\(/, why: 'asserts an outcome' },
      { re: /\bdef\s+test_\w+|\b(?:it|describe)\s*\(\s*['"`]/, why: 'defines a test' },
      { re: /\bpytest\b|\bunittest\b|\bvitest\b|\bjest\b|\bjunit\b/i, why: 'names a test framework' },
    ],
  },
  {
    conceptId: 'refactoring',
    keywords: ['refactor', 'refactoring', 'refactored', 'code smell', 'clean up the code', 'extract a function'],
    patterns: [{ re: /TODO[:\s].*refactor/i, why: 'flags a refactor TODO' }],
  },
  {
    conceptId: 'garbage-collection',
    keywords: ['garbage collection', 'garbage collector', 'memory leak', 'reference counting', 'unreachable', 'heap memory'],
    patterns: [
      { re: /=\s*null\b\s*;?\s*(?:\/\/|$)/m, why: 'drops the last reference' },
      { re: /\bWeakRef\b|\bWeakMap\b|\bfinalize\b|System\.gc\s*\(\)/, why: 'touches the collector' },
      { re: /\bdel\s+\w+/, why: 'deletes a binding' },
    ],
  },
  {
    conceptId: 'operating-system',
    keywords: ['operating system', 'kernel', 'process', 'processes', 'scheduler', 'system call'],
    patterns: [
      { re: /\bfork\s*\(\s*\)|\bexecve?\b|\bpid\b/i, why: 'manages processes' },
      { re: /\bkill\s+-?\d|\bps\s+-|\bsystemctl\b|\bsudo\b/, why: 'drives the OS from a shell' },
    ],
  },
  {
    conceptId: 'randomness-seed',
    keywords: ['random', 'randomness', 'seed', 'seeded', 'prng', 'shuffle', 'shuffled'],
    patterns: [
      { re: /Math\.random\s*\(|random\.(?:random|randint|choice|shuffle|seed)\s*\(|\brand\s*\(\s*\)/, why: 'draws random numbers' },
      { re: /\bseed\s*\(/, why: 'sets a seed' },
    ],
  },
];

const knownConceptIds = new Set(CONCEPTS.map((c) => c.id));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The text between the braces that open at or after `from` (best effort). */
function braceBody(input: string, from: number): string | null {
  const open = input.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < input.length; i++) {
    if (input[i] === '{') depth += 1;
    else if (input[i] === '}') {
      depth -= 1;
      if (depth === 0) return input.slice(open + 1, i);
    }
  }
  // Unbalanced snippet (partial paste): take everything after the brace.
  return input.slice(open + 1);
}

/** The indented block following a Python def at `lineStart`. */
function pythonBody(input: string, lineStart: number): string {
  const lines = input.slice(lineStart).split('\n');
  const defIndent = (/^\s*/.exec(lines[0]) ?? [''])[0].length;
  const body: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const indent = (/^\s*/.exec(line) ?? [''])[0].length;
    if (indent <= defIndent) break;
    body.push(line);
  }
  return body.join('\n');
}

interface FoundFunction {
  name: string;
  body: string;
}

/** Functions defined in the input with their (best-effort) bodies. */
function definedFunctions(input: string): FoundFunction[] {
  const out: FoundFunction[] = [];
  const seen = new Set<string>();
  const push = (name: string, body: string | null) => {
    if (body !== null && !seen.has(name)) {
      seen.add(name);
      out.push({ name, body });
    }
  };

  for (const m of input.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    push(m[1], braceBody(input, m.index + m[0].length));
  }
  for (const m of input.matchAll(/^([ \t]*)def\s+([A-Za-z_]\w*)\s*\(/gm)) {
    push(m[2], pythonBody(input, m.index));
  }
  for (const m of input.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)\n]*\)|[\w$]+)\s*=>/g,
  )) {
    const after = input.slice(m.index + m[0].length);
    const trimmed = after.trimStart();
    if (trimmed.startsWith('{')) {
      push(m[1], braceBody(input, m.index + m[0].length));
    } else {
      // Expression body: up to the terminating semicolon or end of input.
      const end = after.indexOf(';');
      push(m[1], end === -1 ? after : after.slice(0, end));
    }
  }
  for (const m of input.matchAll(
    /\b(?:public|private|protected|static|int|long|double|float|boolean|void|String|char)\s+(?:[\w<>[\]]+\s+)?([A-Za-z_]\w*)\s*\([^)\n]*\)\s*\{/g,
  )) {
    push(m[1], braceBody(input, m.index + m[0].length - 1));
  }
  return out;
}

/** Names of defined functions whose own body calls them again (self-recursion). */
export function selfCallingFunctions(input: string): string[] {
  const out: string[] = [];
  for (const fn of definedFunctions(input)) {
    if (new RegExp(`\\b${escapeRegExp(fn.name)}\\s*\\(`).test(fn.body)) {
      out.push(fn.name);
    }
  }
  return out;
}

/** Run every rule over the input and return concepts ranked by score (desc). */
export function detectConcepts(input: string): Detection[] {
  const text = input.trim();
  if (text === '') return [];
  const lower = text.toLowerCase();

  const detections: Detection[] = [];
  for (const rule of RULES) {
    let score = 0;
    const evidence: string[] = [];

    for (const kw of rule.keywords) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(kw)}(?:[^a-z0-9]|$)`, 'i');
      if (re.test(lower)) {
        score += KEYWORD_SCORE;
        evidence.push(`mentions "${kw}"`);
      }
    }

    for (const p of rule.patterns) {
      if (p.re.test(text)) {
        score += PATTERN_SCORE;
        evidence.push(p.why);
      }
    }

    if (rule.conceptId === 'recursion') {
      const selfCalls = selfCallingFunctions(text);
      if (selfCalls.length > 0) {
        score += SELF_CALL_SCORE;
        evidence.push(`calls itself (${selfCalls.join(', ')})`);
      }
    }

    if (score > 0 && knownConceptIds.has(rule.conceptId)) {
      detections.push({ conceptId: rule.conceptId, score, evidence });
    }
  }

  // Stable sort: score desc, then rule order (already the array order).
  return detections.sort((a, b) => b.score - a.score);
}
