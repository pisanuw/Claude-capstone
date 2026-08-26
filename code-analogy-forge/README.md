# Code Analogy Forge

Paste any code snippet or name a CS concept, pick your audience, and get **three sharply framed analogies from different everyday domains**, ready for a lecture slide, a blog post, or a meeting with stakeholders.

Live: **<https://code-analogy-forge.netlify.app>**

Built from idea 2026-08-25 n1 in [pisanuw/daily-project-ideas](https://github.com/pisanuw/daily-project-ideas).

## What it does

- **Audience calibration.** Every analogy is hand-written in four variants: curious child, high school student, CS undergraduate, and non-technical adult. Switching the audience swaps the entire text, not just the vocabulary: the undergraduate variant ties the imagery to formal terms (invariants, O(log n), the call stack), the child variant keeps only the imagery.
- **Three domains per concept.** Each concept ships analogies from three distinct everyday domains (cooking, sports, city planning, post office, board games, ...), each with a "this maps to that" table connecting code terms to the analogy.
- **A bundled example per concept.** The "Try an example" menu loads 25 snippets across JavaScript, Python, Java, C, and shell (Fibonacci, a closure counter factory, a linked-list node, worker threads, a git branch flow, BFS over a friend graph, ...), each test-pinned to rank its intended concept first.
- **Concept detection.** Paste real code and a hand-written detector figures out what it shows: keyword mentions ("hash map", "recursion") plus code-shape patterns (a `while` loop, `lo`/`hi`/`mid` bounds, `.push()` + `.pop()`, a function whose body calls itself, found by brace-matching or Python indentation). Detected concepts are ranked with visible evidence, and chips let you jump between everything that was found.
- **Personal library.** Save your best analogies with tags and a note; search and filter them later. Stored in `localStorage`.
- **Shareable read-only links.** Every card can produce a URL that renders the exact analogy, audience, and your note, with no server: the payload is base64url-encoded ids in the URL hash, resolved against the corpus that ships with the app.
- **Markdown export.** One click copies a card as Markdown (heading, audience line, body, mapping table, optional note) for slides, READMEs, or Stack Overflow answers.

## Deviations from the idea prompt

The idea suggested the Claude API for generating analogies and Supabase for accounts and storage. Both are replaced with deterministic client-side machinery:

- A **curated corpus** (25 concepts x 3 domains x 4 audience variants = 300 hand-written analogy texts) replaces on-demand LLM generation. The output is instant, free, offline, reproducible, and every mapping has been checked by a person rather than sampled from a model.
- **localStorage** replaces Supabase: no accounts, nothing leaves the browser.
- Share links work by **reference into the bundled corpus** instead of a database row, so they are short and permanent.

The tradeoff is honest: the forge only knows its 25 concepts (variables, functions/returns, conditionals, loops, arrays, hash maps, stacks, queues, trees, binary search, sorting, recursion, async/await, classes/OOP, closures, pointers/references, exceptions, caching, threads/parallelism, Big-O, version control, APIs, encryption, binary numbers, graphs). Arbitrary code outside that set gets "no known concept detected" rather than a hallucinated analogy.

## Development

```bash
npm install
npm run dev        # local dev server
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run coverage   # vitest with v8 coverage (thresholds: 85%)
npm run build      # typecheck + vite production build
```

97 vitest tests cover the corpus invariants (every concept has 3+ analogies from distinct domains, all four audience variants present and substantial, no em dashes in prose), the detector (keywords, code shapes, self-call analysis in four definition styles), share-link encoding (round trips, tampering, unknown ids), the library (persistence, corrupt-storage recovery, search, tags), and Markdown export. Statement coverage is 99.9%; the DOM layer (`src/ui/`, `src/main.ts`) is exercised end-to-end in headless Chromium instead.

## Architecture

```
src/core/types.ts        Audience, Analogy, Concept, Detection, SavedAnalogy
src/core/corpus/         the hand-written analogy corpus (basics, data structures,
                         algorithms, paradigms, systems, practice) + id lookups
src/core/detect.ts       keyword + code-shape detector, self-call finder
src/core/examples.ts     the 25 bundled example snippets, one per concept
src/core/share.ts        base64url share-link encode/decode (versioned, validated)
src/core/library.ts      localStorage-backed library (storage injected for tests)
src/core/markdown.ts     Markdown export
src/ui/app.ts            vanilla-DOM UI (no framework, zero runtime deps)
```
