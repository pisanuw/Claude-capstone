import type { Concept } from '../types';

export const structures2: Concept[] = [
  {
    id: 'linked-list',
    name: 'Linked lists',
    tagline: 'Each element knows only where the next one is.',
    analogies: [
      {
        id: 'linked-list--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'Car by car down the train',
        maps: [
          { code: 'node', analog: 'one train car' },
          { code: 'next pointer', analog: 'the coupler to the following car' },
          { code: 'head', analog: 'the locomotive up front' },
          { code: 'insert in the middle', analog: 're-couple two links, no other car moves' },
        ],
        text: {
          child:
            'Think of a long train. Each car only holds hands with the car right behind it. To visit car 7, you walk through cars 1, 2, 3, all the way there. But adding a new car in the middle is easy: unhook one link, hook in the new car, done! No car has to move at all.',
          highschool:
            'A linked list works like a coupled train. Each car is a node (one piece of data) whose coupler is a pointer (the address of the next node). There is no car number 7 you can jump to: you start at the engine and walk through six cars first. The payoff comes when you insert: adding a car mid-train means re-coupling two links, while an array is a parking lot where inserting one car means shuffling every car behind the spot.',
          undergrad:
            'The train makes the cost model exact. Indexing is O(n): reaching car k means dereferencing k next pointers from the head, while an array\'s contiguous layout computes any address in O(1). Insertion beside a car you already stand in is O(1): aim the new car\'s coupler at the old successor first, then re-aim the current coupler at the new car. Reverse those two writes and you hit the classic relink bug: you overwrite your only reference to the rest of the train, and cars 8 through 40 are left on the track with no way to reach them. A doubly linked list adds couplers at both ends of each car, buying backward traversal for one extra pointer per node.',
          adult:
            'Data stored as a linked list behaves like a coupled train: each record knows only where the next one sits. Mid-sequence edits are cheap (splice one link, no mass reshuffling), which is why text editors and playlists often favor this shape. The cost is position lookups: finding item 7,000 means walking 6,999 links, so a product that jumps around by position feels slower as the data grows. The planning takeaway: this design trades fast browsing for fast editing, and choosing it well means knowing which one your users actually do more.',
        },
      },
      {
        id: 'linked-list--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'Each clue hides the next',
        maps: [
          { code: 'node', analog: 'a clue slip in its hiding spot' },
          { code: 'next pointer', analog: 'the directions to the next clue' },
          { code: 'head', analog: 'the first clue handed to you' },
          { code: 'corrupted pointer', analog: 'a lost clue orphans every clue after it' },
        ],
        text: {
          child:
            'You are on a scavenger hunt. The first clue is in your hand, and it tells you only one thing: where the next clue hides. Want clue 5 right now? Too bad! Only clue 4 knows where it is. And if the wind steals one clue, every clue after it just sits there, hidden forever. Follow the chain, one hop at a time!',
          highschool:
            'A linked list is a scavenger hunt: each node (one clue) stores its data plus a reference (directions to where the next clue hides). There is no master map, so access is sequential: reaching clue 5 costs four hops, always. The last clue points nowhere (null), which is how you know the hunt is over. The sharp part: lose or garble a single clue, and clues 6 through 20 still exist, sitting in their hiding spots, but nobody can ever reach them again.',
          undergrad:
            'The hunt is a singly linked list with reachability made literal. Random access is O(n) because the only path to node k is k pointer dereferences from the head; no arithmetic can compute where clue 5 hides the way base + index * size does for an array. Null is the final clue\'s \'points nowhere\', the terminator your loop tests. The orphaned tail is the deep lesson: overwrite one next pointer and every downstream node becomes unreachable. In C that is a memory leak (the slips still occupy their hiding spots); in a garbage-collected language the collector reclaims them, because reachability from a root is the definition of alive. Lose the head and you lose the entire hunt.',
          adult:
            'Some data is stored like a scavenger hunt: each record contains directions to the next one, and there is no master index. The practical consequence: you can only read it in order, so \'show me item 5,000\' means 5,000 hops. The scarier consequence is failure: corrupt one set of directions and everything after it becomes invisible. The records still sit on disk, storage bills and all, but no report will ever find them. When engineers insist on careful review for code that rewires these links, this is what they are protecting against.',
        },
      },
      {
        id: 'linked-list--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'Carts on the tow line',
        maps: [
          { code: 'node', analog: 'one cart in the tow line' },
          { code: 'next pointer', analog: 'the hitch to the cart behind it' },
          { code: 'O(1) insertion', analog: 'two hitch clicks once you stand there' },
          { code: 'O(n) search', analog: 'walking the line to find the right cart' },
        ],
        text: {
          child:
            'A little tug in a factory pulls a long line of carts, each one hitched to the cart behind it. Want to add a new cart in the middle? Easy: unhitch one spot, hitch the new cart in, click click, done. But if the parts you need are somewhere in cart 30, you walk past 29 carts to get there. Strong legs help!',
          highschool:
            'A factory tow line is a linked list on wheels: each cart is a node, each hitch a pointer to the next cart. Standing beside a cart, inserting a new one is constant time (two hitch clicks, whether the line has 5 carts or 5,000). But getting to the right cart is linear time: you walk the line, checking carts one by one. That split is the whole story of linked lists: the edit is cheap, the trip to the edit is not.',
          undergrad:
            'The tow line states the fine print that \'linked lists insert in O(1)\' usually omits: the splice is O(1) only once you hold a pointer to the predecessor cart, and reaching it is O(n). If every insert starts with a search, the real cost is O(n), the same asymptotics as shifting an array\'s tail. Linked lists win when you already have the position: an iterator you kept, an LRU cache moving a known cart to the front, or splice, which re-hitches an entire sub-line of 10,000 carts in constant time because only two hitches change. The walking itself is what hurts: each cart is a separate allocation, so a modern CPU pays a cache miss on nearly every hop.',
          adult:
            'A warehouse tug pulls 5,000 hitched carts. Rearranging the line is cheap: a worker at the right spot swaps two hitches and a new cart is in, no matter how long the line. Getting the worker to that spot is the expensive part, because the only way there is walking the line. The business lesson: features that edit in place stay fast as data grows, while features that must first hunt for their spot slow down in step with volume. \'The update is instant, the lookup is the bottleneck\' describes exactly this shape.',
        },
      },
    ],
  },
  {
    id: 'set',
    name: 'Sets',
    tagline: 'A collection where each thing appears at most once, and membership is the question.',
    analogies: [
      {
        id: 'set--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'The chess club roster',
        maps: [
          { code: 'the set', analog: 'the chess club roster' },
          { code: 'add, duplicate ignored', analog: 'signing up twice still counts once' },
          { code: 'membership test', analog: 'is Ana a member? one glance at the roster' },
          { code: 'union and intersection', analog: 'merged rosters, or students in both clubs' },
        ],
        text: {
          child:
            'The chess club has a roster with every member\'s name written once. If Ana signs up three times, she is still just one member, the roster does not grow. Want to know if Ben is in the club? Look for his name: yes or no, done. And if chess club and art club throw a party together, you just combine the two rosters into one big list of friends!',
          highschool:
            'A set works like a club roster: each name appears exactly once, and signing up twice changes nothing. The two operations that matter are membership (is Ana on the roster?) and combining rosters: union merges chess club and art club into everyone in either, while intersection lists only the students in both. The implication: when your data is really a roster question, storing it as a plain list forces you to scan for duplicates yourself, and a set does that bookkeeping for free.',
          undergrad:
            'The roster names the set contract: insertion is idempotent (add Ana twice, the set is unchanged), membership is the primary query, and iteration order is incidental. A hash set answers \'is Ana a member?\' in O(1) expected time, versus O(n) for scanning a list; a balanced-tree set gives O(log n) plus sorted traversal. Union and intersection are merged rosters and the students in both clubs, the same algebra you saw in discrete math. The classic bug is a broken identity contract: if two Ana records hash or compare as different, the roster carries her twice, and if her record mutates after insertion, hashing can no longer find her at all.',
          adult:
            'Club rosters are the business version of a set: each person appears once, however many times they sign up. Products lean on that guarantee constantly: one welcome email per customer, one vote per user, one seat per invitee. When a team tracks those things in a plain list instead, the same customer slips in twice, and you get the duplicate email that makes a company look careless. When the question is \'is this person already in?\', ask for a set: exactly once is the feature.',
        },
      },
      {
        id: 'set--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'The loyalty list and the receipt pile',
        maps: [
          { code: 'the set', analog: 'the store\'s loyalty membership list' },
          { code: 'a list, duplicates allowed', analog: 'the receipt pile, same shopper on many slips' },
          { code: 'membership check', analog: 'is this card on file? instant answer at the till' },
          { code: 'adding an existing element', analog: 're-enrolling changes nothing, one entry each' },
        ],
        text: {
          child:
            'The store keeps a special list of loyalty members. Sign up once and you are on it. Sign up again? Nothing happens, you are already there. The cashier can check the list super fast: are you a member, yes or no? The pile of receipts is different: buy candy five times and the pile remembers you five times. The member list only cares about one thing: are you on it!',
          highschool:
            'A store\'s loyalty program is a set: enroll twice and you still have exactly one membership. Its receipt pile is a list (an ordered collection that happily records duplicates), so one shopper can appear on 40 slips. The set exists for one query, membership: the cashier checks \'is this card on file?\' in an instant instead of digging through every receipt. The lesson: choose the structure by the question you ask. If the question is \'has this customer been here at all?\', a set answers it; a list makes you search the whole pile.',
          undergrad:
            'The till exposes the core tradeoff between sets and sequences. The loyalty list is a hash set: enrolling twice leaves exactly one entry, and \'is this card on file?\' runs in O(1) expected time. The receipt pile is a sequence, or if you ignore order, a multiset: it preserves duplicates and multiplicity, so answering membership means an O(n) scan. Deduplicating a list by pouring it into a set is the standard idiom, but it is lossy: the set forgets that one shopper produced 40 receipts and forgets which came first. If the query is \'how many visits?\', you need a bag or a count map; a set can only ever say yes or no.',
          adult:
            'Two records live at every checkout: the loyalty membership list and the receipt pile. The membership list holds each customer exactly once, so the question \'is this person a member?\' gets an instant, reliable answer. The receipt pile records the same person again and again, which is fine for accounting and useless for membership. Products break when teams confuse the two: a marketing list built from receipts sends one customer six identical coupons. The practical rule: when \'already have them?\' is the question, keep a membership list, not a pile.',
        },
      },
      {
        id: 'set--gardening',
        domain: 'gardening',
        domainLabel: 'Gardening',
        title: 'Species in the garden bed',
        maps: [
          { code: 'the set', analog: 'the species growing in your bed' },
          { code: 'adding a duplicate', analog: 'a second basil, still one species' },
          { code: 'membership test', analog: 'do I already grow this?' },
          { code: 'intersection', analog: 'species both gardeners grow' },
        ],
        text: {
          child:
            'Look at a garden bed and count the kinds of plants, not the plants. Three basils, two tomatoes, one pumpkin? That is just three kinds: basil, tomato, pumpkin. Planting a fourth basil does not add a new kind. When a friend hands you a seed packet, you ask the fun question: do I already grow this? If not, your garden gets a brand new kind. Hooray for pumpkin number one!',
          highschool:
            'Gardeners track two different things: individual plants and species. The species in a bed form a set (a collection with no duplicates), because planting a second basil changes the plant count but not the species list. The natural set operations show up on their own: membership is \'do I already grow rosemary?\', and intersection (the elements two sets share) is the species you and a neighboring gardener both grow, which tells you exactly whose seeds are worth trading. Same bed, two views: the list of plants grows all summer, the set of species barely moves.',
          undergrad:
            'Formally, the bed is a multiset of plants and the species list is its projection into a set: apply \'what species is this?\' to every plant and keep the distinct results, exactly what SQL\'s SELECT DISTINCT or Python\'s set(map(species, bed)) computes. Intersection is the species two gardeners share; the difference set is what only you grow, so the trade offer is A minus B against B minus A. The design landmine is element equality: a set is only as correct as its notion of \'the same\'. If \'Genovese basil\' and \'basil\' compare as different, your five-species bed reports six, and every union or intersection built on it inherits the error.',
          adult:
            'A garden bed holds many plants but only a handful of species, and that distinction runs through every product. Inventory is the plants; your category list or filter menu is the species. Customers notice when the species list is managed like the plant pile: a dropdown offering both \'Herbs\' and \'herbs\', a report counting one supplier twice. When the question is \'do we already carry this kind?\' or \'which kinds do we and a partner share?\', that list should be a set: one entry per kind, enforced by the software, so the mess never appears.',
        },
      },
    ],
  },
  {
    id: 'heap-priority-queue',
    name: 'Heaps and priority queues',
    tagline: 'Always serve the most urgent item next, whatever order things arrived.',
    analogies: [
      {
        id: 'heap-priority-queue--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Express mail leaves first',
        maps: [
          { code: 'priority queue', analog: 'the outgoing mail bin' },
          { code: 'priority', analog: 'the service class on the label' },
          { code: 'pop the min/max', analog: 'the clerk grabs the most urgent parcel' },
          { code: 'no total order kept', analog: 'the bin stays messy below the top' },
        ],
        text: {
          child:
            'The outgoing mail bin is not first come, first served. Express packages leave before regular letters, even ones that arrived this morning. The clerk does not sort the whole bin; they just always know which package is the most urgent one, grab it, and send it flying.',
          highschool:
            'A priority queue is the outgoing mail bin: items leave by urgency, not arrival order, which is the opposite of a regular queue. The clever part is what the clerk does not do: fully sort the bin. Keeping thousands of parcels perfectly ordered would waste time nobody has; the bin only needs to be organized enough that the most urgent parcel is always on top.',
          undergrad:
            'The mail bin is the heap bargain in one image: you need repeated extract-min, not a total order, so maintaining full sortedness (O(n log n) up front, O(n) per insert to keep) is wasted work. A binary heap keeps just enough structure, the heap property, parent more urgent than children, to make insert and extract-min O(log n) each, with the rest of the bin happily unordered. That is why heapsort exists, why Dijkstra and A* reach for a heap for their frontier, and why "almost sorted" is not a bug in the bin, it is the entire design.',
          adult:
            'A priority queue is the outgoing mail bin: express leaves before standard, whatever arrived first. Software triages work the same way, urgent jobs jumping the line, and the efficiency insight carries over from the clerk: never fully sort the backlog, just always know the single most urgent item. Systems that insist on perfectly ordering their to-do list spend their day sorting instead of shipping.',
        },
      },
      {
        id: 'heap-priority-queue--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'The standby upgrade list',
        maps: [
          { code: 'priority', analog: 'status tier plus fare class' },
          { code: 'insert', analog: 'a new elite flyer joins the list mid-boarding' },
          { code: 'extract-max', analog: 'the agent calls the top name' },
          { code: 'reprioritize', analog: 'a status match bumps someone upward' },
        ],
        text: {
          child:
            'The upgrade list at the gate is not about who asked first. It is about points: the traveler with the most points is called first, and a new traveler with tons of points can appear at the last minute and jump right to the top. The gate agent only ever needs to know one thing: who is first right now.',
          highschool:
            'The standby upgrade list is a priority queue: position comes from status, not arrival time, and it changes live, since a higher-status flyer can join at any moment and leapfrog everyone. Notice what the agent actually needs: not the full ranking of forty names, just the current top. Data structures built for "give me the best one now" exploit exactly that narrower question.',
          undergrad:
            'The upgrade list runs on heap operations: insert when a flyer joins (O(log n), they bubble up past lower tiers), extract-max when the agent calls a name, and increase-key when a mid-wait status match bumps someone, the same operation Dijkstra performs when it finds a shorter path. The list also shows why ties need a policy: two flyers of equal status are ordered by check-in time, which is priority-plus-FIFO tiebreak, and forgetting the tiebreak is how priority systems end up unfair and, in code, nondeterministic.',
          adult:
            'The airline upgrade list is a priority queue in the wild: ranked by status, updated live, and only the top matters at any moment. Businesses run these everywhere, incident queues, hospital triage, ad auctions. The design detail worth stealing is the tiebreak: equal priorities fall back to arrival order, because a priority system with no tiebreak rule turns into an argument at the gate.',
        },
      },
      {
        id: 'heap-priority-queue--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The pass sends the dying dish',
        maps: [
          { code: 'priority', analog: 'how close a plate is to dying under the lamp' },
          { code: 'extract-min', analog: 'the expeditor sends the most at-risk plate' },
          { code: 'priorities change', analog: 'a souffle deflates and rockets up the ranking' },
          { code: 'starvation', analog: 'the stew that never quite makes it out' },
        ],
        text: {
          child:
            'At the kitchen counter where finished food waits, the chef in charge does not send plates in cooking order. They send whichever plate will be ruined soonest! Melting ice cream beats a sturdy sandwich, always. Every few seconds they glance across the pass, find the most in-danger dish, and out it goes.',
          highschool:
            'The expeditor at the pass runs a priority queue: plates leave by urgency (how close each is to dying under the heat lamp), not by ticket order. Priorities even change in place: a souffle starting to sink jumps the entire queue. The risk of any urgency-only system shows up here too: a hardy stew can sit at the pass forever because something more fragile always outranks it. That is called starvation, and kitchens fix it the way schedulers do, by escalating priority with waiting time.',
          undergrad:
            'The pass is a priority queue with dynamic priorities: each plate’s key is time-to-ruin, extract-min sends the most at-risk plate, and the deflating souffle is decrease-key. The stew that never ships is starvation, the classic failure of pure priority scheduling, and the kitchen’s fix, urgency grows with waiting time, is aging, exactly what OS schedulers do. One more honest mapping: the expeditor scans a small pass in O(n) and wins; heaps earn their O(log n) only when n stops being twelve plates, the constant-factors lesson in one countertop.',
          adult:
            'A restaurant pass is priority scheduling you can watch: the most at-risk plate ships first, rankings shift live, and the sturdy stew quietly waits forever unless someone notices, the failure mode every priority-driven backlog has. The fix worth copying is the kitchen’s: urgency automatically rises with waiting time, so nothing starves. If your ticket system lacks that rule, your stew is out there somewhere, cold.',
        },
      },
    ],
  },
  {
    id: 'hashing',
    name: 'Hashing',
    tagline: 'Boiling any input down to a short fingerprint that is cheap to compare.',
    analogies: [
      {
        id: 'hashing--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'A seal computed from the letter',
        maps: [
          { code: 'hash function', analog: 'the rule that turns the letter into a seal pattern' },
          { code: 'digest', analog: 'the seal pattern itself, tiny next to the letter' },
          { code: 'integrity check', analog: 'recompute at arrival; a mismatch means tampering' },
          { code: 'avalanche effect', analog: 'change one word, the whole seal changes' },
        ],
        text: {
          child:
            'Imagine a magic wax seal for letters. The seal pattern comes from the letter itself: change even one word inside and the pattern comes out totally different. The person receiving the letter makes the seal again from what they got. Same pattern? The letter arrived untouched. Different? Someone fiddled with it on the way!',
          highschool:
            'A checksum works like a seal computed from the letter’s own words: a fixed little pattern (the digest) derived from the whole content. The receiver recomputes it; a mismatch proves the content changed, and the tiniest edit flips the seal completely, so tampering cannot hide. That is what your computer does when it verifies a download: hash the file, compare the seals.',
          undergrad:
            'The content-derived seal is a cryptographic hash: deterministic, fixed-size output, cheap to compute, and avalanche-complete (one flipped bit scrambles the digest). Integrity checking is recompute-and-compare, and the security requirements name themselves at the mailbox: preimage resistance (the seal must not reveal the letter) and collision resistance (a forger must not craft a different letter with the same seal, which is why broken-collision MD5 is retired from signatures). Add a shared secret to the sealing rule and you have an HMAC: now a mismatch detects forgery, not just corruption.',
          adult:
            'Hashing gives any document a short fingerprint computed from its content: change a comma and the fingerprint changes completely. Systems verify downloads, detect corrupted files, and sign contracts by comparing fingerprints instead of documents. The everyday payoff is speed and the security payoff is tamper-evidence: nobody can alter the content and keep the seal matching, which is most of what "verified" means on a screen.',
        },
      },
      {
        id: 'hashing--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'The barcode stands in for the product',
        maps: [
          { code: 'hash value', analog: 'the short code standing in for the full item' },
          { code: 'fast comparison', analog: 'one beep instead of reading the label' },
          { code: 'collision', analog: 'two different products, one barcode: checkout chaos' },
          { code: 'uniform distribution', analog: 'codes spread out so scanners rarely confuse items' },
        ],
        text: {
          child:
            'A barcode is a tiny stand-in for a whole product. The scanner does not read the ingredients, the brand, and the weight; it reads one little code, beep, done. It only works because no two different products share a code. If ketchup and shampoo had the same barcode, checkout would be chaos!',
          highschool:
            'Hashing is the barcode move: replace something big (a product, a file, a password) with a short code that is fast to compare. One beep instead of reading the whole label is why hash-based lookups are fast. And the ketchup-shampoo disaster has a name: a collision, two different inputs producing the same code. Good hash functions make collisions absurdly unlikely; systems still plan for them, the way a cashier can always check the label.',
          undergrad:
            'The barcode is hashing as an equality shortcut: compare digests in O(1) instead of contents in O(n), accept a collision probability, keep a fallback comparison. That is literally how hash tables resolve buckets, how deduplication systems find candidate duplicates, and why "same hash" is evidence, not proof, until contents are checked. Distribution matters the same way shelf-stocking does: a hash that clusters codes (everything beeping as 000012) degrades lookups to linear scans, the bad-hash pathology behind hash-flooding denial-of-service attacks.',
          adult:
            'A hash is a barcode for data: a short code standing in for something big, so comparisons become a beep instead of a read-through. Deduplicating storage, spotting the same file twice, syncing only what changed: all barcode tricks. The one rule of the game is that different things must almost never share a code, and engineering "almost never" down to once-in-the-lifetime-of-the-universe is what the standard hash functions are for.',
        },
      },
      {
        id: 'hashing--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'The shelf is computed from the book',
        maps: [
          { code: 'hash function', analog: 'the rule: author’s initials decide the shelf' },
          { code: 'bucket', analog: 'one shelf holding everything that hashed there' },
          { code: 'bad hash function', analog: 'half the collection piled on the S shelf' },
          { code: 'rehashing', analog: 'new shelving rule, every book moves once' },
        ],
        text: {
          child:
            'This library has a trick: the book itself tells you its shelf. Authors starting with A or B go on shelf one, C or D on shelf two, and so on. Nobody searches the whole library; you compute the shelf from the name and walk straight there. The book’s own name is the map!',
          highschool:
            'Shelving by author initials is a hash function: a rule computed from the item that says exactly where it lives, so lookups skip searching entirely. The rule’s quality decides everything. Initials split books unevenly (the S shelf groans, the X shelf sits empty), and an overloaded shelf means slow searching within it. Computer hash functions are designed to spread items evenly, like a shelving rule that somehow fills every shelf equally.',
          undergrad:
            'The computed shelf is the mechanism inside every hash table: hash(item) names the bucket, lookup is O(1) plus a scan of that bucket, and the initials rule shows why distribution is the whole game: skew turns one bucket into an O(n) pile, which is the difference between a textbook hash table and a subtle performance bug. When the library adds shelves, the rule changes and every book’s computed location moves: that is rehashing, the cost consistent hashing was invented to dodge in distributed caches, where "every book moves" means terabytes.',
          adult:
            'One library trick explains a lot of computing: derive the shelf from the book itself, and finding anything means computing, not searching. Databases and caches place data this way at enormous scale. Two operational lessons come with it: a lopsided rule buries one shelf and slows everyone, and changing the rule moves every book at once, which is why re-organizing big data systems is scheduled like a renovation, not a Tuesday.',
        },
      },
    ],
  },
  {
    id: 'state-machine',
    name: 'State machines',
    tagline: 'Always in exactly one state, with fixed rules for which moves are allowed.',
    analogies: [
      {
        id: 'state-machine--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'A traffic light never improvises',
        maps: [
          { code: 'states', analog: 'red, yellow, green: exactly one lit' },
          { code: 'transitions', analog: 'green to yellow to red, never green straight to red' },
          { code: 'events', analog: 'the timer tick or the sensor under the asphalt' },
          { code: 'invalid transition', analog: 'red jumping to green with no pause: crashes' },
        ],
        text: {
          child:
            'A traffic light is always exactly one color, never two, never zero. And it changes by strict rules: green goes to yellow, yellow to red, red back to green. It never skips from green straight to red! The light cannot improvise, and that is the point: everyone can trust what happens next.',
          highschool:
            'A traffic light is a state machine: a fixed set of states (red, yellow, green), exactly one active at a time, and transitions allowed only along fixed edges, triggered by events like a timer or the car sensor in the asphalt. The forbidden moves matter most: green never jumps straight to red, because the in-between state is what makes the system safe. Software models order status, game phases, and connection states exactly this way.',
          undergrad:
            'The intersection is a finite state machine with the whole formalism visible: state set, alphabet of events (tick, sensor), a transition function, and the invariant of exactly one current state. Drawing it as a diagram makes illegal states unrepresentable, which is the design payoff: "pedestrian walk while cross-traffic green" simply has no edge into it. Two lights coordinating is a product machine, where the state space multiplies, and that explosion is why model checkers exist: to verify no reachable combined state is a collision.',
          adult:
            'A traffic light shows why engineers love state machines: at any instant the system is in exactly one known state, and only listed moves are possible, so "how did it get into this condition?" always has an answer. Orders, subscriptions, and claims processes are modeled this way on purpose: the forbidden transitions (refunded before paid) become impossible instead of merely discouraged. When a product feels predictable, a state machine is usually why.',
        },
      },
      {
        id: 'state-machine--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'You cannot do that this phase',
        maps: [
          { code: 'current state', analog: 'the phase printed on the turn tracker' },
          { code: 'allowed actions', analog: 'what the rules permit in this phase' },
          { code: 'transition', analog: '"end of draw phase, begin action phase"' },
          { code: 'guard condition', analog: 'you may enter the battle phase only if you attacked' },
        ],
        text: {
          child:
            'Lots of board games have turn phases: first you draw, then you play cards, then you discard. Try to play a card during the draw phase and everyone says "not yet!" The game is always in exactly one phase, and the rules list what you may do in each. The phases keep the game fair and easy to follow.',
          highschool:
            'Turn phases are a state machine: the game is always in exactly one phase, each phase permits certain actions, and phases change in a fixed order announced by an event ("draw phase ends"). "You cannot do that now" is the rulebook rejecting an illegal transition. Programs guard their behavior the same way: a video player in the buffering state ignores the play button, by rule, not by accident.',
          undergrad:
            'The turn tracker is explicit-state design: current phase as data, a table of allowed actions per state, transitions on events, and guards ("enter battle only if you attacked") as predicated edges. The alternative every gamer has suffered, rules scattered through the book as special cases, is exactly the boolean-flag soup state machines replace: isDrawing, hasPlayed, canDiscard drifting into contradictory combinations. Reify the phase into one enum and illegal combinations stop being representable, the same argument behind typestate and protocol state machines in APIs.',
          adult:
            'Board games stay playable because they are state machines: one phase at a time, legal moves listed per phase, transitions announced. Software that skips this discipline accumulates contradictory flags (approved but also draft, shipped but also canceled) that no one can untangle. When a team says they are "modeling the workflow as a state machine", they are writing the rulebook that makes those contradictions impossible.',
        },
      },
      {
        id: 'state-machine--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Dough moves one stage at a time',
        maps: [
          { code: 'states', analog: 'dry mix, kneaded, proofing, baked' },
          { code: 'transition action', analog: 'kneading, waiting, the oven' },
          { code: 'irreversible transition', analog: 'you cannot un-bake' },
          { code: 'state tells you what is possible', analog: 'proofed dough shapes; baked bread slices' },
        ],
        text: {
          child:
            'Bread is always in one stage: dry flour, kneaded dough, puffy risen dough, or baked loaf. Each stage has its own moves: you can shape risen dough, but you cannot shape a baked loaf, and you can never turn bread back into dough. Knowing the stage tells you exactly what you are allowed to do next!',
          highschool:
            'Dough is a state machine you can eat: distinct states (mix, kneaded, proofing, baked), transitions that take work or time, and rules about what each state allows. Two properties carry straight into software: some transitions are irreversible (baking, like sending an email), and the current state determines the legal operations (you slice bread, not batter). Well-built programs check the state first for exactly the baker’s reason.',
          undergrad:
            'The dough lifecycle motivates state machines beyond diagrams: state-dependent operations (shape() is valid in proofed, undefined in baked), irreversible edges that demand confirmation gates before crossing, and time-driven transitions (proofing completes on a timer, like session expiry). It also shows a modeling choice: over-proofed is best made an explicit state, not a flag on proofing, because failure states you name are failure states you can handle, the difference between a status enum and a pile of booleans.',
          adult:
            'Baking is a workflow with states, and the kitchen rules are the software rules: each stage permits certain actions, some transitions cannot be undone, and knowing the current stage answers "what can we do now?" Products manage documents, orders, and applications this way. The practical tip from the bakery: give the failure states real names (over-proofed, burnt), because a process that only names its happy path handles nothing else gracefully.',
        },
      },
    ],
  },
];
