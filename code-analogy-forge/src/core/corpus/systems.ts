import type { Concept } from '../types';

export const systems: Concept[] = [
  {
    id: 'closure',
    name: 'Closures',
    tagline: 'A function that carries the variables from the place it was created.',
    analogies: [
      {
        id: 'closure--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'A suitcase packed at home',
        maps: [
          { code: 'the closure', analog: 'the traveler plus their suitcase' },
          { code: 'captured variables', analog: 'what was packed before leaving home' },
          { code: 'calling the closure later', analog: 'opening the suitcase abroad' },
          { code: 'two closures, two environments', analog: 'two travelers, two suitcases' },
        ],
        text: {
          child:
            'A closure is like a traveler with a suitcase. They packed it at home, and wherever they go, whatever they packed goes too. Even far away, they can open the suitcase and everything from home is still inside.',
          highschool:
            'A closure is a function that travels with a suitcase packed where it was created. The suitcase holds the variables that were around at the time, and opening it later, anywhere, finds them still there. Two travelers packing in the same house still carry separate suitcases: two closures made by the same code each keep their own copies.',
          undergrad:
            'The suitcase is the captured environment: the closure carries bindings from its defining scope, and they stay alive as long as the closure does, even after the function that created them has returned. That is the part that surprises people, a local variable outliving its function, and the suitcase makes it plain: home is long behind you, the contents are still in hand. Two calls to the same factory pack two suitcases, which is exactly why two counters made by makeCounter() do not share a count.',
          adult:
            'A closure is a worker who packed a suitcase before leaving the office: wherever the work happens later, the packed context comes along. Software uses this constantly, handing out little tasks that remember the settings they were configured with. It is why a button click "knows" which row it belongs to long after the screen that created it moved on.',
        },
      },
      {
        id: 'closure--music',
        domain: 'music',
        domainLabel: 'Music',
        title: 'A busker with a backing track',
        maps: [
          { code: 'the function body', analog: 'the live performance' },
          { code: 'captured variables', analog: 'the backing track recorded at home' },
          { code: 'calling in a new scope', analog: 'performing on any street corner' },
          { code: 'mutating a captured variable', analog: 're-recording the track between shows' },
        ],
        text: {
          child:
            'A closure is like a street musician with a backing track. The track was recorded at home, but it plays from the speaker wherever the musician goes. The song always has that home recording inside it, no matter which corner they play on.',
          highschool:
            'A busker performing over a backing track is a closure: the live playing is the function body, and the track, recorded back home, is the environment it captured. Every performance anywhere in the city carries that recording. If the musician re-records the track between shows, every later performance uses the new version: captured variables are shared with their origin, not photographed once.',
          undergrad:
            'The backing track separates the two halves of a closure: code (the live part) and environment (the recording made in the defining scope). The key subtlety is that the track is a reference, not a snapshot: re-record it (mutate the captured variable) and every future call hears the change. That is precisely the classic loop-variable bug, ten performances all wired to one track that kept changing, and why capturing a fresh binding per iteration fixes it.',
          adult:
            'A closure is a performer with a backing track recorded at home: the live act happens anywhere, but it always plays over that carried context. Software ships behavior around this way, small functions that bring their configuration with them. The one management-level caveat: the track is shared, not copied, so changing the original changes every act that carries it.',
        },
      },
      {
        id: 'closure--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'The repair tech and their toolbox',
        maps: [
          { code: 'the closure', analog: 'the technician with their own toolbox' },
          { code: 'captured variables', analog: 'the tools stocked back at the shop' },
          { code: 'invocation at a call site', analog: 'a job at some customer site' },
          { code: 'closure factory', analog: 'the shop equipping each tech separately' },
        ],
        text: {
          child:
            'A closure is like a repair person who brings their own toolbox. The box was filled back at the shop, and at your house they open it and all the shop tools are right there. They never have to run back to the shop mid-job.',
          highschool:
            'A field technician is a closure: the work they do is the function, and the toolbox stocked at the shop is the environment they captured. On site, they reach into the box instead of asking the customer for tools, just as a closure reads its captured variables instead of expecting the caller to pass everything in. Each tech leaves the shop with their own box: separate closures, separate state.',
          undergrad:
            'The toolbox model explains why closures make good callbacks: the call site (customer) only schedules the job; the needed context rides along in the box, captured at creation in the shop (the defining scope). The shop equipping many techs is a closure factory, and each box being separate is per-instance captured state. A tool checked out from a shared shop crib instead of the personal box is your captured shared mutable state, and two techs fighting over it is the usual concurrency story.',
          adult:
            'A closure is a repair tech who arrives with a toolbox stocked back at the shop: the job site provides nothing, and the work still gets done. Software schedules millions of little jobs this way, each carrying its own context. It is why "call me back later with this exact setup" works at all.',
        },
      },
    ],
  },
  {
    id: 'pointer-reference',
    name: 'Pointers and references',
    tagline: 'A value that says where something lives, instead of being the thing itself.',
    analogies: [
      {
        id: 'pointer-reference--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'An address on a slip of paper',
        maps: [
          { code: 'pointer / reference', analog: 'the slip with an address on it' },
          { code: 'the pointed-to object', analog: 'the actual house' },
          { code: 'copying the pointer', analog: 'two slips, same address, one house' },
          { code: 'dangling pointer', analog: 'a slip for a demolished house' },
        ],
        text: {
          child:
            'A pointer is like a piece of paper with a house address on it. The paper is not the house! If you copy the paper, you have two papers, but still only one house. Whatever happens at the house, both papers lead to it.',
          highschool:
            'A pointer holds an address, not the thing: the slip of paper versus the house. Copy the slip and both copies lead to the same house, so painting the door through one slip is visible through the other. That is the difference between copying a reference and copying the object, and it explains the classic surprise where changing "a copy" changes the original too.',
          undergrad:
            'The slip is the pointer, the house is the heap object, and the two-slips-one-house picture is aliasing, the root of most reference-semantics bugs. Dereferencing is walking to the address; a blank slip is null (walking nowhere crashes); a slip for a demolished house is a dangling pointer, and building something new on that lot before you notice is a use-after-free. A photocopy of the house itself, not the slip, is your deep copy, and the cost difference between copying slips and copying houses is why references exist.',
          adult:
            'A pointer is an address on a slip of paper: cheap to copy, but every copy leads to the same one house. Software passes addresses around instead of hauling the data, which is fast, with one recurring gotcha: edit "your copy" and everyone holding the same address sees the edit. Half of all mysterious data corruption stories are two slips, one house.',
        },
      },
      {
        id: 'pointer-reference--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'A call slip, not the book',
        maps: [
          { code: 'reference', analog: 'the call slip with a shelf location' },
          { code: 'dereferencing', analog: 'walking to the shelf and opening the book' },
          { code: 'deep copy', analog: 'photocopying the whole book' },
          { code: 'null reference', analog: 'a call slip with no location filled in' },
        ],
        text: {
          child:
            'A reference is like a little card that says which shelf a book lives on. The card fits in your pocket; the book does not. When you want to actually read, you follow the card to the shelf. Ten people can carry cards for the same one book.',
          highschool:
            'A library call slip is a reference: it names the book’s location and is much cheaper to carry than the book. Following the slip to the shelf is dereferencing. Ten readers can hold slips for the same book, and notes written in its margins are seen by all of them; only a full photocopy (a deep copy) gives someone a private version.',
          undergrad:
            'The call slip makes reference semantics cheap to reason about: passing the slip is passing by reference (O(1), shared margins and all), photocopying is a deep copy (O(size), private), and a slip with no location is null, discovered only when someone tries to walk to the shelf. The reading room keeping popular books out until nobody holds a slip anymore is reference counting, and a slip that outlives a discarded book is the dangling reference the garbage collector exists to prevent.',
          adult:
            'A reference is a call slip: it tells you where the book is instead of being the book. Systems hand around slips because copying whole books is slow and the margins should stay shared. The tradeoff shows up as the two classic surprises: an edit everyone sees at once, and a slip pointing at a book that was thrown away.',
        },
      },
      {
        id: 'pointer-reference--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'One locker, two notebooks',
        maps: [
          { code: 'two references, one object', analog: 'locker 217 written in two notebooks' },
          { code: 'mutation through one alias', analog: 'one student swaps the locker contents' },
          { code: 'the surprise read', analog: 'the other student finds them changed' },
          { code: 'value copy instead', analog: 'each student getting their own locker' },
        ],
        text: {
          child:
            'Imagine two friends who both wrote "locker 217" in their notebooks. There is one locker, two notes about it. If one friend puts a soccer ball inside, the other friend opens the locker and finds a soccer ball, even though they never put it there.',
          highschool:
            'Two notebooks both saying "locker 217" are two references to one object. Neither notebook holds the stuff; both point to the same locker, so a swap made through one note is discovered through the other. That is aliasing, and it is exactly what happens when two variables reference one list: append through either and both "see" it.',
          undergrad:
            'The shared locker is the aliasing hazard in miniature: b = a copies the locker number, not the locker, so b.append(...) mutates the object a also names. The fix vocabulary maps cleanly: assign each student their own locker with the same contents (a copy), agree the locker is display-only (immutability), or accept sharing and coordinate who may change it (ownership discipline). Languages differ mainly in which of these they make the default.',
          adult:
            'Two people with the same locker number written down share one locker: what either one changes, the other finds. Software variables often work this way, holding the number rather than the contents, which saves enormous copying but means "I changed my version" is sometimes false. Knowing whether you hold the locker or just its number is half of debugging.',
        },
      },
    ],
  },
  {
    id: 'exception-handling',
    name: 'Exceptions (try / catch)',
    tagline: 'Keeping the happy path clean by handling failures in one declared place.',
    analogies: [
      {
        id: 'exception-handling--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'The kitchen fire plan',
        maps: [
          { code: 'try block', analog: 'cooking dinner as planned' },
          { code: 'throwing an exception', analog: 'the pan catching fire' },
          { code: 'catch block', analog: 'the extinguisher plan by the stove' },
          { code: 'finally', analog: 'the gas gets turned off either way' },
        ],
        text: {
          child:
            'A try/catch is like cooking with a fire plan. You cook dinner the normal way, but there is an extinguisher by the stove just in case. If a pan flares up, you do not invent a plan mid-fire: you grab the extinguisher you set out earlier. And whatever happens, you turn off the gas at the end.',
          highschool:
            'Cooking with a fire plan is exception handling: the recipe is the try block, the flare-up is the exception, and the extinguisher you positioned in advance is the catch. The plan does not prevent fires; it decides what happens when one starts, written while everyone was calm. The finally block is turning the gas off: it happens whether dinner succeeded or burned.',
          undergrad:
            'The fire plan separates the recipe from disaster handling, which is the entire design argument for exceptions over error codes: the happy path reads as a recipe, not as a fire drill after every step. Throwing is the flare-up abandoning the recipe mid-step; the search up the call stack for a handler is shouting to whoever in the house has the extinguisher; nobody having one is an uncaught exception, and the house burns down with a stack trace. finally is the gas valve: cleanup that must run on both paths, the same job RAII and with-blocks formalize.',
          adult:
            'Exception handling is a kitchen fire plan: the plan is written in calm, sits next to the stove, and only runs when something actually flares up. Well-built software separates "how it works" from "what to do when it fails" exactly this way. The systems that page people at 3am are usually the ones that wrote no plan, or wrote one that just says "ignore the smoke".',
        },
      },
      {
        id: 'exception-handling--sports',
        domain: 'sports',
        domainLabel: 'Sports',
        title: 'The gymnast’s spotter',
        maps: [
          { code: 'try block', analog: 'the routine, performed at full effort' },
          { code: 'exception', analog: 'the slip off the bar' },
          { code: 'catch block', analog: 'the spotter, positioned in advance' },
          { code: 'uncaught exception', analog: 'a slip with nobody standing there' },
        ],
        text: {
          child:
            'A try/catch is like a gymnast with a spotter. The gymnast does the whole routine, and the spotter just stands ready. Most days the spotter does nothing at all! But if the gymnast slips, the spotter catches them so a small slip does not become a big crash.',
          highschool:
            'The routine is the try block and the spotter is the catch: positioned before the routine starts, idle when everything works, decisive the moment something goes wrong. Note what the spotter does not do: they do not stop the slip, they stop the crash. Exceptions work the same way, turning "the whole program dies" into "this one attempt failed, recover and continue".',
          undergrad:
            'The spotter clarifies exception semantics: the catch is registered before the risky region runs, costs almost nothing while things go well, and converts an abrupt fall into a defined outcome. A slip in a move the spotter cannot reach falls through to the coach, then the gym staff: propagation up the call stack, handled by the nearest frame that declared it could. And a spotter who catches everything silently, including the injuries that needed a medic, is the catch-all block that swallows exceptions, the most common abuse of the mechanism.',
          adult:
            'Exception handling is the gymnast’s spotter: someone positioned in advance whose whole job is the moment things go wrong. Ninety-nine routines out of a hundred, they do nothing, and that idleness is not waste, it is the product. Software without spotters does not fail less; it just falls from full height.',
        },
      },
      {
        id: 'exception-handling--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'The rebooking desk',
        maps: [
          { code: 'exception', analog: 'the canceled flight' },
          { code: 'catch block', analog: 'the rebooking desk' },
          { code: 'propagation', analog: 'escalating from gate agent to airline hotline' },
          { code: 'exception message', analog: 'the reason printed on the cancellation notice' },
        ],
        text: {
          child:
            'A try/catch is like an airport with a help desk. Your plan is to fly at 3 o’clock, but if the flight is canceled, you do not just stand there: you go to the desk, and they find you a new flight. The cancellation is the problem; the desk is the plan for the problem.',
          highschool:
            'Air travel handles failures like code does: the itinerary is the try, the cancellation is the exception, and the rebooking desk is the catch. If the gate agent cannot fix it, you escalate to the airline hotline, then the travel agency: each level either handles the problem or passes it up, which is exactly how an exception climbs the call stack looking for a handler.',
          undergrad:
            'The cancellation notice carries structured information (flight, reason, time), like an exception object, and the escalation chain (gate agent, hotline, agency) is stack unwinding: each frame either handles or rethrows upward. Two design lessons live at the desk: handle at the level that has enough context to act (the gate agent can rebook, your seatmate cannot), and preserve the original notice when you escalate, because "something went wrong somewhere" (a swallowed cause) is what makes airline hotlines and stack traces equally useless.',
          adult:
            'Exceptions work like flight cancellations: a formal notice saying what failed and why, handed to a desk that exists specifically for the failure case. Good systems, like good airlines, decide in advance who handles which problems at which level. Bad ones make every failure the passenger’s problem, which in software reads as a raw error screen.',
        },
      },
    ],
  },
  {
    id: 'cache',
    name: 'Caching',
    tagline: 'Keeping a nearby copy of something expensive to fetch or compute.',
    analogies: [
      {
        id: 'cache--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'The pantry between you and the store',
        maps: [
          { code: 'slow source of truth', analog: 'the supermarket across town' },
          { code: 'the cache', analog: 'your pantry' },
          { code: 'cache hit / miss', analog: 'flour is in the pantry / a trip to the store' },
          { code: 'stale cache', analog: 'the milk expired while you were not looking' },
        ],
        text: {
          child:
            'A cache is like a pantry. The store has everything, but it is far away, so you keep the things you use a lot at home. Need flour? Check the pantry first. Only if it is empty do you make the long trip to the store, and you bring back extra for next time.',
          highschool:
            'The pantry is a cache for the supermarket: check the near, fast copy first (a hit), and only on a miss make the slow trip, restocking on the way back so the next lookup is fast. The catch is staleness: the milk in your pantry can expire, or the store version can change, and now your fast copy is wrong. Deciding when to distrust the pantry is the hard part of caching.',
          undergrad:
            'The pantry gives you the full cache vocabulary: hit and miss, fill on miss, limited shelf space forcing eviction (toss what you have not touched in months: LRU), and expiry dates as TTLs. It also explains the famous quote about the two hard problems: naming things aside, cache invalidation is knowing the store changed the recipe while your pantry still holds the old ingredient, and every layer of computing (CPU caches, browser caches, CDNs) is a pantry with exactly this problem.',
          adult:
            'A cache is a pantry: a nearby copy of what you use often, so most needs skip the trip across town. Nearly everything fast about computers is pantries stacked on pantries. The recurring failure is stale stock: the fast copy no longer matching the real thing, which is why "have you tried clearing the cache" fixes so many mysteries.',
        },
      },
      {
        id: 'cache--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'The pile on your desk',
        maps: [
          { code: 'backing store', analog: 'the stacks, floors away' },
          { code: 'the cache', analog: 'the dozen books on your desk' },
          { code: 'eviction policy', analog: 'which book goes back when the desk is full' },
          { code: 'working set', analog: 'the books this chapter actually needs' },
        ],
        text: {
          child:
            'A cache is like the pile of books on your desk. The library has thousands of books, but walking the aisles takes forever, so you keep the few you keep using right next to you. When the desk gets too full, the book you have not opened in the longest goes back.',
          highschool:
            'Your desk is a cache over the stacks: small, close, fast, and it holds only what you are actually using. When it fills, something must go back, and the natural choice, the book untouched longest, is the LRU eviction policy computers actually use. A well-chosen pile means you rarely leave your chair; that ratio of desk-finds to stack-trips is the hit rate.',
          undergrad:
            'The desk models the memory hierarchy honestly: tiny fast storage in front of huge slow storage, effective because access has locality, this chapter keeps citing the same dozen sources. Eviction is forced by capacity, LRU is "longest unopened goes back", and the set of books the current chapter needs is the working set: when it fits the desk you fly, when it does not you thrash, shuttling books back and forth on every paragraph. That cliff, working set versus cache size, is the same one your CPU falls off.',
          adult:
            'A cache is the pile on your desk versus the library stacks: keep the handful in constant use within reach, and only walk for the rest. Computers do this at every level, which is why the same machine feels instant on familiar work and sluggish on something new: the first pass is all stack-walking, filling the desk.',
        },
      },
      {
        id: 'cache--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'A sheet of worked answers',
        maps: [
          { code: 'expensive computation', analog: 'working a problem from scratch' },
          { code: 'memoization', analog: 'writing the answer down the first time' },
          { code: 'cache lookup', analog: 'checking the sheet before re-deriving' },
          { code: 'poisoned cache', analog: 'a wrong answer copied forever after' },
        ],
        text: {
          child:
            'A cache can be a sheet where you write answers you already worked out. The first time you figure out 12 times 12, it takes a while. You write "144" on your sheet, and every time after that, you just look: 144! Solve once, reuse forever.',
          highschool:
            'Keeping a sheet of worked answers is memoization, caching for computations: pay the full cost once, write the result down keyed by the question, and answer every repeat from the sheet. It only works because the same question always has the same answer; a "question" whose answer changes with the weather cannot be cached this way. And one wrong answer on the sheet is repeated confidently forever, which is the danger in miniature.',
          undergrad:
            'The answer sheet is memoization: a map from input to result, valid because the function is pure (same input, same output). It is also where caching meets algorithm design: memoized Fibonacci collapses an exponential tree of repeated subproblems to linear, and dynamic programming is just deciding to fill the sheet in a systematic order. The wrong-answer-copied-forever failure is cache poisoning, and "does this question really determine its answer?" is the purity check every @lru_cache deserves.',
          adult:
            'Caching computations is keeping a sheet of worked answers: derive once, look up thereafter. Enormous amounts of software speed come from this one trick. The two honest costs: the sheet only helps for questions whose answers do not change, and a wrong entry gets repeated with total confidence until someone audits the sheet.',
        },
      },
    ],
  },
  {
    id: 'threads-parallelism',
    name: 'Threads and parallelism',
    tagline: 'Several workers making progress at once, sharing the same memory.',
    analogies: [
      {
        id: 'threads-parallelism--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Many cooks, one kitchen',
        maps: [
          { code: 'threads', analog: 'the cooks' },
          { code: 'shared memory', analog: 'the one kitchen they all work in' },
          { code: 'race condition', analog: 'two cooks salting the same pot' },
          { code: 'lock / mutex', analog: 'only whoever holds the pot’s spoon may season it' },
        ],
        text: {
          child:
            'Threads are like several cooks in one kitchen. Dinner gets done much faster than with one cook, but they share everything: the stove, the pots, the salt. If two cooks each add salt to the same soup without telling each other, the soup is ruined, so good kitchens have rules about who touches what.',
          highschool:
            'A multithreaded program is a kitchen with several cooks: more hands, faster dinner, one shared kitchen. The trouble is the sharing: two cooks who each check the soup, decide it needs salt, and both add it, have just performed a race condition. The kitchen rule "only whoever holds this pot’s spoon may season it" is a lock, and dinner slowing down because everyone queues for the spoon is lock contention.',
          undergrad:
            'The kitchen is shared-memory concurrency: cooks are threads, the pantry and pots are shared state, and check-then-act on the same pot without coordination is the canonical data race (the double-salting is a lost update). The spoon rule is a mutex with its costs on display: contention serializes the kitchen, and two cooks each holding one pan the other needs, both waiting, is deadlock. The clean escapes are the real ones too: give cooks separate stations and combine plates at the pass (message passing, no shared pots), or make dishes nobody may alter after plating (immutability).',
          adult:
            'Parallel software is many cooks in one kitchen: real speedup, real coordination problems. The failures are kitchen failures: two people salting the same pot (conflicting updates), everyone queueing for one spoon (a bottleneck lock), two cooks each waiting for the other’s pan (deadlock, nothing moves). When engineers say something is "not thread-safe", they mean this dish has no spoon rule yet.',
        },
      },
      {
        id: 'threads-parallelism--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'Parallel lines, one shared crane',
        maps: [
          { code: 'threads / cores', analog: 'the parallel assembly lines' },
          { code: 'embarrassingly parallel work', analog: 'lines that never need each other' },
          { code: 'contention', analog: 'every line waiting on the one crane' },
          { code: 'Amdahl’s law', analog: 'the crane caps the speedup, however many lines you add' },
        ],
        text: {
          child:
            'Parallel work is like a factory with many assembly lines. Four lines build four times as many toys, as long as each line has everything it needs. But there is only one big crane, and when every line needs the crane at once, they all stand waiting for their turn.',
          highschool:
            'Assembly lines are threads: independent lines scale beautifully, four lines, four times the toys. The shared crane is where it breaks down: any step that all lines must take turns on makes them queue, and adding a fifth line just makes the crane queue longer. Speedup is decided by the crane, not by the number of lines: that is the shape of every parallel program.',
          undergrad:
            'The factory states Amdahl’s law physically: the parallel fraction (line work) scales with the number of lines, the serial fraction (the one crane) does not, and total speedup is capped by crane time no matter how many lines you fund. Lines that never touch the crane are embarrassingly parallel; the crane itself is a serialized critical section, and the engineering moves are the real ones: buy a second crane (finer-grained locking), redesign parts so lifting is rarely needed (reduce shared state), batch lifts (amortize synchronization).',
          adult:
            'Parallelism is a factory with many lines and one shared crane. The lines multiply output; the crane, the step everyone must take turns on, decides the ceiling. This is why doubling the hardware often does not double the speed: the money bought more lines, and the bottleneck was the crane all along. Finding the crane is the job.',
        },
      },
      {
        id: 'threads-parallelism--music',
        domain: 'music',
        domainLabel: 'Music',
        title: 'An orchestra, not a solo',
        maps: [
          { code: 'threads', analog: 'the sections playing simultaneously' },
          { code: 'synchronization', analog: 'the conductor’s beat' },
          { code: 'barrier', analog: 'everyone pausing until the soloist finishes' },
          { code: 'race condition', analog: 'two sections entering off-cue, clashing' },
        ],
        text: {
          child:
            'Threads are like an orchestra. Lots of musicians play at the same time, which is how the music gets so big. The conductor keeps everyone together: sometimes a whole section waits, counting silently, until it is their moment to come in.',
          highschool:
            'An orchestra is parallelism with coordination on display: sections play simultaneously (threads), the conductor’s beat keeps them aligned (synchronization), and a section counting rests until its cue is a thread waiting its turn. Two sections crashing in off-cue is what a race condition sounds like. The music is faster and richer than any soloist could manage, and only because the coordination is explicit.',
          undergrad:
            'The orchestra shows that parallel speed is a coordination artifact: independent parts run concurrently, the beat is a shared clock, waiting for a cue is a condition variable, and the whole ensemble holding until the soloist finishes is a barrier. Playing off-cue is a race; a rallentando where everyone slows for one section is convoy behavior. The score matters most: music arranged so sections rarely depend on each other’s exact timing is the loosely-coupled design that actually scales, in symphonies and services alike.',
          adult:
            'Parallel software is an orchestra, not a fast soloist: many parts at once, held together by explicit coordination. The conductor’s beat, the cues, the counted rests, all of that is engineering work that exists only because things run simultaneously. When teams say concurrency is hard, they mean the music is easy and the conducting is not.',
        },
      },
    ],
  },
];
