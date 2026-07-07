# Epic 7: Spatial Anchoring (CA-8)

**Objective:** Guaranteed-interior label anchor points for every sector — Pole of Inaccessibility (polylabel) computed in the Worker from B1.e contour rings, delivered via Transferable handoff with a sync `getAnchor` accessor.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 7". Normative detail: ROADMAP §9 (CA-8, F-4.5, F-4.6); prerequisite A0.3 fixtures already exist (`test/fixtures/anchor-shapes.json`).

**Verifiable & Measurable Success Criteria:**

- **Fixture pass:** 100% of `anchor-shapes.json` fixtures (≥ 20, covering all 7 shape classes) produce anchors within each fixture's `tolerancePx ≤ 1.0` of `expectedAnchor`.
- **Interiority:** every computed anchor lies strictly inside its sector's pixel set (`pixelIndices[anchor] === sectorId`) — including annulus, spiral, and narrow-corridor shapes where centroids fail.
- **Handoff discipline:** `anchors` (`Int16Array`, `sectorCount·2`) allocated Worker-side on first `computeAnchors` (`INIT_ANCHORS`), delivered via the Epic 6 ring pool; `getAnchor` is synchronous.
- **Isolation:** `SimulationClock` drift ≤ ±2 ms during anchor computation.

---

## Tasks

### Task 7.1 — Polylabel implementation (Worker)

**PRD Reference:** §"Acceptance Criteria — Epic 7"; ROADMAP §9 CA-8 Algorithm.

**Work:**

- Implement Pole of Inaccessibility in a Worker-safe module (e.g., `src/worker/polylabel.ts`, `@internal`): quadtree cell subdivision with priority queue, point-to-ring signed distance over the sector's contour rings (from `contourPointers`/`contourPoints`, segments `[x1,y1,x2,y2]`), default precision 1.0 px. Handle multi-ring sectors (holes: annulus class) via signed distance across all rings of the sector.
- Typed-array queue storage; `await yieldIfNeeded(state)` between cell batches (≤ 8 ms slices).
- Note (PR-4): implement internally rather than adding a dependency; the algorithm is ~150 lines and the mapbox reference is the behavioral spec.

**Done when:** Node-mode unit tests against hand-computable shapes (square → center; L-shape → interior of larger arm) pass; multi-pole class returns a deterministic single anchor (max-distance tie broken by first-found, documented).

---

### Task 7.2 — `computeAnchors` / `getAnchor` wiring

**PRD Reference:** §"Public API delta".

**Work:**

- Worker handler `computeAnchors`: on first call allocate `anchors: Int16Array(sectorCount·2)` and emit `INIT_ANCHORS`; iterate all sectors (yielding), write `[x, y]` per sector, deliver via ring-pool Transferable handoff (F-4.6).
- `MapEngine.computeAnchors(): Promise<void>` (lifecycle-invalidation registered) and `MapEngine.getAnchor(sectorId: number): [number, number]` — sync read from Main-current buffer; throws before first computation completes (documented, matching `getGroupBBox` semantics).
- Update `example/src/main.ts`: render a label/marker at each sector's anchor (this is the feature's demo and a visual regression canary).

**Done when:** integration test computes anchors on the 4×4 fixture and reads them synchronously; lifecycle rejection covered; example renders anchors via `npm run example` smoke check.

---

### Task 7.3 — Fixture acceptance + drift

**PRD Reference:** §"Acceptance Criteria — Epic 7".

**Work:**

- Acceptance spec iterating every fixture in `test/fixtures/anchor-shapes.json`: build the shape's registry, compute anchors, assert `|anchor − expectedAnchor| ≤ tolerancePx` and interiority (`pixelIndices` membership).
- Concurrent-load drift test during anchor computation: `SimulationClock` drift ≤ ±2 ms.

**Done when:** 100% fixture pass in `npm run test`; drift green; results logged in PROGRESS.md.
