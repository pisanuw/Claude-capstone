import type { Concept } from '../types';

export const basics: Concept[] = [
  {
    id: 'variable',
    name: 'Variables',
    tagline: 'A named place that holds one value, which can be replaced later.',
    analogies: [
      {
        id: 'variable--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Labeled jars in the pantry',
        maps: [
          { code: 'variable name', analog: 'the label on the jar' },
          { code: 'value', analog: 'what is inside the jar right now' },
          { code: 'assignment', analog: 'emptying the jar and refilling it' },
          { code: 'reading the variable', analog: 'peeking inside without changing anything' },
        ],
        text: {
          child:
            'A variable is like a jar with a name sticker on it. The jar called "sugar" might have sugar today, but you can pour it out and put rice in instead. The sticker stays the same, and whoever opens the jar gets whatever is inside right now.',
          highschool:
            'Think of a variable as a labeled jar in a pantry. The label ("score", "username") never changes, but the contents can be swapped any time. When code says score = 10 and later score = 25, it is the same jar being emptied and refilled, and anyone who checks the jar sees only the newest contents.',
          undergrad:
            'A variable is a labeled jar in the pantry: the label is the identifier, the jar is a storage location, and the contents are the current value. Assignment replaces the contents in place, which is exactly why the old value is unrecoverable afterward, and why two labels taped to the same jar (aliasing, references) let one assignment surprise the other name.',
          adult:
            'A variable is a labeled jar in a shared kitchen. The label, like "monthly_budget", is a fixed name everyone agrees on; the contents get replaced as things change. Software is full of these jars, and most "stale data" bugs amount to someone reading a jar before the newest contents were poured in.',
        },
      },
      {
        id: 'variable--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'A hallway locker with your name on it',
        maps: [
          { code: 'variable name', analog: 'the name tag on the locker door' },
          { code: 'value', analog: 'what is stored inside today' },
          { code: 'assignment', analog: 'swapping out what the locker holds' },
          { code: 'scope', analog: 'which hallway the locker is in' },
        ],
        text: {
          child:
            'A variable is like your school locker. Your name is on the door, and inside you can keep a lunchbox today and a soccer ball tomorrow. The locker keeps only what you last put in, so the old thing has to come out first.',
          highschool:
            'A variable works like a hallway locker with a name tag. The tag identifies it; the contents change all semester. Putting a new binder in means the old one is gone from the locker, just like assigning a new value replaces the old one, and lockers in different hallways can share a tag without mixing anything up.',
          undergrad:
            'A locker models a variable well: name tag as identifier, interior as storage, contents as value. The hallway it sits in is its scope: two lockers tagged "x" in different hallways (functions) never collide, and when a hallway is demolished at the end of term (the function returns), its lockers and contents go with it.',
          adult:
            'Picture a school locker with a name tag. The tag is permanent, the contents rotate all year. Programs track thousands of these named lockers, and a surprising share of software work is simply making sure the right thing is in the right locker at the moment someone opens it.',
        },
      },
      {
        id: 'variable--sports',
        domain: 'sports',
        domainLabel: 'Sports',
        title: 'The scoreboard slot for each team',
        maps: [
          { code: 'variable name', analog: 'the HOME and GUEST panels' },
          { code: 'value', analog: 'the number showing right now' },
          { code: 'assignment', analog: 'the operator changing the number' },
          { code: 'update from old value', analog: 'new score = old score + 2' },
        ],
        text: {
          child:
            'A variable is like the number on a scoreboard. The sign always says HOME, but the number under it keeps changing as the game goes on. When your team scores, the old number disappears and the new one takes its place.',
          highschool:
            'The HOME panel on a scoreboard is a variable: a fixed label whose number changes throughout the game. score = score + 2 is exactly what the scoreboard operator does after a basket: read the current number, add two, and display the result in the same slot.',
          undergrad:
            'A scoreboard slot captures mutable state cleanly: the panel is the identifier, the displayed number is the value, and each basket is a read-modify-write (score = score + 2). It also previews the classic concurrency hazard: two operators updating the same panel at once can lose a basket, which is precisely a race condition on shared state.',
          adult:
            'Think of the HOME number on a scoreboard: a fixed label, a value that changes all game. Business software works the same way, with labeled slots for things like "orders today" that get read and updated constantly. Reports disagree when one was read before the latest update, the software version of glancing at the scoreboard mid-change.',
        },
      },
    ],
  },
  {
    id: 'function-return',
    name: 'Functions and return values',
    tagline: 'A reusable block that takes inputs, does work, and hands back a result.',
    analogies: [
      {
        id: 'function-return--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The kitchen behind the order window',
        maps: [
          { code: 'calling a function', analog: 'handing an order ticket through the window' },
          { code: 'arguments', analog: 'what the ticket says: "burger, no onions"' },
          { code: 'function body', analog: 'the cooking you never see' },
          { code: 'return value', analog: 'the plate that comes back out' },
        ],
        text: {
          child:
            'A function is like a restaurant kitchen. You hand in a little ticket that says what you want, the kitchen does its secret work, and a finished plate comes back out. You do not watch the cooking; you just get the food.',
          highschool:
            'Calling a function is handing an order ticket through a kitchen window. The ticket carries your inputs ("burger, no onions"), the kitchen is the function body doing the work out of sight, and the plate handed back is the return value. Same ticket, same kitchen, same dish: that predictability is the whole point.',
          undergrad:
            'The order window is the function signature: it fixes what a ticket may say (parameters) and what comes back (return type). The kitchen is the body, and encapsulation is the wall: the caller never sees pans or prep, only the plate. A kitchen that also blasts music into the dining room while cooking is a side effect, and dishes that depend on nothing but the ticket are your pure functions.',
          adult:
            'A function is a kitchen behind an order window: requests go in on a ticket, finished plates come back, and the mess in between stays hidden. Big systems are thousands of these windows passing plates to each other, which is why one kitchen can be renovated (rewritten) without the diners noticing, as long as the tickets and plates stay the same.',
        },
      },
      {
        id: 'function-return--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'A vending machine',
        maps: [
          { code: 'arguments', analog: 'the coins and the button you press' },
          { code: 'function body', analog: 'the machinery whirring inside' },
          { code: 'return value', analog: 'the snack that drops into the tray' },
          { code: 'void function', analog: 'a machine that just plays a jingle and drops nothing' },
        ],
        text: {
          child:
            'A function is like a vending machine. You put in coins and press a button, something whirs inside, and a snack drops out. You do not need to know how the machine works inside; you just need to know what to put in and what you get back.',
          highschool:
            'A vending machine is a function: coins and a button press are the arguments, the hidden machinery is the body, and the snack in the tray is the return value. Press B4 with the right coins and you always get the same snack; wrong inputs and it gives you an error instead, just like a function rejecting bad arguments.',
          undergrad:
            'The vending machine nails the contract view of functions: the coin slot and keypad are the parameter list, the tray is the return value, and the front panel is the interface you program against. A machine that dispenses nothing but changes something (logs your purchase, updates stock) is a void function with side effects, and one that returns your coins on an invalid code is throwing an exception rather than returning normally.',
          adult:
            'A function is a vending machine: put in a request, get back a result, never open the cabinet. When engineers talk about an API, they mean a wall of these machines that other teams can use. The buttons and the tray are a promise; as long as those stay stable, everything behind the panel can be upgraded without breaking anyone.',
        },
      },
      {
        id: 'function-return--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Mail-order with a return envelope',
        maps: [
          { code: 'calling a function', analog: 'mailing in an order form' },
          { code: 'arguments', analog: 'what the form asks for' },
          { code: 'return value', analog: 'the package that arrives back' },
          { code: 'return address', analog: 'where execution resumes after the call' },
        ],
        text: {
          child:
            'A function is like ordering from a catalog by mail. You fill out a form saying what you want, send it away, and later a package comes back to your house. The form is what you give; the package is what you get back.',
          highschool:
            'Calling a function is mail-order: the order form is the arguments, the warehouse does the work, and the package that shows up is the return value. Crucially, the package comes back to the address on the form: your program continues exactly where it sent the order from, with the result in hand.',
          undergrad:
            'Mail-order makes the call/return mechanics concrete: the order form is the argument list, and the return address on the envelope is the return address the call stack keeps for you, the exact spot execution resumes with the result. A form sent with no return address is a call whose result is discarded, and a warehouse that mails you nothing is a void function: useful only for what it changes elsewhere.',
          adult:
            'A function call is mail-order: send a form describing what you need, get a package back, carry on where you left off. Software spends its day exchanging millions of these forms and packages internally. When a system "hangs", it is often waiting at the mailbox for a package that a slow or broken warehouse never sent.',
        },
      },
    ],
  },
  {
    id: 'conditional',
    name: 'Conditionals (if / else)',
    tagline: 'Code that checks a condition and picks one path or another.',
    analogies: [
      {
        id: 'conditional--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'A fork in the road with a signpost',
        maps: [
          { code: 'condition', analog: 'the question on the signpost' },
          { code: 'if branch', analog: 'the left road' },
          { code: 'else branch', analog: 'the right road' },
          { code: 'after the if/else', analog: 'the roads merging again past the fork' },
        ],
        text: {
          child:
            'An if is like a fork in the road with a sign. The sign asks a question, like "Is it raining?" If yes, you take the covered path. If no, you take the sunny path. You always take exactly one path, never both.',
          highschool:
            'A conditional is a fork in the road: the signpost asks a yes/no question (the condition), and traffic takes exactly one branch. Often the two roads merge again a block later, which is what happens after an if/else: different paths, then the program carries on down the same street.',
          undergrad:
            'A signposted fork is a branch: the condition is evaluated once, control flow takes exactly one edge, and the merge point after the fork is where the paths rejoin. Chained forks (else if) form a road network, and the reason test coverage talks about "branch coverage" is literally this map: has your test traffic driven down every road at least once?',
          adult:
            'Business rules in software are forks in a road network: "if the order is over $50, ship free, otherwise add $5." Each rule is a signpost, and the software drives every request through the network. When people say the logic got complicated, they mean the map now has hundreds of forks, and some roads have not been driven in years.',
        },
      },
      {
        id: 'conditional--board-games',
        domain: 'board-games',
        domainLabel: 'Board games',
        title: 'A card that says "if ... then ..."',
        maps: [
          { code: 'condition', analog: 'the check printed on the card' },
          { code: 'if branch', analog: 'what happens when the check passes' },
          { code: 'else branch', analog: 'the "otherwise" line' },
          { code: 'nested conditionals', analog: 'a card whose effect makes you draw another card' },
        ],
        text: {
          child:
            'An if is like a game card that says: "If you rolled a six, move ahead three spaces. If not, stay where you are." The game checks one thing, then does one of the two actions. Everyone follows the card the same way every time.',
          highschool:
            'Conditionals are the rule cards of a board game: "If you own the property, collect rent; otherwise offer it for auction." The printed check is the condition, and the two outcomes are the branches. Games stay fair because the cards leave no wiggle room, and code needs the same precision: the computer will not guess what you meant.',
          undergrad:
            'A rule card is a guard plus two branches, and a rulebook full of them is a decision procedure. The interesting failures match programming exactly: two cards that both apply with no priority order (ambiguous overlapping conditions), a card with no "otherwise" line (a missing else that silently does nothing), and card chains that trigger card chains (nesting deep enough that nobody can trace the turn anymore).',
          adult:
            'Every "if" in software is a printed game rule: "If the payment clears, ship; otherwise email the customer." The value is that the rule runs identically a million times without a tired human judging edge cases. The risk is a rulebook nobody has read end to end, where two old cards quietly contradict each other.',
        },
      },
      {
        id: 'conditional--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Taste it, then decide',
        maps: [
          { code: 'condition', analog: 'the taste test' },
          { code: 'if branch', analog: 'add salt' },
          { code: 'else branch', analog: 'leave it alone' },
          { code: 'condition on live data', analog: 'tasting the actual pot, not the recipe' },
        ],
        text: {
          child:
            'An if is like tasting your soup while you cook. If it tastes flat, you add a pinch of salt. If it tastes good, you leave it alone. You check first, then act, and you only do one of the two things.',
          highschool:
            'Recipes are full of conditionals: "If the sauce is too thick, add water. If the top is browning too fast, cover with foil." Each is a check on the actual state of the dish followed by exactly one action. Code does the same, except the checks run thousands of times a second and never forget to taste.',
          undergrad:
            'The taste test highlights something the road-fork picture hides: conditions are evaluated against live runtime state, not against the recipe. "If too thick, add water" reads current viscosity the way if (queue.length > limit) reads the actual queue. It is also why condition order matters: taste before seasoning and after are different programs, just as checking a pointer before and after using it are.',
          adult:
            'Good cooks constantly run little checks: taste, then salt or not; look, then cover or not. Software automates exactly that pattern, checking real conditions ("is the warehouse out of stock?") and reacting, thousands of times a minute. The quality of a system mostly comes down to whether someone thought to taste at the right moments.',
        },
      },
    ],
  },
  {
    id: 'loop',
    name: 'Loops',
    tagline: 'Repeating a block of work once per item, or until a condition changes.',
    analogies: [
      {
        id: 'loop--sports',
        domain: 'sports',
        domainLabel: 'Sports',
        title: 'Running laps on a track',
        maps: [
          { code: 'loop body', analog: 'one lap' },
          { code: 'loop counter', analog: 'the lap count in your head' },
          { code: 'exit condition', analog: '"stop after 10 laps" or "run until the whistle"' },
          { code: 'infinite loop', analog: 'nobody ever blows the whistle' },
        ],
        text: {
          child:
            'A loop is like running laps. You run one lap, count "one!", run another, count "two!", and keep going until you reach ten. Each lap is the same track, but the number in your head keeps growing until it is time to stop.',
          highschool:
            'A loop is lap-running: the body is one circuit of the track, the counter is your lap count, and the exit condition is "stop after 10" (a for loop) or "run until the coach whistles" (a while loop). If the coach forgets the whistle, you run forever: that is an infinite loop, and it happens to real programs.',
          undergrad:
            'Laps map onto loop anatomy: initialization (start at lap 0), the body (one circuit), the update (increment the count), the guard (count < 10). The whistle version is a while whose condition depends on something external, which is exactly where infinite loops breed: if nothing inside the loop can make the whistle blow, the guard never flips. Cost intuition lives here too: a loop over n items inside a loop over n items is running laps around the whole track for every step of another lap, your O(n²).',
          adult:
            'A loop is doing laps: the same routine repeated with a count in your head and a rule for when to stop. Computers excel at exactly this, happily doing a million identical laps without boredom or error. When an app freezes with the fan roaring, it is often stuck running laps waiting for a whistle that will never blow.',
        },
      },
      {
        id: 'loop--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'One station on an assembly line',
        maps: [
          { code: 'loop body', analog: 'the operation the station performs' },
          { code: 'items iterated over', analog: 'products moving down the belt' },
          { code: 'exit condition', analog: 'the belt runs empty' },
          { code: 'break', analog: 'the emergency stop button' },
        ],
        text: {
          child:
            'A loop is like one worker on an assembly line. A toy arrives, the worker paints it, and the belt brings the next toy. Paint, next, paint, next, until the belt is empty. Same job every time, different toy every time.',
          highschool:
            'A for-each loop is an assembly line station: the belt delivers items one at a time, the station runs the same operation on each, and work ends when the belt is empty. The emergency stop button is break (halt everything now), and tossing one defective item aside without stopping the belt is continue.',
          undergrad:
            'The station makes iteration mechanics visible: the belt is the iterable, each arriving product is the loop variable rebound per iteration, empty belt is exhaustion of the iterator. break is the emergency stop, continue is rejecting one unit and letting the belt advance. It also frames the classic bug: modifying the belt while standing at it (mutating a collection during iteration) is how stations skip products or jam.',
          adult:
            'A loop is an assembly line station: the same operation applied to every item that comes down the belt. "Send this email to all 40,000 customers" is one loop. The economics of software live here: writing the station once costs the same whether the belt carries ten items or ten million.',
        },
      },
      {
        id: 'loop--gardening',
        domain: 'gardening',
        domainLabel: 'Gardening',
        title: 'Watering every pot on the balcony',
        maps: [
          { code: 'collection', analog: 'the row of pots' },
          { code: 'loop body', analog: 'water one pot' },
          { code: 'loop variable', analog: 'the pot in front of you right now' },
          { code: 'off-by-one error', analog: 'skipping the first pot or watering the last one twice' },
        ],
        text: {
          child:
            'A loop is like watering plants. You stand in front of the first pot, water it, move to the next, water it, and keep going down the row until every pot has had a turn. One drink for each plant, nobody skipped, nobody watered twice.',
          highschool:
            'Watering a row of pots is a for-each loop: the row is your list, "the pot in front of you" is the loop variable, and moving down the row is the iteration. The classic mistakes are gardening mistakes too: start at the second pot, or count wrong and give the last pot two drinks. Programmers call those off-by-one errors.',
          undergrad:
            'The pot row is the canonical for (i = 0; i < pots.length; i++): the pot in front of you is pots[i], stepping sideways is i++, and the fence at the end of the row is the bound. Off-by-one errors live at the fence: i <= pots.length reaches past the last pot (index out of bounds), starting at 1 skips pots[0]. The invariant view is useful even here: after each step, "every pot behind me is watered" stays true, and when the loop ends that invariant plus "no pots ahead" gives you the result.',
          adult:
            'A loop is watering a row of pots: the same small task done once per item until the row ends. Most of what software does all day is exactly this, marching down rows of records. The infamous "off-by-one" bug is watering that starts at the wrong pot, and it is why careful engineers obsess over where a row begins and ends.',
        },
      },
    ],
  },
];
