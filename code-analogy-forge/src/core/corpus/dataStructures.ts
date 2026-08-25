import type { Concept } from '../types';

export const dataStructures: Concept[] = [
  {
    id: 'array',
    name: 'Arrays and lists',
    tagline: 'An ordered row of values, each reachable instantly by its numbered position.',
    analogies: [
      {
        id: 'array--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Numbered houses on one street',
        maps: [
          { code: 'array', analog: 'the street' },
          { code: 'index', analog: 'the house number' },
          { code: 'element', analog: 'the family living at that number' },
          { code: 'index out of bounds', analog: 'looking for house 12 on a street with 8 houses' },
        ],
        text: {
          child:
            'An array is like one street where every house has a number. If someone says "go to house 5", you walk straight there, no searching. Each house has one family inside, and the numbers start at the corner and go up one by one.',
          highschool:
            'An array is a street of numbered houses: the number is the index, the family inside is the value. Knowing the number means going straight to the door without checking every house, which is why looking something up by index is instant. One catch from programming: the first house is number 0, not 1.',
          undergrad:
            'The numbered street explains why arrays are O(1) by index: house number times lot width gives the exact address, the same arithmetic as base pointer plus index times element size. It also explains the costs: inserting a house mid-street means shifting every house after it (O(n) insert), and asking for house 12 on an 8-house street is an out-of-bounds access, the array bug behind countless crashes and security holes.',
          adult:
            'An array is a street of numbered houses: to reach number 5 you go straight there, no door-to-door search. Computers store almost everything this way because "go straight to position N" is the fastest thing they do. The famous "index out of bounds" crash is software confidently walking to a house number that does not exist.',
        },
      },
      {
        id: 'array--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'An egg carton',
        maps: [
          { code: 'array of fixed size', analog: 'a 12-slot carton' },
          { code: 'index', analog: 'the slot position' },
          { code: 'element', analog: 'the egg in that slot' },
          { code: 'empty slot (null)', analog: 'a slot with no egg' },
        ],
        text: {
          child:
            'An array is like an egg carton. It has a fixed number of little slots in a row, and you can point to any slot right away: "the third one!" Some slots have eggs and some might be empty, but the carton itself always has the same number of slots.',
          highschool:
            'An egg carton is an array: a fixed row of slots you can point at by position. Slot 3 is slot 3 no matter what is in it, and an empty slot still exists, it just holds nothing (programmers call that null). If you need 13 eggs, the carton does not stretch: you need a bigger carton and must move every egg over.',
          undergrad:
            'The carton captures fixed-capacity arrays: contiguous slots, direct indexing, and the null distinction (an empty slot exists; slot 13 does not). "Need a 13th egg" is exactly how dynamic arrays grow: allocate a larger carton, copy every egg across, discard the old one. Amortize that copy over many appends and you get why ArrayList/vector append is O(1) amortized but occasionally pays a full O(n) move.',
          adult:
            'An array is an egg carton: a fixed row of slots, each addressable by position, some possibly empty. Software distinguishes "the slot is empty" from "there is no such slot", and confusing the two produces the null errors you have seen in crash messages. When a list outgrows its carton, the computer quietly buys a bigger one and moves everything, which is why some operations occasionally stutter.',
        },
      },
      {
        id: 'array--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'Numbered shelf slots',
        maps: [
          { code: 'array', analog: 'one shelf with numbered slots' },
          { code: 'index', analog: 'the slot number' },
          { code: 'element', analog: 'the book in the slot' },
          { code: 'iteration', analog: 'walking the shelf left to right' },
        ],
        text: {
          child:
            'An array is like a shelf where every book slot has a number painted on it. Want the book in slot 7? Walk straight to slot 7 and grab it. Reading the whole shelf means starting at slot 0 and going one slot at a time to the end.',
          highschool:
            'A numbered shelf is an array: slot numbers are indexes, books are values. Fetching slot 7 is instant; reading every book means walking the shelf in order, which is exactly what a loop over an array does. Swapping two books swaps values but the slots never move: order lives in the slots, not the books.',
          undergrad:
            'The numbered shelf separates the two costs students conflate: access by index (walk straight to slot 7, O(1)) versus search by content ("find the red book", O(n) walk unless the shelf is sorted). It also grounds in-place algorithms: sorting the shelf by swapping books within the same slots is what in-place sort means, no second shelf required, O(1) extra space.',
          adult:
            'An array is a shelf of numbered slots: going to slot 7 is instant, but finding "the red book" means scanning the shelf end to end. That distinction, position versus content, drives real product behavior: it is why jumping to page 7 of results is fast while a full-text search takes noticeably longer.',
        },
      },
    ],
  },
  {
    id: 'hashmap',
    name: 'Hash maps and dictionaries',
    tagline: 'Key-value storage: hand over a key, get its value back almost instantly.',
    analogies: [
      {
        id: 'hashmap--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The coat check',
        maps: [
          { code: 'key', analog: 'the numbered ticket' },
          { code: 'value', analog: 'your coat' },
          { code: 'put(key, value)', analog: 'handing over the coat, getting a ticket' },
          { code: 'get(key)', analog: 'showing the ticket, getting the coat back' },
        ],
        text: {
          child:
            'A dictionary in code is like a coat check. You hand over your coat and get a ticket with a number. Later you show the ticket and get exactly your coat back, right away, even if there are hundreds of coats behind the counter.',
          highschool:
            'A hash map is a coat check: the ticket is the key, the coat is the value. The attendant does not search every rack; the ticket number tells them exactly which hook to visit, so retrieval is near-instant no matter how many coats are stored. Lose the ticket, though, and no one can find your coat: no key, no value.',
          undergrad:
            'The coat check exposes the mechanism: the ticket number is the hash, and "ticket tells you the hook" is why get/put are expected O(1). Two coats assigned the same hook is a collision, handled by hanging both and checking tags (chaining). And re-ticketing every coat when the racks fill up and new racks arrive is a rehash, the hidden cost behind "amortized" O(1).',
          adult:
            'A hash map is a coat check: hand in something with a ticket, present the ticket later, get it back immediately regardless of how much is stored. Software leans on this everywhere, from "look up customer by email" to remembering your login. It is the reason many lookups stay fast even when the pile behind the counter grows into the millions.',
        },
      },
      {
        id: 'hashmap--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'The index at the back of a cookbook',
        maps: [
          { code: 'key', analog: 'the dish name in the index' },
          { code: 'value', analog: 'the page the index points to' },
          { code: 'lookup', analog: 'index first, then straight to the page' },
          { code: 'missing key', analog: 'a dish the index does not list' },
        ],
        text: {
          child:
            'A dictionary in code is like the index in the back of a cookbook. Instead of flipping through every page to find pancakes, you look up "pancakes" in the index and it tells you: page 42. One peek, then straight to the right page.',
          highschool:
            'A hash map works like a cookbook index: the dish name is the key, the page number is the value. Without the index you would flip pages one by one (that is searching a list); with it, lookup is two steps no matter how thick the book is. If a dish is not in the index, you learn that quickly too, without reading the whole book.',
          undergrad:
            'The cookbook index is a map from key (dish) to value (page): consult the index, then jump, versus an O(n) page flip. It also motivates the design tradeoffs: the index costs space (extra pages) and upkeep (every new recipe must be indexed, or it is unfindable, your stale-cache/inconsistent-index bug), and it supports only exact names: "something with eggs" is not an index lookup, which is why databases keep both indexes and scans.',
          adult:
            'A hash map is the index at the back of a cookbook: look up the name, jump straight to the page. Databases speed up searches with exactly this trick, and "adding an index" is a routine fix for a slow system. The tradeoff is upkeep: every new recipe has to be filed in the index too, or it becomes invisible.',
        },
      },
      {
        id: 'hashmap--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'A wall of PO boxes',
        maps: [
          { code: 'key', analog: 'the box number on your key' },
          { code: 'value', analog: 'the mail inside the box' },
          { code: 'update a key', analog: 'new mail replacing old in the same box' },
          { code: 'unique keys', analog: 'one box per number, never two' },
        ],
        text: {
          child:
            'A dictionary in code is like the wall of little mailboxes at a post office. Your key has a number on it, and it opens exactly one box. You walk straight to your box and find whatever is inside, without opening anyone else’s.',
          highschool:
            'A wall of PO boxes is a hash map: box numbers are keys, contents are values. Each number opens exactly one box, so a key can never point at two different values, and putting new mail in a box you already use replaces what a lookup will find there. Straight to your box, no searching the wall.',
          undergrad:
            'PO boxes stress the key-uniqueness invariant: one box per number, so inserting under an existing key overwrites its value rather than adding a duplicate. The wall itself is the fixed bucket array; the postal clerk deciding which box a letter belongs in is the hash function, and a clerk who assigns many letters to the same box is a bad hash function turning your O(1) wall into an O(n) pile.',
          adult:
            'A hash map is a wall of post office boxes: each numbered key opens exactly one box with the latest contents inside. Software uses this to keep one authoritative slot per customer, account, or session. The one-box-per-key rule matters: saving under an existing key replaces the old contents, which is precisely what you want for "current address" and a bug if you wanted history.',
        },
      },
    ],
  },
  {
    id: 'stack',
    name: 'Stacks',
    tagline: 'Last in, first out: you can only add or remove at the top.',
    analogies: [
      {
        id: 'stack--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The spring-loaded plate dispenser',
        maps: [
          { code: 'push', analog: 'putting a clean plate on top' },
          { code: 'pop', analog: 'taking the top plate' },
          { code: 'peek', analog: 'looking at the top plate without taking it' },
          { code: 'LIFO order', analog: 'the last plate added is the first one taken' },
        ],
        text: {
          child:
            'A stack is like the pile of plates in a cafeteria. New clean plates go on top, and everyone takes from the top too. The plate you get is always the newest one on the pile; the plate at the bottom might sit there all day.',
          highschool:
            'A stack is the cafeteria plate dispenser: add on top (push), take from the top (pop), glance at the top plate without taking it (peek). The last plate placed is the first one taken: LIFO, last in, first out. Reaching into the middle is not allowed, and that restriction is the entire point of the structure.',
          undergrad:
            'The plate dispenser is the LIFO contract: push, pop, and peek at one end only, O(1) each. What makes it foundational is what it models: the call stack (each function call is a plate pushed; returning pops it), undo history, matching brackets, depth-first search. Pop an empty dispenser and you have stack underflow; a stack overflow is plates past the ceiling, which is exactly what unbounded recursion does to the call stack.',
          adult:
            'A stack is a spring-loaded plate pile: add and take only from the top, so the newest item always comes off first. Your Undo button works this way (each action is a plate; Undo takes the top one), and so does the browser Back button. The famous "stack overflow" error is the plate pile hitting the ceiling.',
        },
      },
      {
        id: 'stack--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'A stack of pancakes',
        maps: [
          { code: 'push', analog: 'a fresh pancake lands on top' },
          { code: 'pop', analog: 'the top pancake gets eaten first' },
          { code: 'bottom of stack', analog: 'the first pancake, eaten last' },
          { code: 'reversal', analog: 'stack order is cooking order reversed' },
        ],
        text: {
          child:
            'A stack is like pancakes. Each new pancake lands on top of the pile, and when you eat, you take from the top. So the very first pancake made ends up eaten last, all the way at the bottom, and the newest one goes first.',
          highschool:
            'A pancake pile is a stack: cook one, place it on top (push); eat from the top (pop). Notice the order flip: pancakes are eaten in reverse cooking order. That reversal is the stack’s signature move, and it is exactly how code reverses things or backtracks out of nested steps in the opposite order it entered them.',
          undergrad:
            'Pancakes make the reversal property visceral: push a, b, c and pop c, b, a. That is why a stack reverses sequences, why nested structures unwind correctly (the most recent open must close first, matching parentheses), and why DFS uses one: the most recently discovered branch is explored first. The first pancake waiting at the bottom is your deepest stack frame, still there until everything above it unwinds.',
          adult:
            'A stack is a pancake pile: newest on top, eaten first, so the order always comes out reversed. Software uses that flip deliberately: to undo actions most-recent-first, and to back out of nested tasks in the opposite order it entered them, like unpacking boxes you packed inside other boxes.',
        },
      },
      {
        id: 'stack--board-games',
        domain: 'board-games',
        domainLabel: 'Board games',
        title: 'The discard pile',
        maps: [
          { code: 'push', analog: 'playing a card onto the pile' },
          { code: 'pop', analog: 'taking back the top card' },
          { code: 'peek', analog: 'checking the top card to see what is in play' },
          { code: 'stack as history', analog: 'the pile records the game in order, newest on top' },
        ],
        text: {
          child:
            'A stack is like the discard pile in a card game. Every card played goes on top, face up. You can always see the newest card, and if a rule says "take back the last card played", it comes off the top. The cards underneath stay hidden in order.',
          highschool:
            'A discard pile is a stack: cards go on top (push), the top card is visible (peek), and "undo the last play" takes it back off the top (pop). Dig deeper and the pile replays the game in reverse, newest first: the pile is a history where only the most recent entry is directly reachable.',
          undergrad:
            'The discard pile frames a stack as an append-only history with access to the latest entry: peek is "what is the current state on top", pop is "revert the most recent event." That is the mental model behind undo stacks and interpreter operand stacks alike, and flipping through the pile from the top is traversal in reverse chronological order, exactly how you walk a call stack in a debugger, newest frame first.',
          adult:
            'A stack is a discard pile: everything played lands on top, and only the top is directly reachable. Software keeps piles like this as history: the top card is "the latest state", and reverting means lifting cards off one at a time, newest first. It is why Undo walks backward through your edits in exactly the reverse order you made them.',
        },
      },
    ],
  },
  {
    id: 'queue',
    name: 'Queues',
    tagline: 'First in, first out: add at the back, serve from the front.',
    analogies: [
      {
        id: 'queue--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'The bakery take-a-number line',
        maps: [
          { code: 'enqueue', analog: 'pulling a ticket and joining the wait' },
          { code: 'dequeue', analog: '"Now serving 47!"' },
          { code: 'FIFO order', analog: 'first ticket pulled, first customer served' },
          { code: 'queue length', analog: 'how many numbers ahead of yours' },
        ],
        text: {
          child:
            'A queue is like the ticket machine at a bakery. You pull a number and wait. The counter calls the numbers in order, so whoever came first gets served first. No cutting: your turn comes exactly when your number is called.',
          highschool:
            'A queue is the bakery’s take-a-number system: joining is enqueue, "now serving 47" is dequeue, and the rule is FIFO, first in, first out. Fairness is the whole design: order of arrival is order of service, the opposite of a stack, where the newest arrival goes first.',
          undergrad:
            'The ticket machine is FIFO with O(1) enqueue at the tail and dequeue at the head, and it is the backbone of anything that must preserve arrival order: BFS frontiers, print jobs, message queues between services. The number display is the head pointer; the roll of blank tickets is the tail. When producers pull tickets faster than the counter serves, the growing gap is exactly backpressure, and real systems must decide whether to add staff, cap the line, or start turning people away.',
          adult:
            'A queue is a take-a-number line: first come, first served, no exceptions. Software queues are everywhere: support tickets, print jobs, orders waiting for the warehouse. When a site says "you are in a waiting room", that is literally this line, and the length of it, not the speed of any one worker, is usually why things feel slow.',
        },
      },
      {
        id: 'queue--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'The airport security line',
        maps: [
          { code: 'enqueue', analog: 'joining the back of the line' },
          { code: 'dequeue', analog: 'the person at the front goes through' },
          { code: 'multiple consumers', analog: 'several open lanes serving one line' },
          { code: 'priority queue', analog: 'the fast-track lane that jumps ahead' },
        ],
        text: {
          child:
            'A queue is like the line at the airport. You join at the back, shuffle forward, and go through when you reach the front. Nobody skips ahead, and the person who has waited longest is always the next one through.',
          highschool:
            'The airport security line is a queue: join at the back (enqueue), pass through at the front (dequeue), strictly in arrival order. Airports also show the variations: several lanes serving one line is multiple workers draining one queue, and the fast-track lane that lets some travelers jump ahead is a priority queue, where order is by importance instead of arrival.',
          undergrad:
            'One line feeding several lanes is the single-queue/multi-consumer pattern, provably better for average wait than one line per lane, which is why systems put one queue in front of many workers. Fast track is a priority queue: dequeue by priority, not arrival, with the same starvation risk the economy line feels when fast track never empties. And the rope maze capping the line’s length is a bounded queue: when it is full, new arrivals are turned away, the airport version of load shedding.',
          adult:
            'A queue is an airport security line: first come, first served, with the familiar refinements. Several lanes serving one line is how systems share work fairly among many workers, and the fast-track lane is "priority" service, with the same side effect you have felt in person: if fast track never empties, the regular line barely moves.',
        },
      },
      {
        id: 'queue--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'A one-lane bridge',
        maps: [
          { code: 'enqueue', analog: 'a car arriving at the bridge' },
          { code: 'dequeue', analog: 'a car crossing and leaving' },
          { code: 'throughput', analog: 'cars per minute across the bridge' },
          { code: 'queue growth', analog: 'the line growing when arrivals beat crossings' },
        ],
        text: {
          child:
            'A queue is like cars waiting at a one-lane bridge. Cars line up in the order they arrive and cross one at a time. If cars show up faster than they can cross, the line just gets longer and longer down the road.',
          highschool:
            'A one-lane bridge makes a queue out of traffic: arrival order is crossing order, one at a time. The interesting part is the math of the line: if cars arrive faster than the bridge lets them across, the line grows without limit. That balance between arrival rate and service rate decides everything about how long you wait.',
          undergrad:
            'The bridge is a queue with a service rate, which is where queueing intuition starts: if arrival rate exceeds service rate, queue length grows without bound, and no fairness rule fixes it. Latency (your wait) versus throughput (cars per minute) separate cleanly here, and the practical options are the real systems options: widen the bridge (scale the worker), meter arrivals (rate limiting), or cap the line and turn cars away (bounded queue, load shedding).',
          adult:
            'A queue is a one-lane bridge: work crosses in arrival order, one at a time. The lesson every operations team learns is visible from the roadside: when work arrives faster than it crosses, the line grows without limit, and waits explode. Fixing that means a wider bridge or fewer arrivals; reshuffling the line accomplishes nothing.',
        },
      },
    ],
  },
  {
    id: 'tree',
    name: 'Trees',
    tagline: 'A branching hierarchy: one root, nodes with children, no cycles.',
    analogies: [
      {
        id: 'tree--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'The company org chart',
        maps: [
          { code: 'root', analog: 'the CEO' },
          { code: 'parent / child', analog: 'manager / direct report' },
          { code: 'leaf', analog: 'an employee with no reports' },
          { code: 'subtree', analog: 'a department under one manager' },
        ],
        text: {
          child:
            'A tree in code is like a company chart. The big boss is at the top, some managers work under the boss, and workers work under the managers. Everyone has exactly one boss above them, and the chart never loops back around.',
          highschool:
            'An org chart is a tree: the CEO is the root, each manager’s reports are child nodes, and employees with no reports are leaves. Every person has exactly one manager (one parent), which is what makes it a tree rather than a tangled web. A whole department under one manager is a subtree: the same shape, one level down.',
          undergrad:
            'The org chart encodes the tree invariants: single root, unique parent per node, no cycles, and n nodes with n-1 edges. Recursive structure is the payoff: a department is itself a tree, so anything you compute for the company (head count, budget) is "combine the answers from each subtree", the template for every recursive tree algorithm. Depth is the chain of command; a "flat organization" is literally a shallow, wide tree, and reorganizing a department is an O(1) subtree reattachment.',
          adult:
            'A tree is an org chart: one person at the top, everyone else reporting upward through exactly one manager. Software organizes almost everything this way: folders inside folders, menu inside menu, the sections of this very page. The shape matters because questions like "how big is this department?" can be answered by asking each branch to tally itself.',
        },
      },
      {
        id: 'tree--sports',
        domain: 'sports',
        domainLabel: 'Sports',
        title: 'A tournament bracket',
        maps: [
          { code: 'leaf nodes', analog: 'the first-round teams' },
          { code: 'internal node', analog: 'a match between two winners' },
          { code: 'root', analog: 'the final' },
          { code: 'tree height', analog: 'number of rounds' },
        ],
        text: {
          child:
            'A tree in code can look like a tournament chart. All the teams start on one side, winners meet winners, and the lines join up match by match until one final game at the end. Follow any team’s line and it leads straight to the final.',
          highschool:
            'A tournament bracket is a binary tree drawn sideways: first-round teams are the leaves, each match is a node joining two branches, and the final is the root. Sixteen teams need only four rounds, because each round halves the field. That halving is the tree superpower: doubling the teams adds just one more round.',
          undergrad:
            'The bracket is a complete binary tree with n leaves, n-1 internal matches, and height log2(n): 16 teams, 4 rounds; 1024 teams, 10 rounds. That is the logarithmic scaling that makes balanced trees fast, and why a champion is decided in log n rounds rather than round-robin’s O(n²) games. The bracket also mirrors divide-and-conquer bottom-up: pairwise merges up to a single result is the exact shape of merge sort’s merge tree.',
          adult:
            'A tree is a tournament bracket: pairs feed into matches, matches feed upward, one final at the top. The striking property is how flat it stays: 1,024 teams need only ten rounds to crown a champion. Software leans on that same trick, organizing data so that finding anything takes "a few rounds", not a march through every item.',
        },
      },
      {
        id: 'tree--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'City, district, street, house',
        maps: [
          { code: 'root', analog: 'the city' },
          { code: 'internal nodes', analog: 'districts and streets' },
          { code: 'leaf', analog: 'a single house' },
          { code: 'path from root', analog: 'the full address, line by line' },
        ],
        text: {
          child:
            'A tree in code is like how a city is organized. The city has neighborhoods, each neighborhood has streets, and each street has houses. To find one house you narrow it down step by step: which neighborhood, which street, which number.',
          highschool:
            'A city is a tree: city at the root, districts as branches, streets below them, houses as leaves. An address is just the path from the root written out: city, district, street, number. Computers store files the same way, which is why a file’s location reads like an address: folder, subfolder, file.',
          undergrad:
            'The city hierarchy shows why tree search is fast: each level of the address rules out everything else at that level, so locating a house inspects one path, not the whole city. A full address is the root-to-leaf path (exactly a filesystem path), renaming a district instantly "moves" every house under it (subtree operations touch one node), and two houses on different streets can share a number without conflict: names need only be unique among siblings.',
          adult:
            'A tree is a city’s layout: districts contain streets, streets contain houses, and an address narrows things down level by level. Your computer’s folders and every website’s menus work identically. The design pays off because each step of an address eliminates the rest of the city, so finding one item never means searching all of it.',
        },
      },
    ],
  },
];
