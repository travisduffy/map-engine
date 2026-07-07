# Epic 5: Pathfinding Primitives (CA-4) — Phase 4 Opens

**Objective:** Deliver `setTraversalCosts` + `findPath` — A\* over the CSR adjacency graph inside the Worker with cooperative yielding — validating the Worker call harness that CA-5/6/8 build on.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 5". Normative detail: ROADMAP §9 (CA-4, F-4.1, F-4.7).

**Entry gate:** `docs/audits/phase-3-audit.md` is `[PASS]` and merged to `main`. Do not start otherwise.

**Verifiable & Measurable Success Criteria:**

- **Latency:** a 500-sector path over a 10,000-sector graph resolves in < 2 ms in the Worker; P95 over the fixture's 50 pairs < 2 ms on reference hardware.
- **Correctness:** returned `Uint16Array` paths are contiguous in the adjacency graph, start/end correct, and cost-optimal against a reference Dijkstra check on ≥ 5 fixture pairs.
- **Failure semantics:** unreachable pairs reject with `PathNotFoundError`; `findPath` before `setTraversalCosts` behaves per a documented precondition (reject with `MappingRequiredError`-analog decision recorded in PROGRESS).
- **Isolation:** `SimulationClock` drift ≤ ±2 ms while a pathfinding burst runs.

---

## Tasks

### Task 5.1 — Fixture: `test/fixtures/pathfinding/grid-10k.json`

**PRD Reference:** §"Acceptance Criteria — Epic 5"; ROADMAP §9 CA-4 Fixture.

**Work:**

- Generate (script under `test/fixtures/`, committed like `generate-fixtures.js`) a 100×100 grid graph: 10,000 nodes, 4-connected CSR arrays, `traversalCosts: Uint8Array` from a seeded PRNG (`seed=42`), and 50 start/end pairs (same seed stream) including at least one unreachable pair (cost-walled region) and pairs with expected path lengths ≥ 500.
- Schema: `{width, height, adjacencyPointers, adjacencyNeighbors, traversalCosts, pairs: [{start, end, expectedCost|null}]}` — `expectedCost` computed by a reference Dijkstra in the generator; `null` marks unreachable.

**Done when:** fixture committed; generator re-run reproduces it byte-identically (seed determinism).

---

### Task 5.2 — `SpatialGraph` (Worker A\*)

**PRD Reference:** §"New modules"; ROADMAP §9 CA-4.

**Work:**

- Create `src/worker/SpatialGraph.ts`: constructed from `adjacencyPointers`/`adjacencyNeighbors` + `traversalCosts`; `findPath(start, end): Promise<Uint16Array>` — A\* with binary-heap open set over typed arrays (scores in preallocated `Float32Array`, cameFrom in `Uint16Array`; zero per-node object allocation, PR-3), heuristic from `centroids` (euclidean, admissible with min-cost scaling).
- `await yieldIfNeeded(state)` inside the expansion loop (≤ 8 ms slices).
- Throws `PathNotFoundError` when the open set empties.

**Done when:** Node-mode unit tests over small hand-built graphs pass (shortest path, tie determinism, unreachable → `PathNotFoundError`); zero DOM/Three.js imports (`git grep -E "three|document|window" src/worker/SpatialGraph.ts` empty).

---

### Task 5.3 — Public API: `setTraversalCosts` + `findPath`

**PRD Reference:** §"Public API delta".

**Work:**

- Worker handlers: `setTraversalCosts` (receive Transferable `Uint8Array`, length must equal `sectorCount` — validate, store, (re)build `SpatialGraph`), `findPath` (delegate; `RESULT` carries the path `Uint16Array` via transfer list).
- `MapEngine.setTraversalCosts(costs: Uint8Array): Promise<void>` — transfers ownership (Main does not retain; document that replacement needs a fresh allocation, §4). `MapEngine.findPath(startId: number, endId: number): Promise<Uint16Array>`.
- Both are in-flight-registered so Epic 3's lifecycle invalidation rejects them on `loadMap`/`dispose`.
- Decide + document the `findPath`-before-costs precondition (reject, typed error) in PROGRESS and TSDoc.
- Update `example/src/main.ts`: click two sectors → path computed and visualized (e.g., palette highlight of path sectors).

**Done when:** browser-mode integration test round-trips a fixture path through the real Worker; `costs.byteLength === 0` on Main post-call; lifecycle rejection test extended to `findPath`.

---

### Task 5.4 — Performance gate + drift assertion (F-4.7)

**PRD Reference:** §"Acceptance Criteria — Epic 5".

**Work:**

- Playwright perf spec: load `grid-10k.json`, run the 50 fixture pairs, assert P95 < 2 ms and the ≥ 500-sector pair < 2 ms (reference hardware; 5.0× CI tolerance).
- Concurrent-load drift test: sample `SimulationClock` telemetry during a continuous `findPath` burst; assert drift ≤ ±2 ms.
- Verify path costs equal the fixture's reference `expectedCost` values.

**Done when:** perf JSON checked in with measured values; drift assertion green; results logged in PROGRESS.md.
