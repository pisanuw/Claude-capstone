# Changes

## 2026-08-20 · v1.0.0

Initial release.

- Grid editor: walls, mud (cost 5), erase, draggable start/goal pins, three grid sizes
- Five algorithms (BFS, DFS, Dijkstra, Greedy best-first, A*) emitting a uniform event trace
- Playback: 2 to 60 expansions/s, pause, step, scrub, replay, skip to end
- Deterministic rule-based narration per expansion; final summary with optimality note
- Side-by-side compare mode with verdict line
- Per-cell cost overlay (f, else g)
- Share links: map + settings run-length encoded into the URL hash
- Maze generator (guarded recursive division) and mud sprinkle, both seeded
- 20 vitest cases: A* cost equals Dijkstra on 60 random weighted grids, BFS shortest-steps, path validity, no-route detection, share round trips, maze solvability across 20 seeds, trace determinism
- Deployed to https://pathfinding-playground-pisanuw.netlify.app
