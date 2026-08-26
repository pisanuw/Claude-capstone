import type { Concept } from '../types';

export const web: Concept[] = [
  {
    id: 'sql-database',
    name: 'Relational databases',
    tagline: 'Tables of records, and queries that answer questions across them.',
    analogies: [
      {
        id: 'sql-database--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'The census answers new questions',
        maps: [
          { code: 'tables', analog: 'residents in one register, buildings in another' },
          { code: 'foreign key', analog: 'the address linking a resident to a building' },
          { code: 'a query with JOIN', analog: 'average household size per district' },
          { code: 'index', analog: 'the register pre-sorted by street' },
        ],
        text: {
          child:
            'The census office keeps two big books: one lists every person, one lists every building, and each person’s entry names the building they live in. With just those two books, clerks can answer brand-new questions: which street has the most kids? Which buildings stand empty? Nobody planned those questions when the books were made!',
          highschool:
            'A census is a relational database: a residents table, a buildings table, and a link between them (each resident’s address is a foreign key into buildings). The power is answering questions nobody anticipated: "average household size per district" needs no new books, just a query that joins the two tables and groups the rows. Store facts once, cleanly linked, and every future question becomes a lookup instead of a survey.',
          undergrad:
            'The census makes the relational argument: model entities as tables, relationships as keys, and derive answers with joins and aggregation rather than pre-storing them. Normalization is the one-fact-one-place rule (a building’s year built lives in buildings, not copied onto every resident, so corrections happen once), and indexes are pre-sorted registers bought with update cost. The census-taker’s integrity problem is referential integrity: a resident whose address names no known building is the dangling foreign key constraint databases refuse at insert time rather than discover at query time.',
          adult:
            'A census stores people and buildings once, linked by address, and then answers decades of unanticipated questions without new fieldwork. That is the pitch for relational databases, and it is why they have anchored business systems for fifty years: model the facts cleanly and future questions are queries, not projects. The discipline that keeps it true is storing each fact exactly once, because every duplicated fact eventually disagrees with itself.',
        },
      },
      {
        id: 'sql-database--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'One book, every question',
        maps: [
          { code: 'rows', analog: 'one line per booking: name, time, size, table' },
          { code: 'query with WHERE', analog: 'who is booked after 7pm?' },
          { code: 'aggregate query', analog: 'how many covers on Fridays?' },
          { code: 'transaction', analog: 'moving a booking: erase and rewrite as one act' },
        ],
        text: {
          child:
            'The reservations book has one line per booking: who, when, how many, which table. The same book answers all kinds of questions! Who comes at seven? Flip and check. Which table is free? Scan the column. Whose birthday dinner is Saturday? It is all in there, one tidy line at a time.',
          highschool:
            'A reservations book is a table of rows, and using it is querying: "bookings after 7pm" is filtering (WHERE), "total covers on Fridays" is aggregation (COUNT and SUM), "is table 9 free at 8?" is a lookup. Moving a booking safely means erasing one line and writing another as a single act, never leaving the book half-changed between them: that all-or-nothing habit is what databases call a transaction.',
          undergrad:
            'The book grounds query mechanics: rows with a schema, selection and aggregation as page-flipping made formal, and a second copy sorted by name versus the book’s time order is an index, with the bookkeeping duty of updating both on every change. The half-erased booking motivates ACID: atomicity is the erase-and-rewrite as one act, consistency is "no two parties on table 9 at 8pm" (a uniqueness constraint), isolation is two hosts taking phones simultaneously without double-booking (the lost-update anomaly), durability is ink. Every anomaly a busy host has produced by hand, transaction isolation levels exist to name and prevent.',
          adult:
            'A reservations book works because every booking is one structured line, so any question about the evening is a scan or a count. Databases industrialize that: structure in, unlimited questions out. The businesslike details matter most at the margins: changes must be all-or-nothing (no half-moved bookings), two clerks must not sell the same table at once, and everything must survive a spilled coffee. Those guarantees, not raw storage, are what companies actually buy.',
        },
      },
      {
        id: 'sql-database--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'IDs link the ledgers',
        maps: [
          { code: 'normalized tables', analog: 'products, customers, orders in separate ledgers' },
          { code: 'foreign keys', analog: 'orders naming customer and product ids' },
          { code: 'update anomaly avoided', analog: 'rename a product once, every order agrees' },
          { code: 'denormalized copy', analog: 'the printed catalog: fast to browse, goes stale' },
        ],
        text: {
          child:
            'A shop keeps three ledgers: products, customers, and orders. An order does not copy the whole product description; it just writes the product’s number. So when the "Choco Bar" becomes the "Mega Choco Bar", the shop fixes one line in one ledger, and every past and future order automatically points at the right, updated thing.',
          highschool:
            'The three-ledger shop is a normalized database: products, customers, orders as tables, with orders holding ids instead of copies. The payoff is single-point updates: rename a product once and everything referencing it agrees, whereas copied descriptions drift into contradiction. The printed catalog shows the other side: a denormalized snapshot, wonderful to browse, guaranteed to go stale, the same trade modern systems make when they cache query results for speed.',
          undergrad:
            'The ledgers teach normalization by consequence: ids-as-references eliminate update anomalies (one rename, global agreement), deletion anomalies (removing a customer must not vaporize product facts), and insertion anomalies (a product can exist before anyone orders it). The catalog is the deliberate denormalization: redundant, fast, stale-by-design, refreshed on a schedule, exactly a materialized view. The reporting question "top customer per product this quarter" exercises the whole toolkit: joins across three tables, grouping, and the index-versus-scan decision the shop’s pre-sorted ledgers make tangible.',
          adult:
            'Well-run shops keep products, customers, and orders in separate ledgers linked by numbers, so a fact changes in one place and everywhere at once. Databases enforce that discipline at scale, and its absence explains familiar messes: the price that differs between the invoice and the website is a fact stored twice. The catalog compromise is also real engineering: fast stale copies for browsing, the linked ledgers as the truth, and a schedule for reconciling the two.',
        },
      },
    ],
  },
  {
    id: 'http',
    name: 'HTTP',
    tagline: 'The request/response letters every web page and app exchange.',
    analogies: [
      {
        id: 'http--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'A letter with a status stamp reply',
        maps: [
          { code: 'method and path', analog: 'the envelope: GET /menu, to this address' },
          { code: 'headers', analog: 'the cover sheet: who asks, what language, what format' },
          { code: 'body', analog: 'the enclosure inside' },
          { code: 'status code', analog: 'the reply’s stamp: 200, 404, 500' },
        ],
        text: {
          child:
            'Every time you open a web page, your computer mails a tiny letter: the envelope says what it wants and where, a cover sheet adds details, and sometimes papers ride inside. The reply letter always comes back stamped: 200 means "here you go!", 404 means "no such thing here", 500 means "our office is having a very bad day".',
          highschool:
            'An HTTP request is a structured letter: the request line is the envelope (GET /menu says fetch, and what), headers are the cover sheet (who is asking, what formats are acceptable), the body is the enclosure (a submitted form rides in a POST). The response mirrors it, led by a status stamp from a fixed vocabulary: 2xx delivered, 3xx moved-see-forwarding-address, 4xx your letter was faulty, 5xx our office failed. Every page load is a flurry of these letters.',
          undergrad:
            'The letter model gives HTTP its semantics: methods as intent (GET reads and is safe to repeat, POST creates, PUT replaces idempotently, DELETE removes), headers as negotiated metadata (content negotiation is "reply in French if you can"), status classes as a contract for machines (retry a 503, do not retry your own 400). Statelessness is the deep postal property: each letter must be self-contained, the clerk remembers nothing between letters, so session identity travels as an enclosed reference (cookies, tokens), and caching is the mailroom answering repeat letters from a copy, governed by the very headers the last reply carried.',
          adult:
            'The web runs on formal correspondence: standardized request letters, standardized stamped replies, in fixed vocabulary. This is why wildly different companies interconnect in days, and why error screens say 404 or 500: those are the reply stamps. The stateless rule, every letter self-contained, is what lets a service handle millions of correspondents with a room of interchangeable clerks, and it is why "log in" really means "enclose this token with every future letter".',
        },
      },
      {
        id: 'http--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The waiter remembers nothing',
        maps: [
          { code: 'request / response', analog: 'order in, plate out, one round trip' },
          { code: 'statelessness', analog: 'each visit starts from zero' },
          { code: 'cookie / session token', analog: 'the table number that says it is still you' },
          { code: 'GET vs POST', analog: 'asking to see the menu vs placing an order' },
        ],
        text: {
          child:
            'In this restaurant, the waiter has no memory at all. Every single time, you must say your table number and exactly what you want, all in one go, and back comes exactly one answer. It sounds rude, but it means any waiter can serve any table at any moment, and nobody ever gets confused about who ordered what!',
          highschool:
            'HTTP works like a restaurant with memoryless waiters: each exchange is one complete request and one complete response, and the waiter retains nothing between rounds. Continuity is your job: the table number you repeat each time is the cookie, the token that tells the server "still me". The forgetfulness is the feature: since no waiter holds private context, any of a hundred waiters can take your next request, which is exactly how web servers scale.',
          undergrad:
            'The memoryless waiter is statelessness with its architecture payoff attached: requests carry complete context, so any server instance can serve any request, which makes horizontal scaling and load balancing trivial and is the reason REST canonizes the constraint. Session state then becomes explicit: the repeated table number is the cookie/bearer token, server-side session stores are the maitre d’s ledger, and "sticky sessions" are the anti-pattern of demanding your original waiter. Method semantics map to etiquette: GET asks to look (safe, cacheable, repeatable), POST places an order (side effects, repeat it and two cakes arrive: non-idempotent, hence "do not resubmit" warnings).',
          adult:
            'Web services are restaurants staffed by deliberately memoryless waiters: every request must be complete in itself, and a token repeated with each visit ("table 12, still me") provides the continuity. The design looks pedantic and is why the web scales: any server can handle any customer’s next request, so adding capacity means adding waiters, not cloning one waiter’s memory. When a site logs you out "for no reason", the token stopped being honored, and every waiter honestly, correctly, has no idea who you are.',
        },
      },
      {
        id: 'http--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'The embassy’s fixed vocabulary',
        maps: [
          { code: 'request schema', analog: 'the standard visa application form' },
          { code: '400-class errors', analog: 'missing documents: your application was faulty' },
          { code: '500-class errors', analog: 'the embassy itself failed' },
          { code: 'retry policy', analog: 'reapply after fixing vs try again later' },
        ],
        text: {
          child:
            'Applying for travel papers means one standard form, and the answer always comes in a known shape: approved, missing a paper (go fix your papers), or office closed today (come back tomorrow). The best part is knowing which kind of "no" you got: one means fix something, the other means just wait. That difference tells you exactly what to do next!',
          highschool:
            'Embassy outcomes work like HTTP status codes: approval is a 200, "missing documents" is a 400 (the fault is in your application: fix and resubmit), "office unavailable" is a 503 (their side: wait and retry unchanged). The genius is the fixed vocabulary: every applicant and every embassy shares the same short list of outcomes, so the next step is never a mystery. Web software automates precisely this triage on every failed request.',
          undergrad:
            'The embassy formalizes error semantics: 4xx as client fault (resubmission without fixes is futile: no retry), 5xx as server fault (retry with backoff is correct), and the distinction driving automated policy is the entire point of status classes. Details map crisply: 401 is missing identification, 403 is identified but not entitled, 429 is "you are applying too often" with a Retry-After date, and idempotency decides retry safety: re-asking about status is harmless (GET), re-submitting a payment-bearing application without an idempotency key risks paying twice (POST). Client libraries encode exactly this consular logic.',
          adult:
            'Bureaucracies answer in fixed outcomes, and the useful part is the taxonomy: "your application is faulty" versus "our office failed" dictate opposite next moves, fix-and-resubmit versus wait-and-retry. Web systems bake that triage into every automated exchange, which is why well-built integrations recover from outages by themselves: the error code told them whether patience or correction was required. Systems that ignore the distinction hammer broken requests forever, the automated version of resubmitting the same faulty form daily.',
        },
      },
    ],
  },
  {
    id: 'dns',
    name: 'DNS',
    tagline: 'Turning names people remember into addresses machines use.',
    analogies: [
      {
        id: 'dns--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Ask the office, not the map',
        maps: [
          { code: 'domain name', analog: '"Ms. Alvarez", the name everyone remembers' },
          { code: 'IP address', analog: 'room 214, where deliveries actually go' },
          { code: 'the resolver', analog: 'the front office answering lookups' },
          { code: 'record update', analog: 'she moves rooms; the office list changes once' },
        ],
        text: {
          child:
            'A package arrives for Ms. Alvarez. The delivery person does not wander the halls shouting her name: they ask the front office, which checks its list and says "room 214". Everyone remembers teacher names; deliveries need room numbers; the office list connects the two. When she changes rooms, they fix the list once, and nobody else needs to learn anything!',
          highschool:
            'DNS is the school front office: people use memorable names (Ms. Alvarez, uw.edu) while machines need numeric locations (room 214, an IP address), and a lookup service maps one to the other. The design win shows on moving day: the room changes, the office list is updated once, and every future visitor finds the new room without being told. That indirection, name stays stable while the location moves, is why websites can change servers invisibly.',
          undergrad:
            'The front office is a resolver, and school habits map to DNS mechanics: teachers who memorize popular room numbers are caching, "trust my memory for a week" is the TTL, and the stale week after a room change, some people still knocking on 214, is propagation delay, exactly why DNS changes are scheduled with lowered TTLs beforehand. Scaling brings the hierarchy: the district office knows which school, the school office knows which room, mirroring root, TLD, and authoritative servers, and a prankster editing the office list to misdirect deliveries is cache poisoning, the threat DNSSEC signs records against.',
          adult:
            'DNS is the front-office list mapping the names people use to the locations machines need, and its indirection is why services move, scale, and fail over without customers noticing: the name holds still while the address changes behind it. The operational fine print is memory: everyone caches the list for a while (the TTL), so changes take time to reach the world, and half the mysterious "it works for me, not for them" incidents are two people holding different vintages of the list.',
        },
      },
      {
        id: 'dns--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Grandma moved; fix the book once',
        maps: [
          { code: 'DNS record', analog: 'the address-book entry for "Grandma"' },
          { code: 'resolution', analog: 'looking her up before addressing the envelope' },
          { code: 'record change', analog: 'she moves; one entry is updated' },
          { code: 'stale cache', analog: 'letters still going to the old house for a while' },
        ],
        text: {
          child:
            'You write letters to "Grandma", but envelopes need a street address, so you check the family address book first. When Grandma moves, someone fixes her line in the book, and all the next letters go to the new house. A few letters mailed from memory still reach the old place for a while, until everyone checks the book again!',
          highschool:
            'The family address book is DNS in miniature: names people love (Grandma) resolved to addresses mail requires, with one entry to fix on moving day. The stragglers, letters addressed from memory reaching the old house, are cached lookups that have not expired: everyone who "remembers" the address keeps using it until they re-check. Websites moving servers face precisely this: the record changes instantly, the world’s memories fade on a timer.',
          undergrad:
            'The address book separates identity (the name) from location (the address), the indirection all of DNS delivers, and the moving-day stragglers give TTL semantics their teeth: cached entries serve until expiry, so a migration plan lowers TTLs in advance, moves, then restores them, the standard cutover playbook. Entry types map to record types: a person’s address (A record), "write to Grandma via Aunt May" (CNAME aliasing), "packages to the depot, letters to the house" (MX splitting mail from web). A wrong entry propagating through everyone’s books is poisoning, and the reason authenticity of the book matters as much as its content.',
          adult:
            'DNS is the shared address book: services get memorable names, machines get real addresses, and moving means fixing one entry rather than notifying the world. The catch every operations team learns is that the world keeps private copies with expiry dates, so after any change there is a window where different customers reach different addresses depending on the age of their copy. "Wait for DNS to propagate" is that window, and planning around it is routine migration hygiene.',
        },
      },
      {
        id: 'dns--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'Directory assistance, level by level',
        maps: [
          { code: 'hierarchical resolution', analog: 'national directory, then city, then street' },
          { code: 'authoritative server', analog: 'the office that owns the final answer' },
          { code: 'delegation', analog: '"for Riverside listings, ask Riverside"' },
          { code: 'poisoned directory', analog: 'a false listing routes everyone wrong' },
        ],
        text: {
          child:
            'Finding a little shop in a faraway city goes step by step: the national directory says which city office to ask, the city office says which neighborhood, and the neighborhood office knows the exact street. No single book lists every shop in the country! Each office just knows enough to send you one step closer.',
          highschool:
            'City directories resolve names hierarchically: national points to city, city to neighborhood, neighborhood to the address, and no office holds the whole map. DNS mirrors this shape exactly: for uw.edu, a root server points to the .edu directory, which points to uw.edu’s own office, which answers authoritatively. Each level delegates downward, which is how billions of names stay findable with no central book, and why the system has no single office to overwhelm.',
          undergrad:
            'The layered directories are iterative resolution: root, TLD, authoritative, with delegation (NS records) as "ask Riverside for Riverside", and the no-central-book property as the scalability and administrative-autonomy argument: every zone edits its own listings. Resolvers walking this chain cache each level (asking about a second .edu name skips the root), which concentrates enormous trust in the caches, so a falsified listing steering a whole city wrong is cache poisoning, and DNSSEC’s signed listings are the countermeasure. The root’s tiny, replicated, fiercely defended office is why "the internet’s phone book" survives being everyone’s first question.',
          adult:
            'No office lists every address on earth; directories delegate: national to city to neighborhood, each owning its slice. Internet naming works the same way, which is why it scales to billions of names with no central authority and no single point of control, and why organizations manage their own listings. The governance echo is real too: whoever controls a directory level controls where its traffic goes, which is why the trust and security of those offices is infrastructure policy, not trivia.',
        },
      },
    ],
  },
  {
    id: 'packets-routing',
    name: 'Packets and routing',
    tagline: 'Chopping messages into pieces that find their own way and reassemble.',
    analogies: [
      {
        id: 'packets-routing--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'A novel mailed as postcards',
        maps: [
          { code: 'packets', analog: 'numbered postcards, one page each' },
          { code: 'out-of-order arrival', analog: 'card 12 lands before card 3' },
          { code: 'sequence numbers', analog: 'the numbering that lets pages reassemble' },
          { code: 'retransmission', analog: 'asking again for the card that never came' },
        ],
        text: {
          child:
            'To mail a whole novel, tear it into pages and send each page as a numbered postcard. The cards ride different trucks and arrive all jumbled: 12 before 3, some late, one lost in a puddle. No problem! The numbers put the story back in order, and a missing number means "please send card 7 again."',
          highschool:
            'The internet mails everything as numbered postcards: messages are split into packets, each traveling independently, arriving out of order, occasionally lost. Sequence numbers let the receiver reassemble; gaps trigger a resend request. That is TCP’s whole job, an orderly novel delivered over an unruly postcard service, and it is why one lost packet does not mean a lost photo, just a quiet re-request.',
          undergrad:
            'The postcard novel separates the layers: IP is the postcard service (best-effort, independent routing, no ordering promises), TCP is the reader’s protocol on top (sequence numbers, acknowledgments as "got cards through 6", retransmission on gaps, and windowing: how many cards in flight before a confirmation). MTU is the page-per-postcard limit forcing fragmentation. The design’s origin story is the punchline: independent pieces over redundant paths survive any single truck, route, or sorting office failing, the resilience argument packet switching was invented for.',
          adult:
            'Everything sent over the internet travels as numbered postcards: chopped up, routed independently, reassembled on arrival, with missing pieces quietly re-requested. That is why a shaky connection degrades gracefully instead of failing outright, and why nothing depends on any single route or facility. When a call stutters, postcards arrived late or lumpy (latency, jitter); when a download stalls, the re-request chatter is winning over fresh progress. The postcard picture explains most network weather.',
        },
      },
      {
        id: 'packets-routing--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'The convoy splits through traffic',
        maps: [
          { code: 'routing', analog: 'each car picking its own way around jams' },
          { code: 'congestion', analog: 'the jammed bridge everyone reroutes around' },
          { code: 'link failure', analog: 'a closed road; traffic finds another way' },
          { code: 'hop count / latency', analog: 'intersections passed, minutes en route' },
        ],
        text: {
          child:
            'A convoy of delivery vans does not have to stay together. Each van picks its own way through the city, dodging jams, and they all meet at the warehouse. If a bridge closes, vans swing around it: annoying, slower, but everything still arrives. The city has so many routes that no single closed road can stop the deliveries!',
          highschool:
            'Network data moves like a convoy that splits up: each packet-van routes itself around congestion, and a closed road (a failed link) just means detours, not disaster. Routers are the intersections consulting live traffic knowledge, hop count is how many intersections a van crosses, and latency is its total minutes. The redundancy is the design: enough alternate routes that the network heals around damage by itself.',
          undergrad:
            'The splitting convoy is dynamic routing made municipal: routers exchange road reports (routing protocols: OSPF within one city’s grid, BGP between cities), forwarding each packet by current best next-hop, so failures reroute automatically at the cost of transient detours. Congestion is the jammed bridge with the queueing behavior you would predict: buffers as short on-ramps, drops when they overflow, and TCP’s response, easing off when losses signal jams, is congestion control as citywide driver etiquette. Asymmetric routes (outbound differs from return) and a misconfigured sign misdirecting a metro area (a bad BGP announcement) complete the picture: real outages are usually bad signage, not broken roads.',
          adult:
            'Internet traffic behaves like delivery vans that each pick their own route and regroup at the destination: jams and closures cause detours, not stoppages. The resilience is structural, many routes, no chokepoint, which is why the network survives cut cables and failed facilities. The famous failures are signage failures: when a major provider misannounces routes, half the internet’s vans follow the wrong signs, and that, not physical damage, is behind most "the internet broke today" headlines.',
        },
      },
      {
        id: 'packets-routing--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'One group, many flights',
        maps: [
          { code: 'packets', analog: 'travelers each holding a regroup tag' },
          { code: 'different paths', analog: 'different airlines via different hubs' },
          { code: 'headers', analog: 'the tag: destination and regroup instructions' },
          { code: 'timeout and resend', analog: 'a no-show triggers a rebooked traveler' },
        ],
        text: {
          child:
            'A big tour group flies to the same city on different planes through different airports: whatever seats existed, on whatever airlines. Every traveler carries a tag saying where to regroup. Most arrive at different times from different directions; if someone misses every connection, the organizers just send a replacement. The reunion, not the routes, is what matters!',
          highschool:
            'Splitting a tour group across flights is packet switching: each traveler routes independently through whatever capacity exists, carrying a tag (the header) naming the destination and regroup point. Arrivals are out of order, someone occasionally never shows (a lost packet), and the fix is a rebooked replacement (retransmission). The economics drive it: filling spare seats on many flights beats chartering one giant plane, which is statistical multiplexing, the reason packet networks beat dedicated lines.',
          undergrad:
            'The tour group frames the datagram model: per-traveler routing on current availability, headers as self-describing delivery instructions, reordering and loss as normal events handled at the endpoints (regroup lists and rebooking are TCP’s ordering and retransmission, timeouts as "declared missed after two hours"). Statistical multiplexing is the fare hack made formal: many flows sharing capacity none could justify alone, versus the charter (circuit switching) that guarantees seats and wastes them when half the group cancels. Overbooked hubs bumping travelers are congested routers dropping packets, and the tour operator’s tolerance for it is exactly an SLA.',
          adult:
            'Networks move data like a tour group on many flights: whatever capacity exists, independently routed, regrouped on arrival, with no-shows replaced automatically. Sharing existing flights instead of chartering is why internet capacity is cheap, and why performance is statistical rather than guaranteed: your travelers mingle with everyone else’s. When a business needs the charter, guaranteed seats, come what may, it buys dedicated capacity, and pays charter prices for exactly the reason tour operators do not.',
        },
      },
    ],
  },
  {
    id: 'event-driven',
    name: 'Events and listeners',
    tagline: 'Code that waits to be told, then reacts: nothing polls, things announce.',
    analogies: [
      {
        id: 'event-driven--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Nobody checks for smoke',
        maps: [
          { code: 'the event', analog: 'the alarm going off' },
          { code: 'registered handlers', analog: 'the drill everyone rehearsed' },
          { code: 'event types', analog: 'fire bell, period bell, assembly chime' },
          { code: 'polling (the alternative)', analog: 'sending someone to sniff the halls hourly' },
        ],
        text: {
          child:
            'Nobody at school walks the halls sniffing for smoke every five minutes. There is an alarm for that! When it rings, everyone does the drill they practiced: line up, walk out, meet at the field. Different bells mean different things, and everyone knows their moves for each. Wait calmly, react instantly: that is the trick.',
          highschool:
            'A school is event-driven: no one polls for smoke; the alarm announces it, and rehearsed responses run (the drill is a registered handler). Different bells dispatch different behaviors: fire bell, period bell, assembly chime each trigger their own routine. The efficiency is the point: a thousand people do useful work all day, instantly interruptible, instead of wasting the day checking whether anything happened, which is exactly why interfaces respond to clicks rather than scanning for them.',
          undergrad:
            'The alarm system is the event architecture: emitters (detectors) decoupled from handlers (each classroom’s drill), registration in advance (rehearsal is addEventListener), dispatch by event type, and broadcast to many listeners at once. Polling’s cost is explicit in the hallway-sniffer: latency (a fire caught at the next check) versus wasted work (checks that find nothing), the exact trade interrupts and epoll settle in systems. The design cautions are school-real too: handlers must be quick (evacuate, do not pack your bag: no blocking work in the handler) and drills must be idempotent-ish, because alarms occasionally ring twice.',
          adult:
            'Schools do not sniff for smoke on a schedule; alarms announce and rehearsed responses run. Modern software is built the same way: systems sit idle until told (a payment cleared, a sensor tripped, a customer clicked) and then run prepared handlers. It scales because a million quiet things cost nothing and the loud one gets instant attention. The management insight is the rehearsal: the response is designed and practiced before the event, never improvised during it.',
        },
      },
      {
        id: 'event-driven--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Subscribe once, issues arrive',
        maps: [
          { code: 'subscribing', analog: 'joining the magazine’s mailing list' },
          { code: 'publishing', analog: 'the new issue mailed to every subscriber' },
          { code: 'decoupling', analog: 'the magazine knows a list, not its readers' },
          { code: 'unsubscribing', analog: 'leaving the list; deliveries stop' },
        ],
        text: {
          child:
            'You do not visit the magazine printer every day asking "is the new issue out?" You subscribe once, and every new issue just shows up in your mailbox. The magazine does not know you personally: it only keeps a list, and mails everyone on it. Join the list, things arrive. Leave the list, they stop!',
          highschool:
            'Magazine subscriptions are publish/subscribe: readers register interest once, publishers mail each new issue to the whole list, and neither side tracks the other personally: the list decouples them. Software components communicate this way at scale: an "order shipped" event goes to whoever subscribed (email service, analytics, inventory), and the publisher neither knows nor cares who is listening. Adding a new reader never requires changing the magazine.',
          undergrad:
            'The subscription model is pub/sub with its architectural payoff: publishers emit to a topic, subscribers register interest, and the broker (the mailing house) decouples them so systems evolve independently: new subscribers appear without touching the publisher, the loose coupling that keeps event-driven architectures maintainable. The mail adds the honest failure modes: delivery is asynchronous and occasionally lost (at-least-once vs at-most-once semantics), a vacationing reader returns to a pile (backpressure and queue depth), and issues can arrive out of order, which is why event consumers idempotently handle duplicates and reordering rather than assuming postal perfection.',
          adult:
            'Publish/subscribe runs like magazine mailing lists: interested parties sign up once, publishers send to the list, and neither maintains a relationship with the other. Companies wire systems together this way so that adding a new consumer of "a sale happened" (finance, marketing, fulfillment) requires no changes to the checkout that announced it. The looseness that makes this flexible also makes delivery statistical, so mature setups track their mail: what was sent, what was processed, and what is still sitting in the pile.',
        },
      },
      {
        id: 'event-driven--shopping',
        domain: 'shopping',
        domainLabel: 'Shopping',
        title: 'Tell me when it is back',
        maps: [
          { code: 'polling', analog: 'refreshing the product page all day' },
          { code: 'registering a listener', analog: 'leaving your email for a restock alert' },
          { code: 'the event firing', analog: 'stock arrives; notifications go out' },
          { code: 'one-shot vs persistent listener', analog: 'notify once vs every restock' },
        ],
        text: {
          child:
            'The sneakers you want are sold out. You could check the page a hundred times a day... or press "notify me when it is back" and go live your life! The shop remembers, and the moment the sneakers return, ping, there is your message. One button turned all that checking into one perfect little alert.',
          highschool:
            'Restock alerts show the two ways software waits: polling (refresh the page repeatedly: late anyway, wasteful always) versus events (register once, get told at the moment it matters). The shop keeps a list of listeners per product and fires notifications when stock arrives. Half of app development is choosing between these, and the restock button is the argument for events: better latency, less work, calmer users.',
          undergrad:
            'The restock alert is callback registration with product granularity (a listener per topic), the notification fan-out on stock arrival is the event dispatch, and the poll-versus-push comparison is quantitative here: N shoppers polling hourly is N times 24 wasted requests against one timely push, the load argument for webhooks over API polling. The subtleties shoppers meet are the engineering ones: one-shot versus persistent subscriptions (notify once, or every restock?), delivery races (sold out again before you clicked: the event described a moment, not a guarantee), and the unsubscribe path, because listener leaks in code are exactly alerts nobody wanted forever.',
          adult:
            'The "notify me when available" button is event-driven design sold to consumers: registering interest replaces obsessive checking, and word arrives at the moment of change. Businesses connect their systems on the same principle (tell me when the shipment lands, when the payment clears, when the threshold is crossed), replacing armies of periodic checks with timely pushes. The button’s fine print is the honest caveat: an alert marks a moment, and acting on it still races everyone else who got the same ping.',
        },
      },
    ],
  },
];
