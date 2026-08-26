import type { Concept } from '../types';

export const craft: Concept[] = [
  {
    id: 'debugging',
    name: 'Debugging',
    tagline: 'Locating a fault by systematically shrinking where it could be hiding.',
    analogies: [
      {
        id: 'debugging--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Shut valves until the leak confesses',
        maps: [
          { code: 'the bug', analog: 'the leak losing pressure somewhere' },
          { code: 'bisection', analog: 'close the midpoint valve, test each half' },
          { code: 'reproducing first', analog: 'confirm the gauge actually drops' },
          { code: 'random digging', analog: 'tearing up streets on a hunch' },
        ],
        text: {
          child:
            'Water is leaking somewhere under a long street, but where? Do not dig up the whole road! Close the valve in the middle: if the pressure still drops on the left half, the leak is there; if not, it is on the right. Keep halving, and a huge street shrinks to one small wet spot. Dig once, fix once!',
          highschool:
            'Utility crews find leaks by elimination: shut the midpoint valve, watch the gauge, and the half that still loses pressure contains the leak; repeat until the search area is one pipe joint. That is debugging’s core move, bisection, and it beats intuition precisely when the system is too big to inspect whole. Programmers do it across code (disable half the features), data (half the input file), and history (which change broke it?).',
          undergrad:
            'The valve hunt is the debugging method stated as procedure: reproduce first (confirm the gauge drops, because you cannot bisect a leak you cannot observe), then binary-search the fault space, O(log n) tests to isolate one joint among thousands, exactly what git bisect mechanizes over commit history. The discipline that makes halving valid is one-change-at-a-time: open two valves between tests and the gauge tells you nothing attributable. And the leak that stops whenever the inspector watches is the heisenbug, usually a timing or observation effect, maddening in pipes and race conditions alike.',
          adult:
            'Skilled troubleshooting looks like the water company’s: confirm the problem is real and repeatable, then halve the suspect area with each test until the fault has nowhere left to hide. It is dramatically cheaper than digging on hunches, and it is what experienced engineers are doing during a quiet hour that ends with "found it". The management-visible signs of the method: one change per test, notes on what each test ruled out, and no street torn up twice.',
        },
      },
      {
        id: 'debugging--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'Which station bends the part?',
        maps: [
          { code: 'the defect', analog: 'finished parts arriving bent' },
          { code: 'inspect mid-pipeline', analog: 'pull a part off the belt at station 5' },
          { code: 'one variable at a time', analog: 'change a single station per trial' },
          { code: 'heisenbug', analog: 'the flaw that vanishes when the inspector stands there' },
        ],
        text: {
          child:
            'Toys are coming off the line with bent arms, and there are twelve stations. Check a toy right in the middle of the line: arms still straight? Then the bending happens later. Bent already? It happened earlier. A few checks like that and you are standing at the exact guilty machine, instead of poking at all twelve!',
          highschool:
            'Factory fault-finding is debugging on wheels: sample the product mid-line to learn whether the defect exists yet, halving the suspect stations each time, then adjust one thing at a time so the fix that works is identifiable. The maddening special case has a name in software: the defect that never appears while the inspector watches (a heisenbug), usually because watching changes timing, on the line and in code alike.',
          undergrad:
            'The assembly line is a computation with observable intermediate state, which is what makes bisection work: asserting "arms straight at station 5" is checking an invariant mid-pipeline, exactly what print statements, debugger breakpoints, and data validation between stages do. The controlled-experiment rules transfer verbatim: hold inputs fixed (same batch of parts: a reproducer), vary one factor per trial, and record outcomes: change two stations at once and a good result is unattributable. The inspector-effect defect is the observer-effect bug: instrumentation altering timing, the reason race conditions hide from debuggers and appear in production.',
          adult:
            'When a factory ships bent parts, nobody rebuilds all twelve stations: they sample mid-line to find where straight becomes bent, then adjust one station per trial. Software troubleshooting is the same industrial method, and its opposite, changing five things and hoping, is how problems get "fixed" without anyone knowing why, then return. The audit trail matters for the same reason as on the factory floor: what was checked, what was ruled out, what single change resolved it.',
        },
      },
      {
        id: 'debugging--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'Accuse like you mean to learn',
        maps: [
          { code: 'hypothesis', analog: 'a guess about culprit, room, and weapon' },
          { code: 'experiment', analog: 'the question that eliminates the most' },
          { code: 'evidence updates beliefs', analog: 'cards shown cross options off' },
          { code: 'wild guessing', analog: 'accusations that waste turns and teach nothing' },
        ],
        text: {
          child:
            'In a mystery game, the winners are not lucky guessers: they ask sneaky questions where every answer crosses something off the list. Wrong guesses are fine, as long as they teach you something! Guess wildly and you learn nothing; guess cleverly and even a "no" shrinks the mystery. Bug hunting works exactly like that.',
          highschool:
            'Deduction games teach the debugging loop: form a hypothesis (the culprit, the room, the weapon), run the test that eliminates the most possibilities, update on the evidence, repeat. A wrong hypothesis that eliminates half the options is progress; a wild accusation that teaches nothing is a wasted turn. Debugging a program is the same game against the code: each experiment should be chosen for what its outcome will rule out.',
          undergrad:
            'The deduction game is hypothesis-driven debugging with information theory keeping score: the best question maximizes expected elimination (a bit per question, ideally), which is why "what test halves my remaining suspects?" beats "what test might confirm my favorite theory?", confirmation bias being as costly at the keyboard as at the game table. The good player’s notebook is the debugging log: hypotheses, tests, outcomes, exclusions, the artifact that prevents re-testing known ground. And the endgame rule matches: accuse (ship the fix) only when the remaining possibility space is one.',
          adult:
            'Watch someone good at mystery games: every question is engineered so that any answer eliminates suspects, and notes are kept ruthlessly. Skilled engineers hunt failures identically, hypothesis, targeted test, recorded result, and the difference between them and thrash is visible in exactly those notes. The transferable rule: never run a test whose outcome will not change what you believe, at the game table or in the incident channel.',
        },
      },
    ],
  },
  {
    id: 'testing',
    name: 'Testing',
    tagline: 'Small automated checks that prove the code still does what it promised.',
    analogies: [
      {
        id: 'testing--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Taste the stock, not just the soup',
        maps: [
          { code: 'unit test', analog: 'tasting the stock before it becomes soup' },
          { code: 'integration test', analog: 'tasting the assembled dish' },
          { code: 'catching early', analog: 'bad stock caught before it ruins everything' },
          { code: 'shipping untested', analog: 'the first taste happens at the customer’s table' },
        ],
        text: {
          child:
            'Good cooks taste all along the way: the stock before it becomes soup, the sauce before it coats the noodles, and one final taste of the finished dish. If the stock is too salty, they find out while it is still just stock, easy to fix! Imagine only tasting when the plate is already at the table. Yikes.',
          highschool:
            'Kitchen tasting maps to software testing tiers: tasting the stock alone is a unit test (one component, in isolation, cheap to fix), tasting the finished dish is an integration test (everything combined). The economics is the whole argument: salty stock caught early costs a pinch of correction; discovered in the served soup, it costs the dish, the evening, and the review. Test early, test small, then test assembled.',
          undergrad:
            'The tasting regime is the test pyramid with kitchen economics: many cheap unit tastes (stock, sauce, seasoning: isolated components with controlled inputs), fewer integration tastes (the assembled plate), the rare full tasting menu (end-to-end). Tasting after every adjustment is regression testing: yesterday’s balanced stock re-checked because today’s change might have unbalanced it, which is why suites run on every commit. And writing the doneness criteria before cooking ("done means: clear, golden, seasoned") is test-first: the spec exists before the implementation, and vagueness gets flushed out at the cheapest possible moment.',
          adult:
            'Professional kitchens taste at every stage because the earlier a fault is found, the cheaper the fix: stock is a pinch of salt, a served dish is a refund. Software teams automate exactly that: thousands of small tastes run on every change, so regressions surface in minutes rather than in customers’ hands. When engineers defend time spent writing tests, they are defending the tasting spoon, and the alternative is a restaurant that discovers salt levels from complaints.',
        },
      },
      {
        id: 'testing--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'The gauge at every station',
        maps: [
          { code: 'assertion', analog: 'the part must fit the gauge, exactly' },
          { code: 'test suite', analog: 'the row of gauges each part passes through' },
          { code: 'regression', analog: 'a passing part that yesterday would have failed' },
          { code: 'flaky test', analog: 'a gauge that sometimes sticks: trusted by no one' },
        ],
        text: {
          child:
            'After each machine on the line, there is a checking tool: the part must slide into the gauge just right, or it goes no further. The gauges do not get tired, do not blink, and check every single part the same way. A bad part gets caught right where it went wrong, not at the very end in a finished toy!',
          highschool:
            'Factory gauges are assertions: objective pass/fail checks after each step, applied to every part identically, catching defects at the station that caused them. A full row of gauges is a test suite, and its value compounds on change: retool one machine and the gauges instantly report whether anything downstream broke (a regression). The credibility rule is absolute on the floor and in code: a gauge that sometimes sticks (a flaky test) gets ignored, and an ignored gauge is worse than none.',
          undergrad:
            'The gauge line is test engineering made physical: assertions as tolerance checks, suites as sequenced coverage, placement close to the causing step (unit-level) so failures localize, and the retooling scenario as regression detection, the actual reason suites earn their maintenance cost. Coverage rhetoric gets its floor-level correction here: gauges only catch what they measure, a part can pass every fit check and still be the wrong color, so passing tests bound the failure modes you thought to check, nothing more. And flakiness is a first-class defect: a nondeterministic gauge destroys the signal of the whole line, which is why teams quarantine and fix flaky tests instead of rerunning until green.',
          adult:
            'Factories trust gauges, not vigilance: every part checked identically after every step, so faults surface where they start and retooling gets instant feedback. Automated tests are those gauges for software, and their business case is the same: catching defects at the station costs pennies, catching them in shipped product costs recalls. The discipline that keeps the system honest is treating an unreliable check as a defect itself, because one gauge nobody trusts quietly teaches the crew to ignore them all.',
        },
      },
      {
        id: 'testing--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'The checklist flies every flight',
        maps: [
          { code: 'the test suite', analog: 'the preflight checklist, every flight' },
          { code: 'running before deploy', analog: 'checks complete before wheels leave ground' },
          { code: 'cheap on the ground', analog: 'a fault found at the gate vs in the air' },
          { code: 'skipping under pressure', analog: 'the rushed departure that skips items' },
        ],
        text: {
          child:
            'Pilots check the same list before every single flight: flaps, fuel, instruments, doors. Every flight, even their thousandth! Not because they forget how to fly, but because finding a problem at the gate is easy, and finding it in the sky is an emergency. Boring little checks on the ground make the exciting part safe.',
          highschool:
            'The preflight checklist is a test suite with a release gate: the same checks, in full, before every flight, because the cost of a fault changes catastrophically once airborne, exactly like a bug found before versus after deployment. Its power comes from being boring: written down, complete, never negotiated under schedule pressure. Software teams run their suite before every release for precisely the pilot’s reason, and the incidents happen when someone is in a hurry.',
          undergrad:
            'Aviation checklists are the deployment-gate argument refined by decades of accident data: fixed, versioned procedures run in full before an irreversible transition, with items accreting from postmortems, exactly how regression tests accrete from bugs (every incident adds a check so that failure class never flies again). The discipline findings transfer whole: checklists fail socially, not technically, skipped under pressure, pencil-whipped when too long, so suites must stay fast enough to run honestly, and "we skipped the checks to make the release window" reads identically in an NTSB report and a postmortem.',
          adult:
            'Aviation made routine verification a precondition of departure: the checklist runs in full, every flight, because ground problems are cheap and airborne problems are not. Software release gates copy this exactly, and so do the failure patterns: incidents cluster where checks were skipped under deadline. The cultural test worth borrowing from cockpits: a checklist item that teams routinely skip is either wrong (fix it) or vital (enforce it), and leaving it optional is choosing not to know which.',
        },
      },
    ],
  },
  {
    id: 'refactoring',
    name: 'Refactoring',
    tagline: 'Improving the code’s structure without changing what it does.',
    analogies: [
      {
        id: 'refactoring--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Reorganize between services, not mid-rush',
        maps: [
          { code: 'refactoring', analog: 'reorganizing stations while the menu stays fixed' },
          { code: 'behavior preserved', analog: 'diners notice nothing on the plate' },
          { code: 'why bother', analog: 'every future dish comes out faster, cleaner' },
          { code: 'timing discipline', analog: 'between services, never mid-rush' },
        ],
        text: {
          child:
            'Between lunch and dinner, a smart kitchen reorganizes: knives back by the cutting board, sauces labeled, the messy corner cleared. The menu does not change one bit, and diners never know! But dinner runs smoother, faster, with fewer mix-ups. Cleaning up how you work, without changing what you make: cooks do it, and programmers do too.',
          highschool:
            'Refactoring is the between-services reorganization: the menu (what the code does) is untouched, the kitchen (how the code is arranged) improves, and the payoff arrives as speed and fewer mistakes in everything cooked afterward. The two disciplines that make it safe transfer directly: verify the dishes still taste identical afterward (the tests), and never reorganize during the dinner rush (separate refactors from feature deadlines).',
          undergrad:
            'The kitchen reorg is refactoring with its contract stated: behavior-preserving transformation, verified by a taste-test oracle, so the test suite is precondition rather than afterthought, refactoring without tests is just rearranging and hoping. The catalog maps naturally: relocating the knives to their use-site is moving code toward its callers, labeling sauces is renaming for clarity, splitting an overloaded station is extracting a function. And the economics is the honest part: the reorg costs a real afternoon and pays in every subsequent service, which is why it is justified by the change rate of the kitchen, hot paths deserve tidy stations, the storage room can stay ugly.',
          adult:
            'Restaurants reorganize the kitchen between services precisely because customers see nothing and every later dish benefits: that is refactoring, engineering work that changes no feature yet makes all future features cheaper. It looks like "no progress" on a roadmap the way knife-sharpening looks like not cooking. The two governance rules that keep it honest: proof afterward that behavior is unchanged (tests), and timing that never collides with the rush (not bundled into deadline-critical work).',
        },
      },
      {
        id: 'refactoring--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Re-pipe the street, keep the addresses',
        maps: [
          { code: 'stable interface', analog: 'every address stays exactly the same' },
          { code: 'improved internals', analog: 'new pipes and conduit under the same street' },
          { code: 'technical debt', analog: 'patches on patches until repairs need excavation' },
          { code: 'incremental migration', analog: 'one block at a time, service never cut' },
        ],
        text: {
          child:
            'A city can replace everything under a street, old pipes, tangled cables, without changing a single house number. Mail still arrives, visitors still find you, but under the ground everything is new and neat. And they do it block by block, so the water never goes out! Fixing the insides while the outsides stay put: that is the move.',
          highschool:
            'Street renewal is refactoring at municipal scale: the interface (addresses, the things everyone depends on) stays fixed while the internals (pipes, conduit) are rebuilt, so residents notice nothing but future repairs get easy. Deferred, it compounds: patch upon patch until a small leak requires excavation, which is precisely technical debt. The block-by-block schedule is the incremental strategy: never a big bang, service never interrupted.',
          undergrad:
            'The re-piping project is interface-preserving restructuring with the deployment reality attached: callers (addresses) are untouched, internals are modernized, and the work proceeds incrementally with both systems live per block, exactly the strangler-fig migration pattern, old and new coexisting behind a stable boundary until cutover completes. Utility maps that no longer match what is buried are stale documentation, discovered the hard way at dig time. And the debt metaphor is at its most literal here: each expedient patch raises the cost of the eventual proper fix, until the interest (every repair takes excavation) exceeds the principal (re-pipe once, properly).',
          adult:
            'Cities rebuild everything beneath a street while every address stays valid, block by block, service uninterrupted. Software modernization done well is the same project: external behavior held stable, internals replaced incrementally, no big-bang cutover. The budgetary translation is exact too: deferring it does not save the money, it converts small scheduled repairs into emergency excavations, and "we cannot change anything without breaking everything" is what a fully indebted street sounds like.',
        },
      },
      {
        id: 'refactoring--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'Same books, findable at last',
        maps: [
          { code: 'behavior unchanged', analog: 'the collection is identical, book for book' },
          { code: 'structure improved', analog: 'a consistent system replaces the piles' },
          { code: 'verification', analog: 'the catalog confirms nothing went missing' },
          { code: 'continuous tidying', analog: 'reshelve as you go, or drown in piles' },
        ],
        text: {
          child:
            'A library with great books and terrible shelves is a sad thing: everything exists, nothing can be found. Reshelving day changes not one single book, and changes everything: same collection, sensible order, and suddenly finding a book takes a minute instead of an afternoon. Afterward the librarians check the catalog: every book accounted for. Nothing lost, everything better!',
          highschool:
            'Reshelving a chaotic library is refactoring in the stacks: the collection (behavior) is unchanged book for book, the organization (structure) transforms, and the catalog check afterward is the test suite confirming nothing was lost in the move. The maintenance lesson is the sharper one: libraries that reshelve continuously stay usable; libraries that let returns pile up "until things calm down" end with a floor of piles, which is exactly how codebases rot.',
          undergrad:
            'The reshelving project isolates refactoring’s definition: identical collection, transformed organization, verified by inventory against the catalog, behavior preservation with an explicit oracle. The findability payoff is measurable (retrieval time drops), the analog of comprehension speed in restructured code, and the classification system chosen is the architecture: consistent, learnable schemes beat clever ones nobody else can navigate. The pile dynamics formalize the boy-scout rule: continuous small reshelving (leave each shelf better than found) keeps marginal cost near zero, while batch cleanup scales superlinearly with the mess, which is why "big cleanup sprint someday" loses to tidying in every commit.',
          adult:
            'Reorganizing a library changes no books and transforms the institution: findability is the product, and structure is what delivers it. Codebases are identical: the features are the books, the organization decides whether the next change takes an hour or a week. Two library truths carry over unchanged: verify after reorganizing that nothing went missing, and tidy continuously, because the team that waits for a quiet month to clean up meets the floor of piles instead.',
        },
      },
    ],
  },
  {
    id: 'garbage-collection',
    name: 'Garbage collection',
    tagline: 'Automatically reclaiming memory that nothing can reach anymore.',
    analogies: [
      {
        id: 'garbage-collection--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'Bussers clear what no one holds',
        maps: [
          { code: 'allocation', analog: 'seating a party at a table' },
          { code: 'unreachable memory', analog: 'the table nobody is using anymore' },
          { code: 'the collector', analog: 'bussers sweeping for abandoned tables' },
          { code: 'GC pause', analog: 'clearing during the rush stalls service' },
        ],
        text: {
          child:
            'Diners never wash their own dishes: they eat, they leave, and bussers notice the empty table, clear it, and reset it for the next party. Nobody has to remember to give the table back! But if the bussers sweep through during the busiest moment, everyone waits a beat while trays go by. Handy system, tiny hiccups.',
          highschool:
            'Garbage collection staffs the program with bussers: code takes tables (allocates memory), walks away when done, and the collector notices abandoned tables and resets them for reuse. The alternative is making every diner wash up (manual memory management), which works until someone forgets (a leak) or clears a table still occupied (use-after-free). The cost is the sweep itself: bussing during the rush pauses service briefly, the famous GC pause.',
          undergrad:
            'The dining room states the reachability rule exactly: a table is clearable when no one holds it, not when it merely looks idle, which is reachability from roots, the definition tracing collectors compute. Two diners who each claim they are "with the other" and never leave are a reference cycle: reference counting (tracking claims per table) never frees them, tracing from the front door does. Pause engineering is the modern story: stop-the-world is closing the room to bus everything; concurrent collectors bus around live diners accepting some coordination; generational collection is the empirical bet that most parties leave quickly, so sweep the recent seatings often and the long-sitters rarely.',
          adult:
            'Managed software runs like a restaurant with bussers: programs use memory and walk away, and the runtime reclaims whatever nothing references anymore. This removes an entire class of catastrophic mistakes (forgetting to clean up, or cleaning up a table still in use) in exchange for occasional pauses while the sweep happens, which is what engineers are tuning when they discuss GC. Leaks still exist in one sneaky form: tables the program technically still holds but will never use again, which no busser may touch.',
        },
      },
      {
        id: 'garbage-collection--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'Reshelve when no borrower remains',
        maps: [
          { code: 'live reference', analog: 'a book currently checked out' },
          { code: 'reclaiming', analog: 'reshelving from the returns cart' },
          { code: 'reference counting', analog: 'the borrower tally on each book’s card' },
          { code: 'reference cycle', analog: 'two books listed as borrowing each other' },
        ],
        text: {
          child:
            'A library book on loan stays out, however long, because someone still holds it. Books on the returns cart with no borrower go back on the shelf for the next reader. Simple rule: held means kept, released means reshelved! The librarians do all of it quietly in the background, and readers never think about shelves at all.',
          highschool:
            'Library circulation is memory management: checked out means in use (referenced), and only books with no remaining borrower get reshelved (reclaimed). One scheme tallies borrowers per book (reference counting: reshelve at zero), and its famous blind spot is two records that reference each other with no human holder, never reaching zero: a cycle. The other scheme ignores tallies and asks "reachable from an actual reader?", which handles cycles, and is how mainstream collectors actually work.',
          undergrad:
            'The circulation desk contrasts the two collector families precisely: per-book tallies are reference counting (immediate reclamation at zero, per-operation overhead on every check-in/out, defeated by cycles), while a periodic audit tracing from live readers is mark-and-sweep (cycle-proof, batched, costs a walk of the live set). The mutual-borrow records are the canonical cycle, and weak references get a clean analog: the recommendations list may mention a book without keeping it off the shelf, mention without retention, exactly what caches use so their bookkeeping never pins the world in memory.',
          adult:
            'Libraries reclaim books by a rule software borrowed wholesale: while anyone still holds it, it stays out; when no one does, it returns to circulation. Runtimes automate this for memory, and the two bookkeeping styles, a running tally per item versus periodic audits of what is actually held, are real engineering alternatives with real costs. The failure worth knowing by name: records that hold each other with no human involved never hit zero on a tally, which is why the audit approach won.',
        },
      },
      {
        id: 'garbage-collection--gardening',
        domain: 'gardening',
        domainLabel: 'Gardening',
        title: 'Compost the dead, spare the living',
        maps: [
          { code: 'dead objects', analog: 'plants nothing living depends on' },
          { code: 'reclaimed memory', analog: 'nutrients returned to the soil' },
          { code: 'use-after-free', analog: 'pruning a branch the tree still needed' },
          { code: 'the collector’s guarantee', analog: 'only the truly dead get composted' },
        ],
        text: {
          child:
            'A garden never wastes anything: dead leaves and spent plants go to the compost, break down, and feed the new spring growth. The gardener’s one sacred rule is checking first: never compost a plant that something still needs! The dead feed the living, the living stay untouched, and the garden keeps growing out of its own leftovers.',
          highschool:
            'Composting is memory reclamation with a safety rule: only material nothing living depends on gets broken down and returned as capacity for new growth. Cutting a branch the tree still needed is the gardener’s version of freeing memory still in use (use-after-free), the crash-and-corruption class of bug. Garbage collectors are the cautious gardener automated: they verify true deadness (unreachability) before composting, making that entire mistake impossible.',
          undergrad:
            'The compost cycle is the memory lifecycle: allocate (grow), die (become unreachable), reclaim (decompose), reallocate (new growth from freed capacity), and the gardener’s check is the collector’s soundness guarantee: only provably unreachable objects are reclaimed, which eliminates use-after-free by construction, the safety argument for managed runtimes. Conservative collectors are the cautious gardener who spares anything that might be alive (leaking a little to never kill wrongly), and the perennial that looks dead all winter is the long-lived object generational collectors learn to stop re-checking: tenure for survivors, frequent sweeps for annuals.',
          adult:
            'Gardens run a strict recycling economy: what nothing depends on gets composted into capacity for new growth, and the careful gardener never composts a living plant. Software memory management automated exactly this, with the runtime verifying "truly dead" before reclaiming, which abolished a whole category of crashes that manual cleanup used to cause. The residual risk is hoarding, not wrongful pruning: things kept technically alive by a forgotten list somewhere, filling the beds until nothing new can grow.',
        },
      },
    ],
  },
  {
    id: 'randomness-seed',
    name: 'Randomness and seeds',
    tagline: 'Computers fake randomness: the same seed always replays the same sequence.',
    analogies: [
      {
        id: 'randomness-seed--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'The shuffle you can replay',
        maps: [
          { code: 'the PRNG', analog: 'a precise, written-down shuffling procedure' },
          { code: 'the seed', analog: 'the deck’s starting order' },
          { code: 'reproducibility', analog: 'same start, same procedure, same "random" deck' },
          { code: 'daily seed', analog: 'everyone getting the identical daily puzzle' },
        ],
        text: {
          child:
            'Here is a card trick: shuffle with an exact recipe, split here, weave there, cut twice, starting from a sorted deck. The result looks perfectly mixed up! But run the same recipe from the same start again, and you get the exact same "mixed up" deck, every single time. Looks random, repeats perfectly. Computers shuffle exactly like this!',
          highschool:
            'A written-out shuffle from a known starting order is a pseudorandom generator: the output looks random, but same start (the seed) plus same procedure yields the identical sequence, every time. That repeatability is a feature: daily puzzle games seed by the date so the whole world gets the same board, and game replays store just the seed instead of every dice roll. Change the seed, get a fresh-looking shuffle.',
          undergrad:
            'The scripted shuffle is a PRNG stated honestly: a deterministic function iterated from a seed, indistinguishable-from-random outputs by statistical tests, perfectly reproducible by construction. The engineering uses follow: seeded test runs make flaky randomized failures replayable (log the seed, replay the bug), simulations become auditable, and procedural game worlds ship as one integer. The security boundary is the card table’s too: an opponent who deduces your starting order predicts every future card, which is why gambling and cryptography require seeds from real entropy (the ceremonial riffle by a human) and CSPRNGs whose future outputs resist inference even given past ones.',
          adult:
            'Computer randomness is a scripted shuffle: genuinely random-looking, exactly repeatable from the same starting point (the seed). Businesses exploit the repeatability daily, identical daily puzzles worldwide, replayable simulations, bug reports that include the seed so the "random" failure happens on demand. The flip side is predictability to adversaries: where money or security ride on unpredictability, the starting point must come from true physical randomness, and regulators literally audit that.',
        },
      },
      {
        id: 'randomness-seed--music',
        domain: 'music',
        domainLabel: 'Music',
        title: 'Random fill, preset 42',
        maps: [
          { code: 'the seed', analog: 'the pattern number dialed in' },
          { code: 'the generator', analog: 'the fill algorithm in the box' },
          { code: 'reproducing a take', analog: 'note the number, recreate the fill anywhere' },
          { code: 'true entropy', analog: 'a drummer’s genuinely unrepeatable groove' },
        ],
        text: {
          child:
            'A drum machine has a "surprise fill" button that plays a wild little drum burst. But here is the secret: dial the same pattern number and the surprise is the same every time, on your machine, on anyone’s machine! Producers write the number down when they love a fill, so they can summon that exact "surprise" again next week.',
          highschool:
            'The drum machine’s numbered fills are seeded randomness: the number is the seed, the fill algorithm is the generator, and the same number reproduces the same "random" burst on any machine running the same box. Writing down the number to recreate a take is exactly why programmers log seeds: a randomized test that fails can be replayed identically. A human drummer’s unrepeatable groove is the contrast: true randomness, gone forever unless recorded.',
          undergrad:
            'Preset-numbered fills state the PRNG contract in studio terms: seed plus algorithm determines output completely, portability included (same box, same number, same fill anywhere), which is cross-platform reproducibility, and version sensitivity comes free (a firmware update that changes the fill for old numbers is exactly a library changing its generator and breaking replay files). The workflow is the scientific one: log the seed with every take, so "that great random thing" is re-summonable, the same practice that makes randomized algorithms, ML training runs, and property-based tests auditable. The drummer is the entropy source: unrepeatable by nature, sampled (recorded) rather than regenerated.',
          adult:
            'Producers love the drum machine whose "random" fill is secretly numbered: the surprise is repeatable on demand, anywhere, by noting one number. Software randomness works exactly so, and industries depend on the note-the-number discipline: a failure in randomized testing is replayed from its seed, a simulation is audited by rerunning it identically. Where genuine unrepeatability is the requirement, the machine must sample the world (the human drummer), and that distinction, replayable versus truly unpredictable, is the entire policy question.',
        },
      },
      {
        id: 'randomness-seed--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Random students, suspiciously repeatable',
        maps: [
          { code: 'the generator', analog: 'the counting-off rule over the class list' },
          { code: 'the seed', analog: 'the starting number' },
          { code: 'predictability risk', analog: 'students who know the rule know who is next' },
          { code: 'true entropy', analog: 'names from a physically shaken hat' },
        ],
        text: {
          child:
            'A teacher "randomly" picks students with a rule: start at some number and hop down the list by a secret step. Same starting number tomorrow? The very same students get picked, in the same order! Kids who figure out the rule stop being surprised. The hat full of names, properly shaken, is the only true surprise in the room.',
          highschool:
            'The counting-off rule is a pseudorandom generator: pick a start (the seed) and the sequence of "random" students is fully determined, replayable tomorrow from the same start. Useful when the teacher wants fairness they can audit; a problem once students infer the rule and predict who is next, which is exactly the predictability attack on poorly seeded software. The shaken hat is true entropy: unpredictable even to someone who knows the procedure.',
          undergrad:
            'Classroom selection schemes span the randomness spectrum: the deterministic count-off is a seeded PRNG (auditable, replayable, fair-in-distribution but predictable given rule plus seed), and prediction by observant students is seed/state recovery, the actual attack that has broken lottery machines and session-token generators seeded from timestamps. The auditability half is the virtue software borrows: a disputed "random" selection replays from its logged seed, resolving fairness arguments by rerun. The shaken hat is the entropy source of record, and hybrid practice mirrors real systems: draw the daily start from the hat (physical entropy), then run the transparent rule (deterministic expansion), which is precisely how operating systems seed their generators.',
          adult:
            'A teacher’s counting rule for "random" picks is replayable and auditable, virtues real systems need for disputed draws and testable behavior, and predictable to anyone who deduces the rule, which is precisely how weakly seeded lotteries and security tokens have been broken. The mature design copies the classroom hybrid: true physical unpredictability at the start (the shaken hat), transparent reproducible procedure after it. Knowing which half a given "random" claim relies on is the due-diligence question.',
        },
      },
    ],
  },
  {
    id: 'operating-system',
    name: 'Operating systems',
    tagline: 'The manager that shares one machine among many programs.',
    analogies: [
      {
        id: 'operating-system--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'One plant, many product lines',
        maps: [
          { code: 'processes', analog: 'product lines sharing the plant' },
          { code: 'scheduling', analog: 'allocating machine time slice by slice' },
          { code: 'memory protection', analog: 'each line’s materials in fenced bins' },
          { code: 'kill / preemption', analog: 'the manager halting a runaway line' },
        ],
        text: {
          child:
            'One factory, many product lines, and every line wants the big machines all day. The plant manager shares them out in turns, so quickly that every line feels busy. Each line’s parts sit in its own fenced bins, so nobody grabs someone else’s pieces. And a line gone haywire? The manager shuts that one down, and the rest never notice!',
          highschool:
            'An operating system runs the computer like a plant manager: programs (product lines) believe they own the machines, while the manager slices time among them (scheduling), fences their materials apart (memory protection: one program cannot read another’s data), and halts a runaway line without disturbing the rest (killing a process). Every app on your laptop lives inside exactly this managed sharing, which is why one crashed app no longer takes the machine down.',
          undergrad:
            'The plant states the OS core: processes as isolated lines with the illusion of sole ownership (virtualization of CPU via time slicing and of memory via per-line address fencing), preemption as the manager reclaiming a machine mid-job (context switch, registers as the line’s jig settings saved and restored), and requests to the manager for anything shared, materials in, product out, as system calls: lines never operate the loading dock themselves. Scheduling policy is plant politics made algorithmic: round-robin fairness versus priority for rush orders, starvation as the line that never gets the lathe, and the fencing is the protection boundary that turns a misbehaving line into its own problem instead of the plant’s.',
          adult:
            'An operating system is plant management for a computer: many programs share the hardware under an authority that schedules turns, walls off each program’s materials, and shuts down misbehavers cleanly. That authority is why a frozen app is an annoyance now rather than a reboot, and why one program cannot rummage in another’s data. When production systems misbehave at the resource level, someone is effectively renegotiating with this manager, and "the OS killed it" means the manager’s rules, memory limits, priorities, were the binding constraint.',
        },
      },
      {
        id: 'operating-system--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'The timetable owns the rooms',
        maps: [
          { code: 'scheduler', analog: 'the timetable office' },
          { code: 'resources', analog: 'rooms, projectors, the gym' },
          { code: 'context switch', analog: 'the changeover bustle between periods' },
          { code: 'preemption', analog: 'the bell ends the lesson, ready or not' },
        ],
        text: {
          child:
            'A school has more classes than gyms, so the timetable shares everything out: your class gets the gym third period, another gets it fourth. The bell is the boss! When it rings, the lesson ends ready or not, everyone moves, and the next class flows in. Nobody owns a room; everybody gets their fair turn.',
          highschool:
            'A school timetable is an operating system for rooms: more classes than resources, so allocation happens in scheduled slices, the bell preempts (the lesson ends whether finished or not, like the OS reclaiming the CPU), and changeover bustle between periods is the context switch, pure overhead that fairness makes worthwhile. Priorities exist too: exam week gets the hall, the way high-priority processes get the CPU, and a class that never gets the gym is starvation.',
          undergrad:
            'The timetable makes scheduling policy discussable: fixed slices with forced preemption (the bell: no lesson may overrun its quantum), context-switch overhead as the changeover minutes (real cost, motivating neither too-long slices nor thrashing-short ones), priorities and their failure mode (exam week versus the club that never gets the hall: starvation, solved by aging). Resource conflicts complete the picture: two classes booked into one lab is the double-allocation bug, the deadlock analog is class A holding the projector waiting for the lab while B holds the lab waiting for the projector, and the office’s global view, no class schedules itself, is exactly why the kernel owns allocation.',
          adult:
            'Schools run scarce rooms by timetable: scheduled turns, a bell that enforces the handover, priorities for what matters this week. Computers share their internals under an identical authority, and the same phenomena surface in products: everything slows when too much competes for a turn (an overloaded schedule), urgent work jumps queues at someone’s expense, and the quiet team that never gets the room is a real failure mode with a real fix, escalating priority the longer you wait. The takeaway for any shared platform: the schedule is policy, and policy is tunable.',
        },
      },
      {
        id: 'operating-system--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Nobody lays their own water main',
        maps: [
          { code: 'system calls', analog: 'standard hookups to city water and power' },
          { code: 'kernel-managed hardware', analog: 'the shared infrastructure under the streets' },
          { code: 'resource limits', analog: 'permits and meters per household' },
          { code: 'isolation', analog: 'one house’s plumbing failure stays theirs' },
        ],
        text: {
          child:
            'No house in a city digs its own well or runs its own power plant. Every home connects to the shared pipes and wires through standard hookups, and meters keep any one house from draining the whole reservoir. Inside your house, your taps are your business; the giant system under the street belongs to everyone, run by the city!',
          highschool:
            'A city serves households the way an operating system serves programs: shared infrastructure (water, power) reached only through standard hookups (system calls: no program touches the disk directly, it asks), with meters and permits as resource limits keeping one consumer from starving the rest. The isolation runs both ways: your burst pipe floods your house, not the block, the way one program’s crash stays its own, and the standard hookup is why any appliance works in any house.',
          undergrad:
            'City utilities model the syscall boundary precisely: user code (household plumbing) versus kernel-managed infrastructure (the mains), with the hookup as the privileged interface, the only crossing point, which is the user/kernel mode split enforced for the same reason cities forbid private taps into the main: one bad actor otherwise contaminates everyone. Meters are cgroup-style resource accounting, permits are quotas and ulimits, pressure drops during citywide peak demand are contention on shared resources, and the standardized hookup enabling any appliance anywhere is the portability argument: programs written to the syscall interface run on any conforming kernel, POSIX as the plumbing code.',
          adult:
            'Cities long ago solved what operating systems solve: many independent parties sharing critical infrastructure safely, via standard hookups, metering, and the rule that nobody touches the mains directly. Computers enforce the same civics between your applications and the hardware, which is why one misbehaving program cannot poison the machine for the rest. The design lesson travels well beyond computing: shared platforms stay trustworthy exactly as long as every consumer goes through the metered, standard interface, and every exception granted is a future incident.',
        },
      },
    ],
  },
];
