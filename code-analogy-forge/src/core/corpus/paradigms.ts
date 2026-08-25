import type { Concept } from '../types';

export const paradigms: Concept[] = [
  {
    id: 'async',
    name: 'Async and await',
    tagline: 'Starting slow work, doing other things, and picking up the result when it is ready.',
    analogies: [
      {
        id: 'async--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The buzzing coaster at a food court',
        maps: [
          { code: 'starting an async call', analog: 'ordering and receiving the buzzer' },
          { code: 'the promise', analog: 'the buzzer itself: a claim on a future meal' },
          { code: 'await', analog: 'the moment you respond to the buzz and collect' },
          { code: 'blocking (sync) call', analog: 'standing at the counter staring at the kitchen' },
        ],
        text: {
          child:
            'Async is like ordering food and getting a buzzer. You do not stand frozen at the counter; you find a table, chat, look around. When the buzzer shakes, your food is ready and you go pick it up. Waiting without standing still: that is the trick.',
          highschool:
            'At a food court you order, take a buzzer, and go do something else; the buzz tells you when to collect. That buzzer is a promise: not the meal, but a claim on a future meal. Await is deciding "I need the food now" and responding to the buzz. The alternative, standing at the counter doing nothing until the tray appears, is what a blocking call does to a program.',
          undergrad:
            'The buzzer is a Promise: order placement returns immediately (the async call), the buzzer is the pending handle, the buzz is resolution, and collecting is await, the point where your code actually needs the value. Holding three buzzers from three stalls and eating when all arrive is Promise.all: total wait is the slowest stall, not the sum. A stall announcing "out of stock" is a rejected promise, and ignoring that buzz entirely is your unhandled rejection.',
          adult:
            'Async is the food court buzzer: order, walk away, get buzzed when it is ready. Software juggles slow tasks (fetching data, contacting other services) exactly this way instead of freezing until each finishes. An app that stops responding is one that chose to stand at the counter; well-built ones hold several buzzers at once and stay responsive while everything cooks.',
        },
      },
      {
        id: 'async--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Mailing a letter with a tracking number',
        maps: [
          { code: 'async request', analog: 'dropping the parcel at the counter' },
          { code: 'the promise', analog: 'the tracking number' },
          { code: 'resolved / rejected', analog: 'delivered / returned to sender' },
          { code: 'callback', analog: '"text me when it arrives"' },
        ],
        text: {
          child:
            'Async is like mailing a package. You hand it over, get a tracking slip, and go home; you do not wait at the counter for days. Life goes on, and when the "delivered!" message arrives, you act on it. The slip is not the package, it is the way to hear about the package.',
          highschool:
            'Sending a parcel is an async operation: you get a tracking number immediately, and delivery happens later while you do other things. The tracking number is a promise: it will eventually end in "delivered" or "returned to sender", success or failure. Asking to be texted on arrival instead of refreshing the page all day is the difference between a callback and polling.',
          undergrad:
            'Postal delivery maps the whole async vocabulary: the immediate tracking number is the promise handle, delivered/returned are the resolved/rejected states, "text me on arrival" registers a callback, refreshing tracking every hour is polling. Send three parcels and gather all confirmations before proceeding: Promise.all, gated on the slowest. The deeper lesson is ordering: parcels sent in sequence need not arrive in sequence, the source of most async race bugs.',
          adult:
            'Async work is a mailed package with tracking: you get the number instantly, delivery happens on its own time, and you carry on meanwhile. Systems fire off dozens of these at once and react to the confirmations as they arrive, in whatever order they arrive. That last part is the catch: things sent first do not always land first, which is why careful engineering goes into handling arrivals out of order.',
        },
      },
      {
        id: 'async--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'One cook, four burners',
        maps: [
          { code: 'async task', analog: 'a pot simmering on its own' },
          { code: 'the event (timer)', analog: 'a timer going off' },
          { code: 'single-threaded event loop', analog: 'one cook attending whichever pot needs them' },
          { code: 'blocking the loop', analog: 'hand-stirring one pot while others burn' },
        ],
        text: {
          child:
            'Async cooking: while the pasta water heats up, you do not stare at the pot. You chop vegetables, set a timer, stir the sauce. When a timer beeps, you deal with that pot and go back to the rest. One cook, lots of things cooking, nothing just standing still.',
          highschool:
            'A good cook runs dinner asynchronously: start the rice, and while it simmers, chop, fry, and set timers. The cook never stands watching a pot; timers announce when each thing needs attention. That is how a single program handles many slow tasks at once: start them, respond to whichever finishes first, and keep the hands busy in between.',
          undergrad:
            'The kitchen is the event loop: one cook (one thread) cycles among pots, and timers are events pulled from a queue. Pots simmer unattended (I/O runs off-thread); the cook only handles moments needing action (callbacks). The classic failure is visible instantly: hand-whisking one sauce for ten minutes (long synchronous work) means every timer goes unanswered and pots burn: a blocked event loop. The fix is the kitchen fix: break long jobs into checkable steps, or bring in a second cook (worker thread).',
          adult:
            'Async is one cook running four burners: start everything, respond to timers, never stand idle watching a single pot. Most modern software is one such cook managing hundreds of simmering tasks, which is remarkably efficient until someone gives the cook a ten-minute chore at the counter, and every other pot burns. When an app freezes, that is usually the story.',
        },
      },
    ],
  },
  {
    id: 'class-oop',
    name: 'Classes and objects',
    tagline: 'A class is the blueprint; objects are the many things built from it.',
    analogies: [
      {
        id: 'class-oop--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Cookie cutter and cookies',
        maps: [
          { code: 'class', analog: 'the cookie cutter' },
          { code: 'object / instance', analog: 'each cookie cut with it' },
          { code: 'fields / state', analog: 'each cookie’s own icing and sprinkles' },
          { code: 'instantiation', analog: 'pressing the cutter into dough' },
        ],
        text: {
          child:
            'A class is like a cookie cutter and objects are the cookies. One star-shaped cutter can make a hundred star cookies. Every cookie has the same shape, but each one gets its own icing and sprinkles. The cutter is not a cookie: you cannot eat the cutter!',
          highschool:
            'A class is the cookie cutter, objects are the cookies: one definition, many instances, all sharing a shape. Each cookie decorated differently is each object holding its own data: same fields, different values. And the cutter itself is not a cookie: defining a class bakes nothing; pressing it into dough (calling the constructor) is what creates an object.',
          undergrad:
            'The cutter/cookie split is class versus instance: the class fixes structure and methods, each instantiation yields an object with identity and its own field values (its icing). It sharpens the distinctions students blur: class-level things (the cutter’s shape, static members) versus per-cookie things (instance state), and identity versus equality: two cookies can be decorated identically (equal) yet still be two cookies (distinct references). Changing the cutter changes future cookies only: existing instances do not retro-update.',
          adult:
            'A class is a cookie cutter, objects are the cookies: define the shape once, stamp out as many as needed, let each carry its own decorations. Software defines "Customer" once and stamps out millions, each with its own name and balance. The economy is the point: fix the cutter once and every future cookie inherits the fix.',
        },
      },
      {
        id: 'class-oop--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'One blueprint, a street of houses',
        maps: [
          { code: 'class', analog: 'the architect’s blueprint' },
          { code: 'objects', analog: 'the houses built from it' },
          { code: 'constructor arguments', analog: 'choices made at build time: paint, corner lot' },
          { code: 'methods', analog: 'things every house can do: open the garage' },
        ],
        text: {
          child:
            'A class is like a house blueprint. Builders use one drawing to build a whole street of houses. The houses match, but each family paints theirs differently and puts different stuff inside. The drawing is just paper: you cannot live in the blueprint.',
          highschool:
            'A class is a blueprint; each house built from it is an object. The blueprint fixes what every house has (rooms, garage, front door) and what it can do (garage opens); build-time choices like paint color are constructor arguments. You cannot live in a blueprint: until a house is built, there is nothing to move into, which is exactly the class/instance divide.',
          undergrad:
            'The blueprint is the type: it declares fields (rooms) and methods (operations every house supports), and each build is instantiation with constructor parameters (lot, paint). Inheritance fits naturally: a "blueprint based on the standard model, adding a sunroom" is a subclass, and any inspector certified for the standard model can inspect the variant: substitutability. The blueprint’s promise of "a front door that opens" without dictating the interior is the interface/implementation boundary encapsulation protects.',
          adult:
            'A class is an architect’s blueprint; objects are the houses built from it. Design once, build many, and let each house hold different occupants and paint. When engineers "model the domain", they are drawing blueprints for things like Order and Invoice, then stamping out one instance per real order. A flaw in the blueprint quietly repeats in every house, which is why design reviews happen before construction.',
        },
      },
      {
        id: 'class-oop--factory',
        domain: 'factory',
        domainLabel: 'Factory',
        title: 'The mold on the production line',
        maps: [
          { code: 'class', analog: 'the injection mold' },
          { code: 'objects', analog: 'each part cast from the mold' },
          { code: 'methods', analog: 'what every cast part can do' },
          { code: 'subclass', analog: 'a derived mold with an extra feature' },
        ],
        text: {
          child:
            'A class is like a toy factory mold. Hot plastic goes in, and out come toy cars, one after another, all the same shape. Each car then gets its own color and stickers. One mold, thousands of toys, and every toy came from that one shape.',
          highschool:
            'A factory mold is a class: design it once, cast thousands of parts (objects) from it. Every part has the same shape and works the same way, but each is a separate physical thing with its own serial number and color. Retooling the mold changes all future parts while the ones already shipped stay as they were: that is what changing a class does to code.',
          undergrad:
            'The mold gives OOP its industrial reading: the mold is the class, castings are instances with identity (serial numbers) and per-unit state (finish, color), and the casting step is construction. A derived mold that adds a mounting bracket to the standard part is a subclass, and any assembly line that accepts the standard part accepts the bracketed one: polymorphism as interchangeable parts, the same property that lets code operate on a base type while running subtype behavior.',
          adult:
            'A class is a factory mold: invest in the mold once, then stamp out identical parts cheaply, each with its own serial number. Software gets its scale from this: "User" is designed once and instantiated millions of times. It also explains maintenance: fix the mold and all future parts are fixed, but parts already in the field (data already created) may need a recall, which in software is called a migration.',
        },
      },
    ],
  },
];
