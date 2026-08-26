import type { Concept } from '../types';

export const language: Concept[] = [
  {
    id: 'boolean-logic',
    name: 'Boolean logic',
    tagline: 'Combining yes/no facts with AND, OR, and NOT.',
    analogies: [
      {
        id: 'boolean-logic--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Switches in series and parallel',
        maps: [
          { code: 'AND', analog: 'two switches in series: both must be on' },
          { code: 'OR', analog: 'two switches in parallel: either one works' },
          { code: 'NOT', analog: 'a relay that inverts: on means off' },
          { code: 'compound expression', analog: 'a wiring diagram of series and parallel runs' },
        ],
        text: {
          child:
            'Some lamps need two switches both flipped on before they light: that is AND. Hallway lights often work from either end: flip this one or that one, and the light comes on. That is OR! Electricians build whole light puzzles this way, and computers are built from millions of exactly these little switch tricks.',
          highschool:
            'Wire two switches in series and the lamp demands both: AND. Wire them in parallel and either suffices: OR. Add an inverting relay and on means off: NOT. Every boolean expression in code is one of these wiring diagrams, and a condition like (a && b) || c is literally "a series pair, in parallel with c". Circuits made the logic physical first; the if statement borrowed it.',
          undergrad:
            'Series/parallel wiring is boolean algebra you can solder: series is conjunction, parallel disjunction, the inverting relay negation, and De Morgan is a rewiring rule (a series pair of inverted switches behaves like an inverted parallel pair). Short-circuit evaluation is visible too: in a series run, if the first switch is off, current never reaches the second, which is exactly why b in (a && b) never executes when a is false, and why side effects hiding in b are a wiring hazard. Gates are this picture miniaturized: your CPU is series/parallel by the billion.',
          adult:
            'Business rules are wiring: "ship free if the order tops $50 AND the address is domestic, OR the customer is premium" is switches in series and parallel. Two practical lessons carry over from electricians: complex wiring gets audited with a table of every switch combination (a truth table), and rewiring a NOT across a bundle flips more than people expect, which is why "not (A and B)" surprising teams is common enough that logicians named the rule for it.',
        },
      },
      {
        id: 'boolean-logic--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'The card spells out the condition',
        maps: [
          { code: 'condition', analog: 'the requirement printed on the card' },
          { code: 'AND / OR nesting', analog: '"a key AND (a torch OR a lantern)"' },
          { code: 'NOT', analog: 'the curse: players who may NOT enter' },
          { code: 'evaluating', analog: 'checking your hand against the requirement' },
        ],
        text: {
          child:
            'A game card says: "Enter the tower if you have the key AND a torch OR a lantern." You look at your cards and check: key? Yes. Torch or lantern? A lantern counts! In you go. Games are full of these little yes/no puzzles, and you are already great at solving them.',
          highschool:
            'Game cards state compound conditions: "enter with a key AND (a torch OR a lantern)." Evaluating your hand against the card is exactly what a computer does with a boolean expression, and the parentheses do real work: key AND torch, OR lantern, is a different rule that lets a lantern-holder in with no key. Ambiguity about grouping causes table arguments in games and bugs in code, which is why both use brackets.',
          undergrad:
            'Card requirements are boolean expressions with the classic pitfalls attached: precedence (AND binds tighter than OR, so the unparenthesized rule silently means (key AND torch) OR lantern), evaluation against an assignment (your hand is the truth assignment), and negation scope (cursed players who may NOT enter with a weapon: is the curse on entering or on the weapon?). Rules lawyers resolving these disputes are doing what parsers and De Morgan do formally, and a rulebook that enumerates every legal hand is a truth table, which is why exhaustive case tests are the boolean bug-killer.',
          adult:
            'Eligibility rules read like game cards: "approve if income qualifies AND (a guarantor OR collateral exists)." The grouping decides who gets approved, and most logic disputes in products trace to an ambiguous sentence where AND and OR were never bracketed. The habit worth institutionalizing comes from rules lawyers: write out the table of cases. It is tedious for exactly as long as it takes to catch the combination nobody intended to approve.',
        },
      },
      {
        id: 'boolean-logic--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Done means both checks pass',
        maps: [
          { code: 'AND', analog: 'browned on top AND 90 degrees inside' },
          { code: 'OR', analog: 'a clean tester OR edges pulling away' },
          { code: 'NOT', analog: 'do not open the oven while it rises' },
          { code: 'the whole recipe', analog: 'a chain of checks deciding every action' },
        ],
        text: {
          child:
            'How do you know a cake is done? The tester comes out clean, or the edges pull away from the pan: either sign counts. A roast is stricter: brown on the outside and hot enough in the middle, both, not just one. Cooks check little yes/no questions all the time, and stringing them together is how dinner comes out right.',
          highschool:
            'Kitchen doneness rules are boolean expressions: the roast needs browned AND up to temperature (both, strictly), while the cake accepts a clean tester OR receding edges (either sign suffices). The AND/OR choice encodes how much evidence you demand, and mixing them up gives you the two classic failures: pulling food early on one weak sign (OR where AND belonged) or drying it out waiting for redundant proof (AND where OR was enough).',
          undergrad:
            'Doneness checks make boolean operators consequential: AND raises the bar (both signals), OR lowers it (any signal), and choosing between them is precision/recall in an apron: the OR-cake risks false positives (declared done, still raw inside), the AND-roast risks false negatives (overcooked while awaiting the second signal). Sensor fusion in real systems is this exact decision, and the kitchen also teaches evaluation order as economy: check the cheap oven-window sign before the expensive open-the-door probe, which is short-circuiting with heat loss as the cost model.',
          adult:
            'Cooks combine evidence with AND and OR without naming them: demand both signs for the expensive roast, accept either for the forgiving cake. Systems that approve payments or flag fraud tune the same dial: AND-ing checks means fewer false alarms but more misses, OR-ing them the reverse. When a team debates "should this alert require both conditions or either one?", that is the whole conversation, and the kitchen version makes the stakes easy to taste.',
        },
      },
    ],
  },
  {
    id: 'scope',
    name: 'Scope',
    tagline: 'Where a name is visible, and when it stops existing.',
    analogies: [
      {
        id: 'scope--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'The whiteboard versus the noticeboard',
        maps: [
          { code: 'local variable', analog: 'what is written on this classroom’s whiteboard' },
          { code: 'global variable', analog: 'the hallway noticeboard everyone reads' },
          { code: 'shadowing', analog: 'the whiteboard version wins inside the room' },
          { code: 'end of scope', analog: 'the board is wiped when class ends' },
        ],
        text: {
          child:
            'Every classroom has its own whiteboard, and the hallway has one big noticeboard for the whole school. Inside your room, "the schedule" means the one on your whiteboard, even if the hallway shows a different one. And when class ends, the whiteboard gets wiped clean. The hallway board stays up for everyone, all year.',
          highschool:
            'Scope works like boards in a school: the classroom whiteboard is local (visible only in that room, wiped when class ends), the hallway noticeboard is global (visible everywhere, long-lived). If both define "the schedule", the room’s version wins inside the room: that is shadowing. It is also why two classes can each have their own "x" on their own boards without ever colliding.',
          undergrad:
            'The boards give scope its full vocabulary: lexical nesting (room inside hallway inside school district), name resolution as innermost-board-first lookup, shadowing when a room redefines a hallway name, and lifetime: the wipe at period’s end is locals dying at scope exit, while the noticeboard persists like a global. The design argument writes itself on the boards: hallway postings anyone can edit are shared mutable globals, and the reason "minimize globals" is doctrine is that when the posting is wrong, every room in the school is a suspect.',
          adult:
            'Information in software has a blast radius, like boards in a school: a classroom whiteboard affects one room and is wiped daily; the hallway noticeboard affects everyone and lingers. Engineers push data toward the smallest board that works, because a mistake on a local board is a room’s problem and a mistake on the global board is an all-staff incident. "Too much global state" is the audit finding, and this is what it means.',
        },
      },
      {
        id: 'scope--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'The station rack and the tool crib',
        maps: [
          { code: 'local scope', analog: 'this workstation’s own tool rack' },
          { code: 'enclosing / global scope', analog: 'the shared central tool crib' },
          { code: 'name resolution', analog: '"the wrench" means the nearest one' },
          { code: 'scope exit', analog: 'racks cleared at shift change' },
        ],
        text: {
          child:
            'In a big workshop, every workbench has its own little tool rack, and there is one giant tool wall for the whole building. When a worker says "hand me the wrench", they mean the one on their own rack. Only if their rack has no wrench does someone jog to the big wall. Closest rack wins!',
          highschool:
            'A factory resolves tool names the way a language resolves variable names: check the station’s own rack first (local scope), then the shared crib (outer scope). "The wrench" means the nearest one, so a station’s wrench shadows the crib’s. Racks are cleared at shift change (locals die at scope exit) while the crib persists, and two stations can both have "the wrench" without any confusion, which is precisely why functions can reuse variable names safely.',
          undergrad:
            'Nearest-rack-first is lexical scoping’s lookup rule, and the factory makes each consequence concrete: shadowing (the station wrench hides the crib wrench, occasionally surprising the worker who wanted the good one), lifetime (rack cleared per shift, stack frame per call), and closures as the interesting case: a portable job kit packed from a station’s rack keeps those tools alive after the shift ends. Checkout logs at the crib are the discipline story: shared tools that anyone may take and modify are shared mutable state, and the crib’s sign-out sheet is the synchronization globals eventually require.',
          adult:
            'Factories keep tools at the nearest bench and share the rest from a central crib, and code organizes its data identically: local by default, shared only when genuinely needed. The payoff is containment: a bench mess disrupts one worker, a crib mess disrupts the plant. When engineers grumble that "everything reaches into the shared config", they are describing a shop where every job requires a trip to the crib, and every crib mistake is everyone’s morning.',
        },
      },
      {
        id: 'scope--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Two Main Streets, no confusion',
        maps: [
          { code: 'same name, different scopes', analog: 'a Main Street in every district' },
          { code: 'name resolution', analog: '"Main Street" means the one in your district' },
          { code: 'qualified name', analog: 'the full address that names the district too' },
          { code: 'namespace', analog: 'the district that keeps names from colliding' },
        ],
        text: {
          child:
            'Lots of towns have a Main Street, and one city can have several, one in each neighborhood! Nobody gets lost, because "meet me on Main Street" means the one in your own neighborhood. If you mean a different one, you say the neighborhood’s name too. Neighborhoods let the same street name be used again and again.',
          highschool:
            'Street naming shows how scope prevents collisions: every district may have its own Main Street, and a bare "Main Street" resolves to the nearest one. Naming the district too ("Main Street, Riverside") is a qualified name that reaches a farther scope on purpose. Programs are the same city: every function can have its own "count", bare names resolve locally, and qualified names (module.count) reach outside deliberately.',
          undergrad:
            'Districts are namespaces: they partition the naming universe so identical names coexist, resolution is innermost-district-first, and full addresses are qualified identifiers that make resolution explicit. This scales exactly like software: city/district/street mirrors package/module/name, and "import Riverside.Main as RMain" is street signage for disambiguation. The failure mode is instructive too: a city with one flat namespace either forbids reuse (every street name unique citywide, the C-library prefix convention) or invites deliveries to the wrong Main Street, which is the collision bug namespaces exist to prevent.',
          adult:
            'Cities reuse street names across districts because context disambiguates, and software reuses names across modules the same way: a bare name means the local one, a fully qualified name reaches elsewhere on purpose. This is why huge codebases with thousands of contributors do not collapse into naming chaos. When integration goes wrong anyway, it is usually a delivery to the wrong Main Street: two things with the same short name, and a reference that trusted context it did not have.',
        },
      },
    ],
  },
  {
    id: 'abstraction',
    name: 'Abstraction',
    tagline: 'Using a simple control surface without knowing the machinery underneath.',
    analogies: [
      {
        id: 'abstraction--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'Pedals, wheel, done',
        maps: [
          { code: 'the interface', analog: 'pedals, wheel, indicator stalk' },
          { code: 'the implementation', analog: 'combustion or electric machinery underneath' },
          { code: 'swap implementations', analog: 'rent any car and drive it immediately' },
          { code: 'leaky abstraction', analog: 'a clutch that stalls: the machinery pokes through' },
        ],
        text: {
          child:
            'Every car you meet has the same controls: a wheel to steer, one pedal to go, one to stop. Under the hood, cars are wildly different, some burn fuel, some run on batteries, but the driver does not have to care. Learn the pedals once and you can drive almost anything. That is the trick!',
          highschool:
            'Driving runs on an abstraction: the pedals and wheel are the interface, the machinery is the implementation, and the whole point is that they are independent. Swap combustion for electric and the driver’s skills transfer untouched. A stalling clutch breaks the spell: suddenly you must understand the machinery to operate the surface. Programmers call that a leaky abstraction, and it is the complaint behind "I should not need to know how this works to use it".',
          undergrad:
            'The pedal/engine split is the interface/implementation boundary with its economics attached: n drivers times m engine designs would be n times m trainings without the standard controls, and is n plus m with them, the same multiplication APIs collapse. Substitutability is rent-a-car Liskov: any implementation honoring the pedal contract can stand in. And leaks are where the concept earns its keep: regenerative braking that feels different, a manual transmission demanding engine knowledge, are implementation details escaping through the interface, the exact phenomenon Spolsky’s law of leaky abstractions names in software.',
          adult:
            'Cars are the proof that good interfaces scale: billions of drivers, radically different machinery, one set of controls. Software teams chase the same goal, a surface simple enough that users and other teams never need the internals. The recurring cost is the leak: when the machinery pokes through (an error message full of internals, a feature that behaves differently "because of how it works underneath"), users are suddenly mechanics, and that is the moment abstractions get redesigned.',
        },
      },
      {
        id: 'abstraction--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'The dial says 180, the oven obeys',
        maps: [
          { code: 'the abstraction', analog: 'the temperature dial' },
          { code: 'hidden machinery', analog: 'elements, thermostats, duty cycles' },
          { code: 'building on abstractions', analog: 'recipes written against the dial' },
          { code: 'abstraction layers', analog: 'recipe on oven on thermostat on physics' },
        ],
        text: {
          child:
            'A recipe says "bake at 180" and you just turn the dial. You do not manage the heating coils or measure the flames; the oven handles all of that behind its one little knob. Recipes can be short and friendly exactly because the oven hides so much work under the dial!',
          highschool:
            'The oven dial is an abstraction: one control standing in for heating elements, thermostats, and cycling logic you never see. Recipes are written against the dial, not the machinery, which is why one recipe works in a million different ovens. Code stacks the same way: your program calls "save the file", which hides file systems, which hide disks, and every layer lets the one above stay short and readable.',
          undergrad:
            'The dial defines a contract (hold 180) and hides a control system (elements, sensors, hysteresis), which makes it a textbook abstraction layer: recipes program against the contract, implementations vary freely beneath it. Stacking is the real lesson: recipe over dial over thermostat over physics mirrors application over runtime over OS over hardware, and each layer’s guarantees are the next layer’s primitives. The leaks are also faithful: hot spots and slow preheat are implementation details violating the contract, and the experienced baker’s workarounds (rotate the tray) are the special-case code that accumulates around every imperfect abstraction.',
          adult:
            'A recipe can say "bake at 180" only because the oven hides a machine behind a dial, and all of computing is built from exactly such dials stacked on dials. This is how small teams ship big things: each layer trusts the one below and exposes something simpler above. The management corollary: when a layer’s promise gets unreliable (the oven that runs hot), everyone above it starts writing workarounds, and that spreading scar tissue is the real cost of a broken abstraction.',
        },
      },
      {
        id: 'abstraction--music',
        domain: 'music',
        domainLabel: 'Music',
        title: 'Play G major, any way you like',
        maps: [
          { code: 'the abstract operation', analog: 'the chord symbol on the lead sheet' },
          { code: 'implementations', analog: 'voicings and fingerings per instrument' },
          { code: 'one interface, many implementations', analog: 'any band can play the same sheet' },
          { code: 'choosing the level', analog: 'chord symbols vs full notation vs tab' },
        ],
        text: {
          child:
            'A songbook might just say "G" over the words, and every musician knows what to do: the guitarist grabs a chord shape, the pianist presses her own group of keys, and it all sounds right together. One little letter, and each player turns it into their own fingers’ version of the same idea!',
          highschool:
            'A chord symbol is an abstraction: "G major" names a harmonic idea without dictating instrument, fingering, or voicing, so one lead sheet serves any band. Full notation pins down every note; tab pins down every finger. Choosing between them is choosing an abstraction level, and code makes the same choice constantly: describe what you want (sort this list) or spell out every step (compare, swap, repeat).',
          undergrad:
            'Chord symbols are declarative interfaces: they specify the what (harmony) and delegate the how (voicing) to each implementation, which is one symbol, many realizations: polymorphism in four beats a bar. The notation spectrum, chord symbol to staff notation to tablature, is the abstraction ladder from declarative to imperative to machine-specific, and jazz comping over a lead sheet is late binding: the realization chosen at run time, per player, per pass. Arrangement disputes are contract disputes: when the bandleader wants a specific voicing, the abstraction was too loose for the requirement, the same negotiation as tightening an API spec.',
          adult:
            'A lead sheet runs a whole band on one-letter instructions because it says what to play, never how: each musician supplies their own how. High-level software works identically, and the productivity gain is the same order of magnitude as writing "G" instead of eleven notes. The tradeoff is control: when the arrangement must sound one exact way, someone writes out the full score, which in software is the low-level rewrite reserved for the passages where every detail pays rent.',
        },
      },
    ],
  },
  {
    id: 'regex',
    name: 'Regular expressions',
    tagline: 'Describing a text pattern once, then matching everything that fits it.',
    analogies: [
      {
        id: 'regex--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'The sorting rule, not the address list',
        maps: [
          { code: 'the pattern', analog: '"anything starting 981.." routes to this bin' },
          { code: 'wildcards', analog: 'the dots standing for any digit' },
          { code: 'a match', analog: 'an envelope the rule accepts' },
          { code: 'too-loose pattern', analog: 'a greedy rule that swallows the wrong mail' },
        ],
        text: {
          child:
            'The mail sorter does not memorize every address in the city. There is a rule instead: "any code starting with 981 goes in this bin." The 981 part must match exactly, and the last digits can be anything. One little rule sorts thousands of different envelopes. Rules with blanks in them are mighty!',
          highschool:
            'Postal sorting runs on patterns: "981##" fixes a prefix and wildcards the rest, so one rule handles every matching address, which is exactly what a regular expression does for text: describe the shape once (three digits, a dash, four digits) and match everything fitting it. The craft is precision: a rule too loose swallows mail meant elsewhere, a rule too tight bounces valid envelopes, the same two failure modes every regex has.',
          undergrad:
            'Sorting rules are regexes over addresses: literals (981), character classes (any digit), quantifiers (four more of them), with acceptance meaning "route here". The precision failures generalize: over-broad patterns are false positives (greedy matching taking more than intended is the classic), over-narrow are false negatives, and rule precedence when multiple bins match is alternation order. The theory peeks through the mail slot too: these rules recognize regular languages, and the famous "do not parse HTML with regex" advice is the observation that nested structure needs a stronger machine than a sorting bin.',
          adult:
            'A regex is a mail-sorting rule for text: describe the shape of what you want (a date, a phone number, an order ID) and one rule processes millions of lines. Teams use them everywhere from search to validation. The operational warning matches the mailroom: a slightly loose rule quietly misroutes for months, so treat patterns like sorting rules, tested on the weird envelopes, not just the tidy ones.',
        },
      },
      {
        id: 'regex--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'Sm?th finds Smith and Smyth',
        maps: [
          { code: 'wildcard ?', analog: 'one unknown letter in the name' },
          { code: 'wildcard *', analog: 'any ending: bio* finds biology and biography' },
          { code: 'the result set', analog: 'every title the pattern accepts' },
          { code: 'anchors', analog: 'matching at the start of the title only' },
        ],
        text: {
          child:
            'Cannot remember if the author is Smith or Smyth? Type Sm?th, and the question mark means "one mystery letter here." The catalog finds both! Type bio and a star, and everything starting with bio pours out: biology, biography, bionics. You describe the part you know and let symbols hold the parts you do not.',
          highschool:
            'Catalog wildcards are baby regexes: ? holds one unknown character (Sm?th matches Smith and Smyth), * holds any tail (bio* matches biology and biography). Full regular expressions extend the same idea with repetition counts, alternatives, and anchors that pin a match to the start or end. The librarian’s skill transfers directly: describe exactly what you know, mark precisely what you do not, and check what the query dragged in.',
          undergrad:
            'The catalog teaches regex semantics as search: patterns denote sets of strings (Sm?th denotes exactly {Smith, Smyth, Smoth...}), unanchored patterns match anywhere, anchors (^bio) restrict position, and the dragged-in surprises (bio* returning "biopsy") are the specificity errors regexes inherit at scale. Implementation reality shows here too: the catalog precomputes indexes for prefix queries, which is why bio* is fast and *ology is slow, the same leading-wildcard penalty databases document, and a reminder that a pattern’s cost depends on the machine answering it, catastrophic backtracking included.',
          adult:
            'Wildcard search in a catalog is the gentle version of a tool programmers use constantly: describe a text shape, retrieve everything matching. It powers find-and-replace across a million files and log searches during an outage. The practiced habit is inspecting what came back: bio* fetches biopsy along with biology, and the pattern that quietly matches too much is the one that edits, deletes, or alerts on the wrong things later.',
        },
      },
      {
        id: 'regex--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'Four letters, shaped _A_E',
        maps: [
          { code: 'the pattern', analog: 'the crossword slot: _A_E' },
          { code: 'candidate matches', analog: 'CAKE, LANE, MAZE, GATE...' },
          { code: 'constraints intersecting', analog: 'the crossing word narrows the blanks' },
          { code: 'no match exists', analog: 'a slot no legal word satisfies' },
        ],
        text: {
          child:
            'A crossword slot with _A_E is a puzzle shape: four letters, A second, E last. CAKE fits! So do LANE and MAZE and GATE. The blanks can be anything; the fixed letters are strict. You are matching words to a pattern, which is exactly the game computers play when they hunt through text.',
          highschool:
            'A crossword slot is a pattern: _A_E fixes two letters and leaves two free, and solving means generating strings that satisfy it: precisely a regex match in reverse. Crossing words are intersecting constraints, each narrowing the other’s candidates, the way combined filters narrow search results. And a slot no dictionary word satisfies is a pattern with no match, the empty result that tells you a constraint upstream is wrong.',
          undergrad:
            'Crosswords run regex matching in both directions: checking CAKE against _A_E is acceptance, listing all fitting words is enumerating the pattern’s language, and crossing slots are a constraint satisfaction problem where each regex prunes the others’ candidates, the same propagation constraint solvers formalize. Scrabble racks add character-class thinking (words drawable from these seven tiles), and the unsatisfiable slot is the diagnostic gem: an empty match set almost always indicts the pattern or an upstream constraint, in puzzles and in production log queries alike.',
          adult:
            'Anyone who has stared at _A_E in a crossword has done pattern matching: fixed parts strict, blanks free, candidates checked against the shape. Text tools industrialize that skill, matching shapes like "three digits, dash, four digits" across oceans of text. The crossword also carries the diagnostic lesson: when nothing fits the slot, the slot is usually wrong, and when a search returns nothing, seasoned engineers suspect the pattern before the data.',
        },
      },
    ],
  },
  {
    id: 'floating-point',
    name: 'Floating-point numbers',
    tagline: 'Why computers store decimals approximately, and where the rounding leaks out.',
    analogies: [
      {
        id: 'floating-point--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Thirds of dough, never exact',
        maps: [
          { code: 'representation error', analog: 'each "third" is only almost a third' },
          { code: 'error accumulation', analog: 'small misses compounding through the recipe' },
          { code: 'equality failing', analog: 'the three pieces never re-form the exact ball' },
          { code: 'tolerance comparison', analog: '"close enough to a third" is the honest test' },
        ],
        text: {
          child:
            'Split a ball of dough into three equal pieces by eye. Each piece is almost a third, but never perfectly. Squish them back together and the ball weighs a tiny bit different from what you would expect from "three perfect thirds". Kitchens live with almost-numbers, and so do computers!',
          highschool:
            'A third of dough by eye is close but never exact, and a computer’s decimals work the same way: 0.1 cannot be stored exactly in binary, only a very near miss, which is why 0.1 + 0.2 prints 0.30000000000000004. Each stored value is a near miss, and long chains of arithmetic let the misses accumulate, like a recipe of many eyeballed measurements drifting from the ideal.',
          undergrad:
            'The eyeballed third is floating-point in an apron: finite precision means most decimals are stored as nearest representable values (0.1 has no finite binary expansion, like 1/3 has no finite decimal one), each operation rounds again, and error compounds through computation. The kitchen also supplies the operative rules: never test a == b, test |a - b| < epsilon (the "close enough to a third" judgment); prefer summation orders that keep small crumbs from being swallowed by big lumps (catastrophic cancellation); and when exactness is mandatory, change units, integer grams instead of fractional kilograms, which is exactly the count-cents strategy of financial code.',
          adult:
            'Computers hold decimals the way bakers hold thirds: extremely close, never exact, and the tiny misses add up across a long recipe. That is why a spreadsheet occasionally shows 0.30000000000000004 and why "the totals differ by a penny" is a rite of passage. The two proven remedies are the kitchen’s: compare with a tolerance rather than demanding perfection, and for money, count whole cents so there is nothing to approximate.',
        },
      },
      {
        id: 'floating-point--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'A third off, rounded per line',
        maps: [
          { code: 'rounding per operation', analog: 'each line item rounded to a cent' },
          { code: 'accumulated discrepancy', analog: 'the receipt total off by a penny' },
          { code: 'order dependence', analog: 'discount-then-tax vs tax-then-discount' },
          { code: 'integer cents fix', analog: 'tills that count cents, never fractions' },
        ],
        text: {
          child:
            'Three snacks, each "a third off". A third of the price is not always a tidy number of cents, so the register rounds each line a tiny bit. Add the three lines and the total can be one cent different from what a calculator says! Not magic, not cheating: just little roundings piling up.',
          highschool:
            'Receipts show rounding arithmetic in public: each discounted line is rounded to a whole cent, and three rounded lines can sum a penny away from the unrounded total. Computers do this with every decimal operation, storing the nearest representable value, so long calculations drift. It is also order-dependent: discount-then-tax and tax-then-discount can round differently, just as the order of operations changes floating-point results, which is why financial rules specify the sequence.',
          undergrad:
            'The penny-off receipt is floating-point behavior at cent precision: rounding after each operation, error visible in aggregates, and non-associativity as a legal matter, (a + b) + c differing from a + (b + c) is why tax law literally prescribes evaluation order. The professional resolutions map one-to-one: fixed-point/decimal types (count integer cents) eliminate representation error for money; documented rounding modes (half-up, banker’s) make drift deterministic; and reconciliation reports tolerating known bounded differences are epsilon comparisons wearing a green eyeshade.',
          adult:
            'Every business has met the receipt that is a penny off: per-line rounding, summed. Computers face the same arithmetic in everything decimal, which produces two standing policies wherever money moves: amounts are counted in whole cents (nothing to approximate) and the rounding order is written into the spec, not left to chance. When finance and engineering argue about a penny, they are arguing about which line rounded when, and the fix is policy, not heroics.',
        },
      },
      {
        id: 'floating-point--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Copying three decimals each step',
        maps: [
          { code: 'finite precision', analog: 'keeping only three decimal places' },
          { code: 'error propagation', analog: 'each step inherits the previous truncation' },
          { code: 'two "right" answers differing', analog: 'classmates diverging by step order' },
          { code: 'epsilon comparison', analog: 'the teacher accepts answers within 0.01' },
        ],
        text: {
          child:
            'Do a long math problem, but keep only three decimal places at every step. Your friend does the same steps in a different order. You both work carefully, and your final answers still come out a tiny bit different! Neither of you made a mistake. The little cut-offs just piled up differently.',
          highschool:
            'Keep three decimals at each step of a long calculation and the truncations propagate: your result drifts, and a classmate ordering the steps differently drifts differently, both "correct". Computers do this at 15-17 significant digits: far finer, same phenomenon. It is why a sensible teacher accepts answers within 0.01, and why sensible programs compare computed decimals with a tolerance instead of demanding the exact bits.',
          undergrad:
            'Fixed-decimals arithmetic is a manual float simulator: truncation is rounding to representable values, step-order divergence is non-associativity, and the drift is error propagation that numerical analysis makes rigorous (condition numbers say how much a problem amplifies input error; stability says how much an algorithm adds). The teacher’s 0.01 window is epsilon comparison, and the deeper habit is the field’s: track how much error your pipeline can introduce, because "double precision" bounds each step’s error, not your algorithm’s, as anyone who has subtracted two nearly equal large numbers has discovered.',
          adult:
            'Give two careful people a long calculation and three decimal places per step, and their answers will differ slightly, both defensibly. Computers are those people at superhuman precision but the same principle, which is why identical-looking analyses can disagree in the last digits and why comparing results demands an agreed tolerance. Teams burned by this write it into contracts: results match within a stated margin, because bit-for-bit equality of long decimal computations was never on the menu.',
        },
      },
    ],
  },
  {
    id: 'compiler-interpreter',
    name: 'Compilers and interpreters',
    tagline: 'Translating code for the machine: all at once ahead of time, or line by line as it runs.',
    analogies: [
      {
        id: 'compiler-interpreter--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'Live interpreter or advance translation',
        maps: [
          { code: 'interpreter', analog: 'the live interpreter at the meeting' },
          { code: 'compiler', analog: 'translating the whole speech beforehand' },
          { code: 'compile error', analog: 'the translator flags nonsense before delivery' },
          { code: 'runtime error', analog: 'the live session hits nonsense mid-sentence' },
        ],
        text: {
          child:
            'Two ways to give a speech in another language: bring a person who translates as you talk, or have the whole speech translated the night before. The live way starts instantly but goes half-speed, sentence by sentence. The night-before way takes preparation, and then the speech flows perfectly fast. Computers run code both ways!',
          highschool:
            'Language translation splits exactly like code execution: an interpreter translates live (start immediately, pay the translation cost every sentence, every time) while a compiler translates the whole text in advance (pay once, then deliver at full speed). Timing of errors differs too: the advance translator catches nonsense at the desk (compile errors), the live session discovers it mid-sentence in front of everyone (runtime errors). Python leans live; C leans night-before.',
          undergrad:
            'The two translation modes carry the real tradeoffs: interpretation gives fast iteration and per-execution cost; compilation gives up-front analysis (type checking as the translator interrogating ambiguous phrasing at the desk) and native-speed delivery. The modern middle grounds fit the metaphor precisely: bytecode is translating once into a simpler pidgin that a fast interpreter reads, and JIT compilation is the live interpreter noticing you repeat a paragraph nightly and pre-translating just that paragraph, why hot loops in JIT-ed languages approach compiled speed. "Interpreted language" is really a property of the implementation, as the existence of compiled Python attests.',
          adult:
            'Organizations translate speeches two ways, live or in advance, trading startup time against delivery speed and early error-catching, and programming languages make the identical trade. It explains everyday engineering facts: why some tools start instantly but run slower, why others build for minutes then fly, and why some mistakes surface on the developer’s desk while others surface in front of the audience. Most modern platforms blend both, translating the popular paragraphs in advance.',
        },
      },
      {
        id: 'compiler-interpreter--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'The translated edition on the shelf',
        maps: [
          { code: 'source code', analog: 'the novel in the original language' },
          { code: 'compiled binary', analog: 'the translated edition, printed once' },
          { code: 'interpreting', analog: 'reading with a dictionary in hand' },
          { code: 'recompilation', analog: 'a new edition for each revision of the novel' },
        ],
        text: {
          child:
            'A famous book gets translated once, printed, and then thousands of people read the translation at full speed. Or you could read the original with a dictionary in your lap, looking up words as you go: you can start right now, but every page is slow, and it is slow again for the next reader. One translation, many happy readers!',
          highschool:
            'A translated edition is a compiled program: the hard translation work happens once, then every reader (every run) proceeds at full speed. Dictionary-in-lap reading is interpretation: zero wait to start, cost paid on every page, by every reader, every time. The catch mirrors software exactly: when the author revises the original, the printed translation is stale until a new edition ships, which is recompilation, and readers of the old edition are running the old binary.',
          undergrad:
            'The edition model sharpens distribution and staleness: compile once, run many amortizes translation across executions, which is why hot paths and shipped products favor compilation, while the dictionary reader wins for exploration and one-off scripts. Editions also make artifacts concrete: the printed translation is the platform-specific binary (a French edition serves French readers; an ARM binary serves ARM), translation notes are debug symbols, and a hurried edition that mistranslates idioms is a miscompilation, rare and famously confusing. Cross-compilation is translating into a language the translator does not personally read fluently, with exactly the testing implications you would expect.',
          adult:
            'Publishing explains the two execution models cleanly: translate a book once and everyone reads fast, or hand each reader a dictionary and let them start immediately but slowly. Software products ship "translated editions" (built, optimized, per-platform), while quick internal scripts are read with the dictionary. The operational echo is edition management: every revision of the original needs retranslation, and users on old editions is a version-skew problem publishers and platform teams share.',
        },
      },
      {
        id: 'compiler-interpreter--music',
        domain: 'music',
        domainLabel: 'Music',
        title: 'Arranged in advance or sight-read live',
        maps: [
          { code: 'compilation', analog: 'the arranger writing out every part beforehand' },
          { code: 'compile-time checks', analog: 'wrong notes caught on paper, before rehearsal' },
          { code: 'interpretation', analog: 'the band sight-reading a lead sheet live' },
          { code: 'optimization', analog: 'the arranger tailoring parts to each player' },
        ],
        text: {
          child:
            'One band gets its music written out ahead of time: an arranger prepares every player’s part, fixes the wrong notes on paper, and the concert flows. Another band just reads a simple sheet and makes it up as they play: they can start instantly, and sometimes a clunker sneaks out in front of everyone. Both ways make music!',
          highschool:
            'An arranged performance is compiled: the arranger translates the tune into exact parts beforehand, catching wrong notes on paper (compile-time errors) and tailoring passages to each player (optimization). Sight-reading a lead sheet is interpreted: instant start, flexible, and mistakes happen live (runtime errors). The rehearsal-versus-jam-session split maps to real engineering choices: polish ahead for the big concert, improvise for the Tuesday jam.',
          undergrad:
            'Arranging is compilation with its pipeline visible: analysis of the tune (parsing), part-writing per instrument (code generation for a target), transposition for the horns (platform specifics), and paper-stage error checking (static analysis: the impossible low note flagged before anyone plays it). Sight-reading is interpretation with dynamic dispatch: each symbol resolved at performance time. The band that jams a tune nightly and gradually locks in worked-out parts is a tracing JIT, hot sections crystallizing into arrangements, and the one-off gig that is never repeated is the script where arranging would be wasted effort.',
          adult:
            'Bands choose between arranging in advance (slow preparation, flawless fast delivery, errors caught on paper) and sight-reading live (instant start, flexible, mistakes in public), and software runs on the same choice. Production systems are the arranged concert; quick internal tools are the jam. Mature platforms do what working bands do: improvise new material cheaply, then write out the parts for whatever gets played every night.',
        },
      },
    ],
  },
];
