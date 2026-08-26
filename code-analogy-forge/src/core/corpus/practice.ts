import type { Concept } from '../types';

export const practice: Concept[] = [
  {
    id: 'big-o',
    name: 'Big-O and scaling',
    tagline: 'How the work grows when the input grows: the shape of the cost, not the speed.',
    analogies: [
      {
        id: 'big-o--cooking',
        domain: 'cooking',
        domainLabel: 'Cooking',
        title: 'Doubling the recipe',
        maps: [
          { code: 'O(1)', analog: 'tasting the soup: one spoonful however big the pot' },
          { code: 'O(n)', analog: 'chopping: twice the guests, twice the onions' },
          { code: 'O(n²)', analog: 'pairing every dish with every wine' },
          { code: 'constant factors', analog: 'a sharper knife chops faster but still scales the same' },
        ],
        text: {
          child:
            'Think about cooking for more people. Tasting the soup is one spoonful whether the pot is small or giant. Chopping onions doubles when the guests double. And trying every dish with every drink to find the best matches? Add a few dishes and the tries explode. Different chores grow differently: that is the whole idea.',
          highschool:
            'Big-O is about how kitchen work grows with the guest list. Tasting is O(1): one spoonful, any pot size. Chopping is O(n): double the guests, double the onions. Pairing every dish with every wine is O(n²): going from 5 dishes to 10 takes you from 25 tastings to 100. A sharper knife makes chopping faster but does not change its shape: constants speed you up, growth rates decide who wins eventually.',
          undergrad:
            'The kitchen sorts the classes by shape: O(1) tasting, O(n) chopping, O(n²) all-pairs wine matching, and finding a recipe in an alphabetized box is your O(log n). The knife lesson is the one that matters: sharpening (better constants, faster hardware) never rescues an all-pairs plan at scale, while changing the plan does, which is why algorithmic wins beat micro-optimization. Asymptotics are exactly the "for a big enough dinner party" claim: below some n, the sharp knife with the naive plan still wins, and profiling tells you which regime you are in.',
          adult:
            'Big-O asks: when the workload doubles, does the work stay flat (tasting the soup), double (chopping), or quadruple (pairing every dish with every wine)? Systems that felt fine in the demo and collapsed with real customers almost always had quadrupling hiding inside. Buying faster machines sharpens the knife; it does not change which chore you picked.',
        },
      },
      {
        id: 'big-o--sports',
        domain: 'sports',
        domainLabel: 'Sports',
        title: 'Round-robin vs the bracket',
        maps: [
          { code: 'O(n²)', analog: 'round-robin: everyone plays everyone' },
          { code: 'O(n)', analog: 'a single elimination pass: n-1 games total' },
          { code: 'O(log n)', analog: 'rounds in the bracket' },
          { code: 'choosing the algorithm', analog: 'choosing the tournament format' },
        ],
        text: {
          child:
            'Imagine a tournament where every team plays every other team. With 4 teams that is 6 games; with 20 teams it is 190 games! A bracket is smarter: lose and you are out, so 20 teams need only 19 games. Same question, who is best, but wildly different amounts of playing.',
          highschool:
            'Tournament formats are algorithms with costs. Round-robin is O(n²): every pair plays, so doubling the teams quadruples the games. Single elimination is O(n) total games (each game removes one team, so n-1 games), stacked into only O(log n) rounds. Leagues split into divisions precisely because n² stops scaling, which is the same reason software replaces compare-everything-with-everything designs.',
          undergrad:
            'Formats make complexity trade-offs concrete: round-robin plays all n(n-1)/2 pairs, O(n²), and buys the most information; single elimination spends n-1 games, O(n), in log2(n) rounds, and answers only "who is champion". That information-versus-cost trade is algorithm choice in general: you rarely get the cheapest cost and the fullest answer at once. Seeding, divisions, and Swiss systems are the practical middle points, exactly like the heuristics real systems use when exact all-pairs work is unaffordable.',
          adult:
            'Compare two tournament designs: everyone-plays-everyone, where doubling the field quadruples the schedule, and a knockout bracket, where 1,024 teams finish in ten rounds. Software faces this exact choice constantly, and products that "worked in the pilot" often shipped the everyone-plays-everyone design. The fix is rarely faster players; it is a different bracket.',
        },
      },
      {
        id: 'big-o--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'When the city doubles',
        maps: [
          { code: 'input size n', analog: 'the city’s population' },
          { code: 'O(n) design', analog: 'mail delivery: twice the homes, twice the routes' },
          { code: 'O(n²) design', analog: 'direct roads between every pair of neighborhoods' },
          { code: 'algorithmic redesign', analog: 'hubs and grids instead of all-pairs roads' },
        ],
        text: {
          child:
            'When a city doubles, some things just double: twice the houses means twice the mail. But imagine building a private road between every pair of neighborhoods. A few neighborhoods, fine. Dozens? The whole map becomes roads! That is why real cities build grids and big shared roads instead.',
          highschool:
            'City growth exposes the growth rates. Mail scales linearly: double the homes, double the routes, O(n). A direct road between every pair of neighborhoods is O(n²): 10 neighborhoods need 45 roads, 50 need 1,225, so nobody builds that; grids and arterial roads are the redesign that keeps growth manageable. Software has the same choice between per-pair designs and shared-hub designs, and it bites at exactly the same point: when n stops being small.',
          undergrad:
            'The city gives asymptotics physical stakes: linear services (mail, trash) survive doubling; all-pairs infrastructure (n(n-1)/2 direct roads) does not, and the working fixes are algorithmic, not material: grids, arterials, and hub-and-spoke reduce pairwise connectivity to near-linear built form, accepting hops (latency) for buildable cost. That is the same bargain as replacing an all-pairs comparison with a hub data structure, and "this city cannot afford its own road plan" is precisely how quadratic systems die in production.',
          adult:
            'Watch what doubling a city does: mail routes double, but a plan with a direct road between every pair of neighborhoods more than quadruples. Nobody builds the second design in asphalt, yet software ships it regularly, every record checked against every record. The remedy is the urban one: redesign around hubs and grids, not wider bulldozers.',
        },
      },
    ],
  },
  {
    id: 'git-version-control',
    name: 'Version control (git)',
    tagline: 'A permanent history of changes, safe experiments on branches, merges to combine work.',
    analogies: [
      {
        id: 'git-version-control--library',
        domain: 'library',
        domainLabel: 'Library',
        title: 'The manuscript archive',
        maps: [
          { code: 'commit', analog: 'a dated draft filed in the archive' },
          { code: 'commit message', analog: 'the note on the folder saying what changed' },
          { code: 'revert / checkout', analog: 'pulling last Tuesday’s draft off the shelf' },
          { code: 'blame', analog: 'finding which draft a sentence first appeared in' },
        ],
        text: {
          child:
            'Version control is like a writer who never throws away a draft. Every version goes in a labeled folder: what changed and when. If today’s edits ruin the story, no problem: pull out yesterday’s folder and the old version is right there, safe and complete.',
          highschool:
            'Git is a manuscript archive: each commit is a dated draft filed with a note about what changed, and nothing is ever overwritten, only added. Ruined the chapter? Check out Tuesday’s draft. Wondering when a sentence appeared? Walk the drafts backward until it vanishes: that is what git blame automates. The archive turns "do not touch it, it works" into "touch anything, we can always go back".',
          undergrad:
            'The archive is the commit graph: immutable snapshots, each pointing at its parent, with messages as the human index. Diff is comparing two drafts page by page; blame is binary-searching history for where a line appeared, which is literally git bisect when the question is "which draft broke it". The deeper point is that safety changes behavior: with every draft recoverable, experiments are cheap, and that, not backup, is why version control rewired how software is written.',
          adult:
            'Version control is a manuscript archive where every dated draft is kept forever with a note about what changed. Any version is recoverable, any change traceable to when and who. Teams that have it experiment freely because nothing is ever truly lost; teams without it edit the only copy of the manuscript, and it shows in how carefully they tiptoe.',
        },
      },
      {
        id: 'git-version-control--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'The group essay',
        maps: [
          { code: 'branch', analog: 'each student’s own copy to edit' },
          { code: 'merge', analog: 'combining the copies into one essay' },
          { code: 'merge conflict', analog: 'two students rewrote the same paragraph' },
          { code: 'pull request', analog: 'showing your edits before they go in the final' },
        ],
        text: {
          child:
            'Version control is how a group writes one essay without chaos. Everyone gets their own copy to work on, so nobody types over anybody. At the end, the copies are combined. If two people rewrote the very same paragraph differently, the group has to sit down and pick: that part cannot merge itself.',
          highschool:
            'A group essay done right is git: each student edits their own copy (a branch), the copies are combined at the end (a merge), and edits to different paragraphs merge automatically. Two rewrites of the same paragraph are a merge conflict: the tool flags it, humans decide. Showing your changes to the group before they enter the final draft is a pull request, and it is where the actual quality control happens.',
          undergrad:
            'The group essay maps the workflow: branch for isolation, merge for integration, conflicts only where the same region diverged, review before integration as the quality gate. The non-obvious lesson is about batch size: a student who disappears for three weeks and returns with a rewritten essay produces a monster conflict, which is the argument for small frequent merges (continuous integration) over heroic ones. Git does the mechanical merging; the social protocol around it is what actually scales the team.',
          adult:
            'Version control runs a group document the way good teams run anything: everyone works on their own copy, changes are reviewed, then combined, and only genuine collisions (two people rewriting the same paragraph) need a human decision. When engineers mention "a merge conflict ate my morning", that collision is what they mean. The alternative, everyone editing one shared file live, is how words get silently lost.',
        },
      },
      {
        id: 'git-version-control--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'Save points',
        maps: [
          { code: 'commit', analog: 'saving the game before the boss' },
          { code: 'revert', analog: 'loading the save after a disaster' },
          { code: 'branches', analog: 'two save files to try both strategies' },
          { code: 'commit message', analog: 'naming the save "before fighting the dragon"' },
        ],
        text: {
          child:
            'Version control is save points in a game. Before the scary boss, you save. If it goes badly, you load the save and try again: nothing is truly lost. You can even keep two saves and try the sneaky plan in one and the brave plan in the other.',
          highschool:
            'Commits are save points: save before anything risky, and disaster becomes "load and retry" instead of "start over". Keeping two save files to try both strategies is branching, and naming saves properly ("before dragon", not "save3") is the commit-message habit that pays off later. Programmers commit before risky changes for exactly the reason you save before the boss.',
          undergrad:
            'Save points give the right instincts: commit early (save often), commit before risk, name saves so future-you can navigate, and keep parallel saves (branches) to explore alternatives cheaply. The place the analogy deliberately breaks is instructive: git keeps every save forever and lets you diff two saves, ask when an item vanished (bisect), and splice one save’s progress onto another (cherry-pick), a save system no game ships. Cheap saves change how boldly you play, which is the actual point of version control.',
          adult:
            'Version control is save points for work: snapshot before anything risky, and failure costs a reload, not the project. Two named saves let a team try two strategies in parallel and keep the better one. People who work without it are speed-running with no saves, and their caution around "the working version" is the tell.',
        },
      },
    ],
  },
  {
    id: 'api',
    name: 'APIs',
    tagline: 'A published contract for asking a system to do things, hiding how it does them.',
    analogies: [
      {
        id: 'api--restaurant',
        domain: 'restaurant',
        domainLabel: 'Restaurant',
        title: 'The menu, not the kitchen',
        maps: [
          { code: 'the API', analog: 'the menu' },
          { code: 'a request', analog: 'ordering a listed dish' },
          { code: 'the implementation', analog: 'the kitchen, free to change' },
          { code: 'breaking change', analog: 'removing a dish regulars depend on' },
        ],
        text: {
          child:
            'An API is like a restaurant menu. The menu tells you exactly what you can order, and you order from it: you do not walk into the kitchen and cook. The cooks can change how they make the soup any time, and you never notice, as long as the soup on the menu still comes when you ask.',
          highschool:
            'The menu is the API: the published list of what you may request and what you will get back. The kitchen is the implementation, and the separation is the point: the restaurant can retrain cooks and swap suppliers freely, as long as the menu still holds. Removing a dish that regulars order is a breaking change, which is why real menus, like real APIs, retire things carefully.',
          undergrad:
            'The menu formalizes the interface/implementation boundary: dishes are endpoints, the description is the request/response schema, "no substitutions" is input validation, and the kitchen may be rewritten wholesale behind an unchanged menu, which is the entire economics of stable interfaces. Menu v2 running alongside v1 for the regulars is API versioning; off-menu orders that some waiter honors are the undocumented behavior clients end up depending on, and why "the menu is the contract" has to be enforced, not just printed.',
          adult:
            'An API is a menu: a published promise about what can be asked for and what comes back, with the kitchen kept private. Companies integrate with each other by menu, never by kitchen, which is why one side can rebuild everything internal without breaking the other. The discipline that matters is menu stability: remove a dish carelessly and every regular, meaning every dependent system, breaks at once.',
        },
      },
      {
        id: 'api--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'The standard wall outlet',
        maps: [
          { code: 'the API', analog: 'the outlet’s standard shape and voltage' },
          { code: 'clients', analog: 'every appliance with a matching plug' },
          { code: 'the implementation', analog: 'the grid behind the wall' },
          { code: 'adapter pattern', analog: 'a travel plug adapter' },
        ],
        text: {
          child:
            'An API is like the wall outlet. Every lamp and toaster has a plug that fits, and none of them care where the electricity comes from: dams, windmills, whatever. The outlet shape is a promise. As long as the promise holds, everything just plugs in and works.',
          highschool:
            'The wall outlet is an API: a fixed shape and voltage that every appliance builds against, with the entire grid hidden behind it. Power plants can be swapped and lines rerouted, and your lamp never knows: implementation changes behind a stable interface. Different countries choosing different outlets is why travel adapters exist, and a software adapter does exactly the same job between two interfaces.',
          undergrad:
            'The outlet shows why interfaces beat integrations: n appliances and m power sources meet at one standard instead of n times m custom hookups, the exact combinatorial argument for APIs between services. The contract has both syntax (plug shape) and semantics (voltage, frequency), and honoring shape while changing semantics fries clients: the subtle kind of breaking change. Adapters bridge interfaces at some loss; changing the national outlet standard is a migration, painful in proportion to the installed base, which is why interface design deserves more care than implementation.',
          adult:
            'An API is the standard wall outlet: one agreed shape that lets any appliance use any power source without either knowing about the other. Standards like this are why an entire industry can plug into a payment provider or a mapping service in a day. And like outlets, changing one is a big deal precisely because so much is plugged in: interface changes are infrastructure projects, not edits.',
        },
      },
      {
        id: 'api--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'Standard forms at the counter',
        maps: [
          { code: 'endpoint', analog: 'the specific service window' },
          { code: 'request schema', analog: 'the form’s required fields' },
          { code: 'validation error (400)', analog: 'the form handed back: missing postcode' },
          { code: 'response', analog: 'the stamped receipt with a tracking number' },
        ],
        text: {
          child:
            'An API is like the post office counter. To send a package, you fill in their form: name, address, weight, all the boxes. Fill it right and you get a stamped receipt back. Miss a box and the clerk slides it back: they cannot process a half-filled form, no matter how nicely you ask.',
          highschool:
            'A post office runs on forms, and so do APIs: each service window (endpoint) takes a specific form (request), checks the required fields, and hands back a standard receipt (response). A form missing the postcode comes straight back: that is a validation error, the 400 you see in web development. The strictness is the feature: because forms are exact, millions of strangers can use the service without ever talking to a human about what they meant.',
          undergrad:
            'The counter is a typed interface: windows are endpoints, forms are request schemas, the clerk’s checklist is validation, receipts are structured responses, and the wall of posted rules is the documentation clients actually integrate against. The design lessons transfer whole: reject bad forms at the counter, not deep in the sorting facility (validate at the boundary); keep old forms working when new fields appear (backward compatibility); and never behave differently for the same completed form, because clients script against the counter’s behavior, not its intentions.',
          adult:
            'An API works like a post office counter: standardized forms in, standardized receipts out, and a clerk who rejects incomplete forms on the spot. The rigidity is what makes it scale: no negotiation, no interpretation, so any two systems that agree on the forms can do business unattended. When engineers integrate with a service, reading its form catalog, the API documentation, is the actual work.',
        },
      },
    ],
  },
  {
    id: 'encryption',
    name: 'Encryption',
    tagline: 'Scrambling data so only the holder of the right key can read it.',
    analogies: [
      {
        id: 'encryption--post-office',
        domain: 'post-office',
        domainLabel: 'Post office',
        title: 'The padlock anyone can click shut',
        maps: [
          { code: 'public key', analog: 'your open padlock, handed out freely' },
          { code: 'private key', analog: 'the one key that opens it, never shared' },
          { code: 'encrypting', analog: 'clicking the padlock shut on a box' },
          { code: 'intercepted ciphertext', analog: 'a locked box in a thief’s hands' },
        ],
        text: {
          child:
            'Here is a mail trick. You hand out open padlocks with your name on them, but you keep the only key. Anyone can put a letter in a box and click your padlock shut: easy. But once it clicks, only your key opens it. Even the person who locked it cannot get back in!',
          highschool:
            'Public-key encryption is the padlock trick: the open padlock is your public key, handed to anyone; the key that opens it is your private key, shared with no one. Anyone can lock a box to you (encrypt), and clicking shut needs no key, but opening does. A thief who steals the box in transit holds a locked box: that is what an intercepted encrypted message is worth.',
          undergrad:
            'The padlock captures asymmetry’s core: locking (encrypt, public) and unlocking (decrypt, private) are different capabilities, so secure messages need no prior shared secret, which is the problem symmetric crypto could not solve. The click is a one-way operation, standing in for the trapdoor math. Two honest caveats the analogy carries well: everything rests on the private key staying private, and a forger handing out their own padlocks stamped with your name is the man-in-the-middle, which is why certificates exist to vouch for whose padlock is whose.',
          adult:
            'Modern encryption is a padlock trick: you distribute open padlocks freely and keep the only key. Anyone can lock a message to you; only you can open it. This is what the browser padlock icon actually means, boxes locked to the site, and why stolen encrypted data is often a non-event while a stolen key is a catastrophe: the boxes were never the secret, the key was.',
        },
      },
      {
        id: 'encryption--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Coded notes across the classroom',
        maps: [
          { code: 'plaintext', analog: 'what the note really says' },
          { code: 'ciphertext', analog: 'the gibberish anyone can intercept' },
          { code: 'the key', analog: 'the letter-swapping rule two friends agreed on' },
          { code: 'breaking the cipher', analog: 'the teacher noticing E is always X' },
        ],
        text: {
          child:
            'Two friends passing notes agree on a secret rule: every letter slides three steps, so A becomes D. Now a grabbed note reads like nonsense. The message travels right through everyone’s hands, and only the friend who knows the rule can slide the letters back.',
          highschool:
            'The coded note is the whole encryption pipeline: the real message (plaintext), the sliding rule (the key), the gibberish (ciphertext), and the friend reversing the rule (decryption). It also teaches the classic failure: a simple letter-swap leaks patterns, the most common symbol is probably E, and a patient teacher breaks it by frequency counting. Hiding the message is easy; hiding the patterns is the hard part real ciphers are built for.',
          undergrad:
            'Classroom ciphers are the historical on-ramp: Caesar and substitution fall to frequency analysis because they preserve plaintext structure, which motivates the modern requirement that ciphertext be indistinguishable from noise. Two principles fall out directly: security must live entirely in the key, not in the secrecy of the method (Kerckhoffs), and inventing your own cipher is how you get the teacher-breaks-it-by-lunch outcome, the standing argument against rolling your own crypto. The agreed rule also poses the key-exchange problem: how did the friends share it without the teacher hearing?',
          adult:
            'Encryption is the coded-note idea done industrially: an agreed rule turns a message into gibberish that can pass through anyone’s hands. The schoolroom version also explains the standard warnings: simple homemade codes leak patterns and get broken by anyone patient, so real systems use vetted, heavily attacked methods, and the entire secret lives in the key, which is why key management, not math, is where organizations actually fail.',
        },
      },
      {
        id: 'encryption--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'The locked suitcase and the key problem',
        maps: [
          { code: 'symmetric encryption', analog: 'one key locks and unlocks the suitcase' },
          { code: 'key exchange', analog: 'getting that key to your friend abroad, safely' },
          { code: 'ciphertext in transit', analog: 'the locked case riding through every airport' },
          { code: 'weak password', analog: 'a 3-digit luggage lock' },
        ],
        text: {
          child:
            'You mail a locked suitcase to a friend far away. Handlers and airports touch it the whole trip, and none of that matters: it is locked. But here is the puzzle: your friend needs the key. You cannot tape it to the suitcase! Getting the key there safely is its own separate problem.',
          highschool:
            'The locked suitcase is symmetric encryption: one key locks and unlocks, the case travels through untrusted hands safely, and the whole scheme hangs on the key delivery. Mail the key alongside and you have encrypted nothing. That key-delivery puzzle is called key exchange, and the flimsy 3-digit lock is the weak password: the case looks protected and opens in minutes.',
          undergrad:
            'The suitcase frames the two-part architecture of real crypto: symmetric ciphers are the strong, fast lock for the payload, and the key-delivery puzzle is solved by the padlock trick (asymmetric crypto) or by Diffie-Hellman, agreeing on a key in public without ever shipping it. That is precisely a TLS handshake: asymmetric to establish the key, symmetric for the traffic. The 3-digit lock generalizes to key space: security is measured by the cost of trying every key, and short keys make that cost an afternoon.',
          adult:
            'Encryption in transit is a locked suitcase through untrusted airports: contents safe, provided the key traveled separately and the lock is not a 3-digit toy. Every secure website performs this ritual invisibly, first arranging the key safely, then shipping locked cases both ways. The practical failures are luggage failures: keys taped to cases (passwords in the same email) and toy locks (weak passwords), far more than picked locks.',
        },
      },
    ],
  },
  {
    id: 'binary',
    name: 'Binary numbers',
    tagline: 'Counting with two symbols: how computers represent everything.',
    analogies: [
      {
        id: 'binary--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Counting to 31 on one hand',
        maps: [
          { code: 'bit', analog: 'one finger, up or down' },
          { code: 'place values', analog: 'thumb 1, index 2, middle 4, ring 8, pinky 16' },
          { code: 'binary number', analog: 'the pattern of raised fingers' },
          { code: 'n bits, 2^n values', analog: 'five fingers, 32 patterns' },
        ],
        text: {
          child:
            'Your fingers can count way past five! Let the thumb be worth 1, the next finger 2, then 4, then 8, then 16: each finger doubles. Raise the thumb and the middle finger and you are showing 1 plus 4, which is 5. Using every finger, one hand counts all the way to 31.',
          highschool:
            'Finger binary shows the system: each finger is a bit, worth double the one before (1, 2, 4, 8, 16), and a number is just which fingers are up. One hand covers 0 to 31 because 5 bits give 2^5 = 32 patterns. Computers count exactly this way, with billions of two-state "fingers", and every file you own is at bottom a very long pattern of them.',
          undergrad:
            'Finger counting is positional notation base 2: doubling place values, n bits spanning 2^n values, and the reading rule "sum the raised places". The doubling is where the powers-of-two folklore comes from: one more finger doubles the range, which is why 8 bits cap at 255, why 32-bit counters overflow at 4 billion, and why adding one bit to a key doubles a brute-forcer’s work. Overflow is physical here: 31 plus 1 needs a sixth finger, and without one you wrap to zero, the classic integer overflow.',
          adult:
            'Computers count the way you can on one hand if each finger doubles: 1, 2, 4, 8, 16, and the raised-finger pattern is the number. Five fingers reach 31; each added finger doubles the reach. That doubling explains the magic numbers all over tech, 255, 4 billion, 64-bit, and why systems hit hard cliffs at them: the hand simply has no next finger.',
        },
      },
      {
        id: 'binary--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'A panel of light switches',
        maps: [
          { code: 'bit', analog: 'one switch, on or off' },
          { code: 'a byte', analog: 'a row of 8 switches: 256 patterns' },
          { code: 'encoding', analog: 'agreeing what each pattern means' },
          { code: 'why two states', analog: 'switches are cheap, reliable, and unambiguous' },
        ],
        text: {
          child:
            'Look at a panel of light switches. One switch makes two patterns: on or off. Two switches make four patterns. Eight switches make 256 different patterns! If we agree that one pattern means the letter A and another means B, then flipping switches can spell out anything.',
          highschool:
            'A switch panel is binary hardware: each switch is a bit, and 8 switches give 2^8 = 256 patterns, which is a byte. Meaning comes by agreement: this pattern is the letter A (that agreement is ASCII), that one a pixel’s shade of red. Machines use two states rather than ten because a switch is unambiguous: on or off, with no squinting at in-between, which is what makes copying billions of them error-free.',
          undergrad:
            'The panel separates the two ideas students merge: representation (8 switches, 256 states) and encoding (the agreed table from pattern to meaning: ASCII, two’s complement, RGB). The same 01000001 is "A", 65, or a red level depending on which agreement is in force: bits carry no type. The two-state choice is an engineering argument: maximal noise margin between voltage levels, so a slightly weak signal still reads unambiguously, which is why digital copies are perfect and analog copies degrade.',
          adult:
            'Everything digital is a wall of two-position switches plus an agreement about what each pattern means: 8 switches make 256 patterns, enough for a letter; millions make a photo. The two-position choice is why digital beats analog at copying: a switch is either on or off, so the billionth copy is identical to the first. "Digitizing" something just means writing it down in switch patterns.',
        },
      },
      {
        id: 'binary--board-games',
        domain: 'board-games',
        domainLabel: 'Games',
        title: 'Twenty questions',
        maps: [
          { code: 'one bit', analog: 'one yes/no answer' },
          { code: 'n bits', analog: 'n questions: 2^n things distinguishable' },
          { code: 'good encoding', analog: 'questions that halve the possibilities' },
          { code: '20 bits', analog: 'about a million things pinned down' },
        ],
        text: {
          child:
            'In twenty questions, every answer is just yes or no, and yet twenty of them can find almost anything you are thinking of. Each good question cuts the possibilities in half: half, half, half... Twenty halvings can pick one thing out of a million. Tiny answers, huge power.',
          highschool:
            'Twenty questions shows what a bit is worth: one yes/no answer distinguishes two possibilities, two answers four, and twenty answers 2^20, about a million. That is why a bit is the unit of information: n of them pin down one thing among 2^n. The skill of the game, asking questions that split the world in half, is the same skill as designing an efficient encoding.',
          undergrad:
            'The game is information theory played aloud: each ideal question yields one bit, log2(N) questions are necessary and sufficient for N possibilities, and lopsided questions ("is it this exact aardvark?") waste their bit, which is the intuition behind entropy as average information per answer. It connects outward cleanly: binary search is twenty questions against a sorted range, and Huffman coding is the strategy of spending fewer questions on likely answers, the same trick good players use.',
          adult:
            'Twenty questions explains why computers get so much from so little: each yes/no answer halves the possibilities, so twenty answers pick one item from a million and thirty from a billion. All digital data is stored questions-and-answers of exactly this kind. It is also why "just one more bit" matters in security: every added yes/no doubles the search an attacker faces.',
        },
      },
    ],
  },
  {
    id: 'graph',
    name: 'Graphs',
    tagline: 'Things connected to things: nodes and edges, cycles allowed.',
    analogies: [
      {
        id: 'graph--city-planning',
        domain: 'city-planning',
        domainLabel: 'City planning',
        title: 'The metro map',
        maps: [
          { code: 'nodes', analog: 'the stations' },
          { code: 'edges', analog: 'the track segments between them' },
          { code: 'shortest path', analog: 'the route with the fewest stops' },
          { code: 'high-degree node', analog: 'the big interchange station' },
        ],
        text: {
          child:
            'A graph is like a metro map: dots for stations, lines connecting them. To get across town you hop dot to dot along the lines, and there are usually several ways around, because the lines loop and cross. Finding the way with the fewest stops is the game computers play on maps like this.',
          highschool:
            'The metro map is a graph: stations are nodes, track segments are edges, and a journey is a path. Unlike a tree, lines loop and cross, so many routes connect the same two stations, and route-finding means comparing them: fewest stops, or fewest minutes if each segment is labeled with a time (a weighted graph). The big interchange everyone transfers through is a high-degree node, busy for exactly the reason hub airports are.',
          undergrad:
            'The metro is the working model for graph algorithms: fewest stops is BFS (unweighted shortest path), fewest minutes is Dijkstra on edge weights, and "can I get there at all?" is connectivity. Cycles are what separate this from the tree chapter: multiple routes exist, so traversals must remember visited stations or loop forever. The interchange is a cut vertex when its closure splits the network, which is why transit planners and network engineers run the same centrality analyses on the same math.',
          adult:
            'A graph is a metro map: stations, connections, and many possible routes because lines loop. A surprising amount of software is route-finding on such maps: driving directions, delivery logistics, even "how did this outage spread". The map view also shows fragility: the big interchange station everything routes through is the component whose failure takes half the network with it.',
        },
      },
      {
        id: 'graph--travel',
        domain: 'travel',
        domainLabel: 'Travel',
        title: 'Airline routes and hub airports',
        maps: [
          { code: 'nodes / edges', analog: 'airports and direct flights' },
          { code: 'path length', analog: 'number of connections' },
          { code: 'hub-and-spoke', analog: 'a few airports carrying most routes' },
          { code: 'cascading failure', analog: 'one closed hub grounding half the network' },
        ],
        text: {
          child:
            'Airline routes make a graph: airports are the dots, direct flights are the lines. Small airports connect to a big hub, and the hub connects to everywhere, so most trips are two hops: little airport to hub, hub to wherever. But if a storm closes the hub, suddenly a lot of places are hard to reach!',
          highschool:
            'Flight networks are graphs with structure: airports (nodes), direct flights (edges), and a journey’s connections counting its path length. Airlines choose hub-and-spoke shapes because n spokes into a hub connect everyone in two hops with only n routes, instead of a direct flight between every pair. The price of that efficiency is fragility: close the hub and a huge slice of the network goes with it.',
          undergrad:
            'Airline networks teach graph shape as a design decision: hub-and-spoke trades edge count (O(n) routes, 2-hop paths) against the robustness of denser meshes, the same trade every network architecture makes. Degree distribution is wildly skewed (a few hubs, many spokes), so random airport closures barely matter while a targeted hub closure is catastrophic: the scale-free robustness/fragility result. Small-world hops, betweenness centrality, cascading delays as propagation along edges: the internet, power grids, and epidemics run on this exact math.',
          adult:
            'Airline routes show what graph structure buys and costs: hubs let two hops reach everywhere with few routes, and the same hubs are the single points whose closure grounds half the map. Communication networks, supply chains, and org charts share this shape, so "where are our hubs?" is a genuinely load-bearing question: they are the efficiency and the risk in one place.',
        },
      },
      {
        id: 'graph--school',
        domain: 'school',
        domainLabel: 'School',
        title: 'Who knows whom',
        maps: [
          { code: 'nodes / edges', analog: 'students and friendships' },
          { code: 'BFS layers', analog: 'friends, then friends-of-friends' },
          { code: 'connected component', analog: 'a clique nobody outside knows' },
          { code: 'degrees of separation', analog: 'the short chains linking almost everyone' },
        ],
        text: {
          child:
            'Draw every student as a dot and a line between friends: that is a graph. News travels along the lines: your friends hear first, then their friends, then theirs, spreading ring by ring. Some friend groups are so tight and separate that news from outside barely reaches them at all.',
          highschool:
            'The friendship map is a graph, and gossip performs breadth-first search on it: your friends are layer one, friends-of-friends layer two, rippling outward. Tight groups with few outside links are clusters, and the whole "six degrees of separation" claim is about path lengths in this graph being surprisingly short. Social apps literally store this structure and run these traversals for "people you may know".',
          undergrad:
            'The social graph grounds the algorithm-and-structure pairing: gossip spread is BFS with layers as distance, an isolated clique is a connected component, the popular student bridging two groups has high betweenness, and "people you may know" is triadic closure over 2-hop paths. Short average path length with heavy clustering is the small-world property, and the same traversal mathematics governs epidemics, memes, and outage cascades, which is why sociology and network engineering keep citing the same theorems.',
          adult:
            'Map who-knows-whom with dots and lines and you have the structure social platforms, recruiters, and epidemiologists all work on. News and viruses spread the same way over it, ring by ring outward. The practically useful reading: the people bridging two otherwise separate clusters carry outsized influence and risk, and finding them is a graph question, not a people question.',
        },
      },
    ],
  },
];
