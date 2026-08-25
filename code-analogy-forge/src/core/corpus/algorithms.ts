import type { Concept } from '../types';

export const algorithms: Concept[] = [
  {
    id: 'binary-search',
    name: 'Binary search',
    tagline: 'Find an item in sorted data by halving the search range each step.',
    analogies: [
      {
        id: 'binary-search--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'Finding a name in a printed phone book',
        maps: [
          { code: 'sorted array', analog: 'the alphabetized book' },
          { code: 'compare at midpoint', analog: 'opening to the middle and checking the names' },
          { code: 'discard half', analog: 'ignoring the half that cannot contain the name' },
          { code: 'O(log n)', analog: 'a million names, about 20 opens' },
        ],
        text: {
          child:
            'Binary search is how you find a name in a big alphabet book. Open it in the middle: is your name before or after this page? Whichever half is wrong, ignore it forever. Keep opening the middle of what is left, and even a giant book takes only a handful of opens.',
          highschool:
            'Nobody reads a phone book page by page. You open the middle, compare, and throw away the half that cannot contain the name; repeat on the remaining half. That is binary search, and it only works because the book is alphabetized: a million names take about 20 opens instead of a million checks.',
          undergrad:
            'The phone book is binary search with every requirement visible: sortedness is the precondition (an unalphabetized book breaks the "which half?" question), the midpoint compare discards half the candidates, and the count of opens is log2(n): 1,000,000 names, about 20 probes. The classic implementation bugs map to page-flipping mistakes: an off-by-one in the boundaries re-reads a page forever (infinite loop) or skips the page the name is on.',
          adult:
            'Binary search is the phone book trick: open the middle, decide "before or after", and permanently discard the wrong half. Each peek halves the problem, so a million entries take about twenty peeks. Software applies this constantly, and it is a big part of why searching enormous sorted records feels instant, with the one catch that the data must be kept sorted.',
        },
      },
      {
        id: 'binary-search--board-games',
        domain: 'board-games',
        domainLabel: 'Board games',
        title: 'The higher-or-lower guessing game',
        maps: [
          { code: 'search range', analog: 'the numbers still possible' },
          { code: 'guess the midpoint', analog: 'always guessing the middle number' },
          { code: 'comparison result', analog: 'the "higher" or "lower" hint' },
          { code: 'worst case log n', analog: '1 to 100 always won in 7 guesses' },
        ],
        text: {
          child:
            'Binary search is the secret to the guessing game. Someone thinks of a number from 1 to 100, and after each guess they say "higher" or "lower". Always guess the middle! First 50, then 25 or 75, and so on. You will win in seven guesses or fewer, every single time.',
          highschool:
            'In higher-or-lower, guessing the middle is the winning strategy: each hint eliminates half the remaining numbers. From 1 to 100 you need at most 7 guesses; double the range to 200 and you need just one more. That "double the problem, pay one extra step" behavior is what binary search gives you, and it beats guessing 1, 2, 3... by a mile.',
          undergrad:
            'Higher-or-lower is binary search on the range [1, n]: the invariant is "the answer lies in the current interval", each midpoint guess plus hint halves the interval, and ceil(log2(n)) guesses suffice: 7 for 100, 20 for a million. Guessing sequentially is the O(n) linear scan. The information-theory view is worth having: each yes/no answer yields at most one bit, so log2(n) questions are also a lower bound: the middle guess is optimal, not merely clever.',
          adult:
            'Binary search is the higher-or-lower game played perfectly: always guess the middle, and each hint discards half the possibilities. A range of a hundred falls in seven questions, a million in twenty. Any process built on yes/no narrowing, from troubleshooting guides to "which update broke this?", is running the same strategy.',
        },
      },
      {
        id: 'binary-search--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'Finding a house number on a long street',
        maps: [
          { code: 'sorted data', analog: 'house numbers increasing down the street' },
          { code: 'probe the midpoint', analog: 'jumping to the middle of the street' },
          { code: 'narrow the range', analog: 'continuing into the half that fits' },
          { code: 'unsorted data breaks it', analog: 'randomly numbered houses force door-to-door' },
        ],
        text: {
          child:
            'Binary search is how you find house number 62 on a really long street. Jump to the middle of the street and read a house number. Too small? Number 62 must be further along. Too big? It is behind you. Keep jumping to the middle of the part that is left, and you get there fast.',
          highschool:
            'Looking for number 62 on a two-kilometer street, you do not check every door. You jump to the middle, read one house number, and instantly know which half of the street to keep. Repeat and the street shrinks by half each time. It only works because house numbers increase in order: on a street with random numbers you would be stuck going door to door.',
          undergrad:
            'The street makes the precondition unmissable: monotonically increasing house numbers are the sorted array, one house number read is one O(1) probe, and each probe halves the interval. Randomly numbered houses force the O(n) door-to-door walk, the exact cost of searching unsorted data. This picture also generalizes cleanly: "first house past the bakery" is lower_bound, and binary-searching on "is the bakery behind me yet?" rather than on a stored number is binary search on a predicate.',
          adult:
            'Binary search is finding house 62 on a long street: jump to the middle, read one number, and you instantly know which half to keep. A few jumps beat checking hundreds of doors, but only because the numbers run in order. That is the deal software makes constantly: keep information sorted, and finding anything in it becomes almost free.',
        },
      },
    ],
  },
  {
    id: 'sorting',
    name: 'Sorting',
    tagline: 'Rearranging items into order so later lookups and comparisons get cheap.',
    analogies: [
      {
        id: 'sorting--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Lining the class up by height',
        maps: [
          { code: 'comparison', analog: 'standing two students back to back' },
          { code: 'swap', analog: 'the two students trading places' },
          { code: 'sorted prefix', analog: 'the part of the line already in order' },
          { code: 'stable sort', analog: 'equal heights keep their original order' },
        ],
        text: {
          child:
            'Sorting is lining up your class from shortest to tallest. Compare two kids back to back, swap them if they are in the wrong order, and keep doing it until the whole line looks right. The computer sorts lists the same way: compare two things, maybe swap, repeat.',
          highschool:
            'Lining up by height is sorting: comparisons are back-to-back checks, swaps are trades of position. Walking the line repeatedly and swapping neighbors is bubble sort; scanning for the shortest remaining student and placing them next is selection sort. Different strategies, same two moves: compare and swap. How few comparisons you can get away with is the whole game.',
          undergrad:
            'The height lineup grounds comparison sorting: bubble sort is adjacent-swap passes, selection sort repeatedly extracts the minimum, insertion sort walks each student back into an already-sorted front of the line. All are O(n²) swaps-and-compares; the divide-and-conquer sorts win by merging pre-sorted halves (two already-sorted half-lines zip together in one pass, O(n log n) overall). Stability shows up too: two students of equal height keeping their original order is a stable sort, and it matters the moment you sort by height then by age.',
          adult:
            'Sorting is lining people up by height with only two moves: compare a pair, maybe swap them. Everything from alphabetized contact lists to "cheapest first" search results is this, done millions of times. Clever orderings of the compares make modern sorting fast enough that re-sorting huge lists on every click is routine.',
        },
      },
      {
        id: 'sorting--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Sorting mail into route pigeonholes',
        maps: [
          { code: 'sort key', analog: 'the postcode on the envelope' },
          { code: 'bucketing', analog: 'one pigeonhole per route' },
          { code: 'multi-pass sort', analog: 'sort by route, then by street within each route' },
          { code: 'why sort at all', analog: 'a sorted bag makes delivery one smooth pass' },
        ],
        text: {
          child:
            'Sorting is what the post office does every morning. A big messy pile of letters gets dropped into little cubbies, one cubby for each street. Then the mail carrier’s bag is in walking order, so they stroll down the street handing out letters without ever doubling back.',
          highschool:
            'Mail sorting is sorting with a purpose: envelopes are bucketed by postcode into pigeonholes, then ordered by street within each hole. The payoff is the delivery walk: a sorted bag means one smooth pass down the route, while an unsorted bag means criss-crossing town all day. Programs sort data for the same reason: to make the next step cheap.',
          undergrad:
            'The mailroom is a non-comparison sort: dropping envelopes into one pigeonhole per postcode is bucket/counting sort, no envelope ever compared to another, which is how it sidesteps the O(n log n) comparison lower bound. Sorting by route, then by street within route, is a two-key sort, and doing it in passes that preserve earlier order is radix sort relying on stability. The delivery walk is the point of all of it: sorting is an investment that turns the subsequent pass into linear, sequential work.',
          adult:
            'Sorting is the morning mailroom: a chaotic pile becomes pigeonholes by route, then walking order within each route, so delivery is one smooth pass with no backtracking. Companies sort data for exactly that reason: not for tidiness, but because almost every later task, from billing runs to search, gets dramatically cheaper on sorted input.',
        },
      },
      {
        id: 'sorting--music',
        domain: 'music',
        domainLabel: 'Music',
        title: 'Merging two sorted setlists',
        maps: [
          { code: 'divide', analog: 'splitting the songs between two bandmates' },
          { code: 'sorted halves', analog: 'each bandmate orders their own half' },
          { code: 'merge', analog: 'repeatedly taking the better front card' },
          { code: 'O(n log n)', analog: 'halving levels, one full pass each' },
        ],
        text: {
          child:
            'Here is a sorting trick. You and a friend each get half the song cards and put your own pile in order. Then you merge: look at the top card of both piles, take whichever comes first, and repeat. Two easy piles become one perfect list without ever shuffling everything at once.',
          highschool:
            'Merge sort works like two bandmates building a setlist: split the songs, each sorts their half, then merge by repeatedly taking the better of the two front cards. Merging is easy precisely because both piles are already sorted: only the front cards ever need comparing. Split the halves into quarters first and the same trick nests all the way down.',
          undergrad:
            'The setlist is merge sort end to end: divide (split the deck), conquer (sort halves, recursively down to single cards, which are trivially sorted), combine (the two-finger merge, taking the smaller front card, O(n) per level). Halving gives log n levels, each a full pass: O(n log n) total. The merge also shows why extra space appears (you deal into a new pile) and why merge sort is stable: ties take from the left pile first.',
          adult:
            'A team trick from sorting: split the pile in half, let each person order their half, then merge by repeatedly taking the better front card, which is easy because both piles are already ordered. Software sorts massive datasets this way, and it parallelizes naturally: more people, more piles, one merge at the end. It is the same move you would use combining two alphabetized filing cabinets.',
        },
      },
    ],
  },
  {
    id: 'recursion',
    name: 'Recursion',
    tagline: 'A function that solves a problem by calling itself on a smaller version of it.',
    analogies: [
      {
        id: 'recursion--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'A box inside a box inside a box',
        maps: [
          { code: 'recursive call', analog: 'opening the box inside the box' },
          { code: 'base case', analog: 'the smallest box with the gift' },
          { code: 'unwinding', analog: 'the answer passed back out through each box' },
          { code: 'missing base case', analog: 'boxes forever, no gift' },
        ],
        text: {
          child:
            'Recursion is like a present that is a box inside a box inside a box. How do you open it? Open one box. Is there a gift? No, another box, so do the same thing again. Eventually you reach the tiny box with the gift: that is where the opening stops.',
          highschool:
            'Nested parcels are recursion: "to open a parcel: open it; if there is a parcel inside, open that parcel the same way." The rule refers to itself, but always on a smaller box, and it must end at a smallest box with an actual gift: the base case. Without that innermost gift, you would unwrap forever, which is exactly what a recursive function with no base case does.',
          undergrad:
            'The parcels give you the recursion checklist: self-similar step (open, recurse on the inner box), guaranteed progress (each box is strictly smaller), base case (the gift). They also make the unwinding phase concrete, which is the half students skip: if you must report the gift plus the count of boxes, that count is assembled on the way back out, each layer adding one to the value returned from inside, exactly how a recursive call composes its return value from the recursive result.',
          adult:
            'Recursion is opening a parcel that contains a smaller parcel, and applying the same "open it" move until you hit the smallest box with the gift. Programmers write one rule that handles the outer layer and defers the rest to itself. It works because each layer is smaller and there is a guaranteed innermost box; remove that stopping point and software really does spin forever.',
        },
      },
      {
        id: 'recursion--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Passing a question down the row',
        maps: [
          { code: 'recursive call', analog: 'asking the person behind you' },
          { code: 'base case', analog: 'the last seat answers "zero behind me"' },
          { code: 'return value', analog: 'each person adds one and passes it forward' },
          { code: 'call stack', analog: 'everyone waiting for the answer behind them' },
        ],
        text: {
          child:
            'Recursion is how a row of kids counts itself without standing up. Ask the kid behind you "how many are behind you?", and they ask the kid behind them, all the way to the last seat. The last kid says "zero!", and the number comes back up the row with everyone adding one.',
          highschool:
            'To count a row you cannot see, ask the person behind you "how many behind you?"; they ask backward too, until the last seat answers zero. Then the answer travels forward, each person adding one for themselves. The question going back is the recursive call, "zero at the last seat" is the base case, and the adding-on-the-way-back is how recursive functions build their result.',
          undergrad:
            'The row is count(seat) = 1 + count(behind), base case zero at the last seat, and it makes the call stack physical: while the question travels back, every student sits waiting, holding their "+1", one live stack frame each. The answer composes during unwinding, not descent. A row too long for everyone to keep waiting is a stack overflow, and noticing that the waiting students do nothing with the result except add one is the first step toward tail-call and accumulator formulations.',
          adult:
            'Recursion is a row of people counting itself: each asks the person behind, the last person says "zero", and the total is built as the answer travels forward with each person adding one. Software solves nested problems this way, folders inside folders, tasks inside tasks: one simple rule plus a guaranteed stopping point does jobs of any size.',
        },
      },
      {
        id: 'recursion--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Sourdough starter feeding on itself',
        maps: [
          { code: 'recursive definition', analog: 'today’s starter is made from yesterday’s starter' },
          { code: 'base case', analog: 'the original flour-and-water day one' },
          { code: 'recursive chain', analog: 'the unbroken line of feedings back to day one' },
          { code: 'self-reference done right', analog: 'defined in terms of a smaller/earlier self' },
        ],
        text: {
          child:
            'Recursion is like a sourdough starter. To make today’s starter you use a spoonful of yesterday’s starter. And yesterday’s came from the day before, and on and on, back to the very first day when someone just mixed flour and water. It refers to itself, but it began somewhere real.',
          highschool:
            'A sourdough starter is a recursive definition: today’s starter is defined using yesterday’s starter, going back to a first day of plain flour and water. That is the shape of every recursive definition: a rule in terms of an earlier or smaller self, plus a concrete starting point. "Starter comes from starter" alone would be circular; day one is what makes it well-founded.',
          undergrad:
            'Sourdough separates recursion from circularity: starter(n) = feed(starter(n-1)) with starter(0) = flour + water is well-founded because each step refers strictly earlier, terminating at the base case. Remove day one and the definition never bottoms out. This is recursion as definition rather than as computation, the same structure as an inductive proof (base case, then n-1 to n), which is why induction is the natural tool for proving a recursive function correct.',
          adult:
            'Recursion is a sourdough starter: today’s batch is made from yesterday’s, in an unbroken chain back to a plain flour-and-water day one. Definitions that refer to themselves sound circular, but a real starting point makes them solid, and software leans on this to define big things in terms of slightly smaller ones without writing out every case.',
        },
      },
    ],
  },
];
