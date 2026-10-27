// A small built-in library of free study resources for common CS topics,
// matched to gradebook topics by keyword. Instructors can add their own
// (one "topic | title | url" per line), which take precedence.

export interface Resource {
  title: string;
  url: string;
}

interface Entry {
  keys: RegExp;
  resources: Resource[];
}

const wiki = (page: string, title: string): Resource => ({ title: `${title} (Wikipedia)`, url: `https://en.wikipedia.org/wiki/${page}` });
const visu = (page: string, title: string): Resource => ({ title: `${title} (VisuAlgo)`, url: `https://visualgo.net/en/${page}` });

const LIBRARY: Entry[] = [
  { keys: /recurs/, resources: [wiki('Recursion_(computer_science)', 'Recursion'), visu('recursion', 'Recursion tree visualiser')] },
  { keys: /graph|bfs|dfs|travers|shortest|dijkstra/, resources: [wiki('Graph_traversal', 'Graph traversal'), visu('dfsbfs', 'DFS and BFS'), visu('sssp', 'Shortest paths')] },
  { keys: /sort/, resources: [wiki('Sorting_algorithm', 'Sorting algorithms'), visu('sorting', 'Sorting')] },
  { keys: /big.?o|complexity|asymptot|runtime|efficien/, resources: [wiki('Big_O_notation', 'Big O notation'), wiki('Time_complexity', 'Time complexity')] },
  { keys: /linked/, resources: [wiki('Linked_list', 'Linked list'), visu('list', 'Linked lists')] },
  { keys: /\bbst\b|binary search tree|\btrees?\b/, resources: [wiki('Binary_search_tree', 'Binary search tree'), visu('bst', 'Binary search trees')] },
  { keys: /hash/, resources: [wiki('Hash_table', 'Hash table'), visu('hashtable', 'Hash tables')] },
  { keys: /heap|priority/, resources: [wiki('Heap_(data_structure)', 'Heap'), visu('heap', 'Binary heaps')] },
  { keys: /dynamic programming|\bdp\b|memoi/, resources: [wiki('Dynamic_programming', 'Dynamic programming')] },
  { keys: /stack/, resources: [wiki('Stack_(abstract_data_type)', 'Stack'), visu('list', 'Stacks and queues')] },
  { keys: /queue/, resources: [wiki('Queue_(abstract_data_type)', 'Queue'), visu('list', 'Stacks and queues')] },
  { keys: /pointer|memory|malloc/, resources: [wiki('Pointer_(computer_programming)', 'Pointers'), wiki('C_dynamic_memory_allocation', 'Dynamic memory in C')] },
  { keys: /array|list/, resources: [wiki('Array_(data_structure)', 'Arrays')] },
  { keys: /string/, resources: [wiki('String_(computer_science)', 'Strings')] },
  { keys: /loop|iteration|control/, resources: [wiki('Control_flow', 'Control flow and loops')] },
  { keys: /condition|boolean|logic/, resources: [wiki('Boolean_algebra', 'Boolean algebra'), wiki('Conditional_(computer_programming)', 'Conditionals')] },
  { keys: /class|object|oop|inherit|polymorph/, resources: [wiki('Object-oriented_programming', 'Object-oriented programming')] },
  { keys: /binary search|search/, resources: [wiki('Binary_search', 'Binary search')] },
  { keys: /sql|database|query/, resources: [wiki('SQL', 'SQL'), wiki('Relational_algebra', 'Relational algebra')] },
  { keys: /binary|bits?\b|number system/, resources: [wiki('Binary_number', 'Binary numbers'), wiki("Two's_complement", "Two's complement")] },
  { keys: /function|procedure|scope/, resources: [wiki('Function_(computer_programming)', 'Functions')] },
  { keys: /test|debug/, resources: [wiki('Unit_testing', 'Unit testing'), wiki('Debugging', 'Debugging')] },
  { keys: /concurren|thread|lock|race/, resources: [wiki('Concurrency_(computer_science)', 'Concurrency'), wiki('Race_condition', 'Race conditions')] },
  { keys: /regex|regular expression/, resources: [wiki('Regular_expression', 'Regular expressions')] },
  { keys: /proof|induction/, resources: [wiki('Mathematical_induction', 'Mathematical induction')] },
  { keys: /probab/, resources: [wiki('Probability', 'Probability')] },
  { keys: /git|version control/, resources: [{ title: 'Pro Git book (git-scm.com)', url: 'https://git-scm.com/book/en/v2' }] },
];

export interface CustomResource extends Resource {
  topic: string;
}

/** Parses "topic | title | url" lines; returns the entries and the lines that did not parse. */
export function parseCustomResources(text: string): { resources: CustomResource[]; bad: string[] } {
  const resources: CustomResource[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map((s) => s.trim());
    const url = parts[2] ?? '';
    if (parts.length !== 3 || !parts[0] || !parts[1] || !/^https?:\/\/\S+$/.test(url)) {
      bad.push(line);
      continue;
    }
    resources.push({ topic: (parts[0] as string).toLowerCase(), title: parts[1] as string, url });
  }
  return { resources, bad };
}

/** Resources for a topic: the instructor's own first, then up to `limit` built-in ones. */
export function resourcesFor(topic: string, custom: CustomResource[] = [], limit = 2): Resource[] {
  const t = topic.toLowerCase();
  const mine = custom.filter((c) => c.topic === t).map(({ title, url }) => ({ title, url }));
  const lib = LIBRARY.find((e) => e.keys.test(t))?.resources ?? [];
  const out = [...mine];
  for (const r of lib) if (out.length < mine.length + limit && !out.some((o) => o.url === r.url)) out.push(r);
  return out;
}
