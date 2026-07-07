# Epic 7: Spatial Anchoring (CA-8)

**Objective:** Guaranteed-interior label anchor points for every sector — Pole of Inaccessibility (polylabel) computed in the Worker from B1.e contour segments, delivered via Transferable handoff with a sync `getAnchor` accessor.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 7". Normative detail: ROADMAP §9 (CA-8, F-4.5, F-4.6); prerequisite A0.3 fixtures already exist (`test/fixtures/anchor-shapes.json`).

**Verifiable & Measurable Success Criteria:**

- **Fixture pass:** 100% of `anchor-shapes.json` fixtures (≥ 20, covering all 7 shape classes) produce anchors within a fixed `1.0 px` tolerance of `expectedAnchor`. (The fixture schema has no per-record `tolerancePx` field — each fixture is `{id, type, points, expectedAnchor}`; 1.0 px is CA-8's default precision applied uniformly.)
- **Interiority:** every computed anchor lies strictly inside its sector's boundary — including annulus, spiral, and narrow-corridor shapes where centroids fail. On a real bootstrapped registry (Task 7.2's integration test) this is `pixelIndicesMirror[anchor] === sectorId` (Main-side check — `pixelIndices` itself is Worker-owned post-bootstrap, see Task 7.2). On the `anchor-shapes.json` fixtures (Task 7.3), which encode continuous-coordinate polygon rings with no pixel/bitmap data at all, this is a point-in-polygon (crossing-number) test against the fixture's ring points.
- **Handoff discipline:** `anchors` (`Int16Array`, `sectorCount·2`) allocated Worker-side on first `computeAnchors` (`INIT_ANCHORS`), delivered via the Epic 6 ring pool; `getAnchor` is synchronous.
- **Isolation:** `SimulationClock` drift ≤ ±2 ms during anchor computation.

---

## Tasks

### Task 7.1 — Polylabel implementation (Worker)

**PRD Reference:** §"Acceptance Criteria — Epic 7"; ROADMAP §9 CA-8 Algorithm.

**Work:**

- Implement Pole of Inaccessibility in a Worker-safe module (e.g., `src/worker/polylabel.ts`, `@internal`): quadtree cell subdivision with priority queue, point-to-boundary signed distance over the sector's contour segments (from `contourPointers`/`contourPoints`: an **unordered flat CSR list** of unit-length raster-crack segments `[x1,y1,x2,y2]` per sector — outer-boundary and hole-boundary edges are interleaved in raster-scan order with no ring grouping or connectivity guarantee; see the contour-extraction comments in `src/SectorRegistry.ts`), default precision 1.0 px. Both the point-in-polygon test (crossing-number/ray-cast) and the min-distance-to-boundary computation are ring-order-agnostic over a flat edge set, so multi-ring sectors (holes: annulus class) need no ring-separation logic — iterate every segment in the sector's flat list uniformly.
- Typed-array queue storage; `await yieldIfNeeded(state)` between cell batches (≤ 8 ms slices).
- Note (PR-4): implement internally rather than adding a dependency; the algorithm is ~150 lines and the mapbox reference is the behavioral spec.

**Done when:** Node-mode unit tests against hand-computable shapes (square → center; L-shape → interior of larger arm) pass; multi-pole class returns a deterministic single anchor (max-distance tie broken by first-found, documented).

---

### Task 7.2 — `computeAnchors` / `getAnchor` wiring

**PRD Reference:** §"Public API delta".

**Work:**

- Worker handler `computeAnchors`: on first call allocate `anchors: Int16Array(sectorCount·2)` and emit `INIT_ANCHORS`; iterate all sectors (yielding), write `[x, y]` per sector — rounding each float pole coordinate to the nearest pixel (`Math.round`, matching the `centroids` rounding convention in `SectorRegistry.ts`) before storing in the `Int16Array` (this rounding is within the 1.0 px tolerance budget, and covers single-pixel-sector edge cases) — deliver via ring-pool Transferable handoff (F-4.6).
- `MapEngine.computeAnchors(): Promise<void>` (lifecycle-invalidation registered) and `MapEngine.getAnchor(sectorId: number): [number, number]` — sync read from Main-current buffer; throws before first computation completes (documented, matching `getGroupBBox` semantics).
- Update `example/src/main.ts`: render a label/marker at each sector's anchor using the existing public `renderer.camera` (a readonly `THREE.OrthographicCamera`) with Three.js's own `Vector3.project()` for world→screen mapping, drawn as example-owned DOM overlay elements — no new library public export needed (PR-4 Conservative Surface Growth) (this is the feature's demo and a visual regression canary).

**Done when:** integration test computes anchors on the 4×4 fixture and reads them synchronously — interiority asserted via Main's `pixelIndicesMirror[anchor] === sectorId` (the only Main-resident copy; `pixelIndices` itself is Worker-owned post-bootstrap); lifecycle rejection covered; example renders anchors via `npm run example` smoke check.

---

### Task 7.3 — Fixture acceptance + drift

**PRD Reference:** §"Acceptance Criteria — Epic 7".

**Work:**

- Acceptance spec iterating every fixture in `test/fixtures/anchor-shapes.json`: each fixture is `{id, type, points, expectedAnchor}` — a continuous-coordinate polygon (`points`: flat vertex list; ring boundaries are marked by the ring's first vertex repeating at its close, e.g. the `annulus-*`/`multi-pole-*` fixtures encode outer ring + hole ring back-to-back this way) with no pixel/bitmap/`sectorId`/`tolerancePx` field. Call the Task 7.1 polylabel module directly (Node-mode) against each fixture's segment set (consecutive point pairs per ring, closed on the repeated vertex) — do **not** construct a `SectorRegistry`/bitmap from the fixture: several fixtures use non-integer coordinates (e.g. `convex-3`'s point `[50, 86.6]`) that cannot be rasterized onto a pixel grid. Assert `|anchor − expectedAnchor| ≤ 1.0 px` (fixed tolerance, matching CA-8's default precision — see Success Criteria note) and interiority via a point-in-polygon (crossing-number) test against the fixture's ring points.
- Concurrent-load drift test during anchor computation: `SimulationClock` drift ≤ ±2 ms (this exercises the full `computeAnchors` Worker path on a real bootstrapped registry — e.g. the 4×4 fixture from Task 7.2 — distinct from the Node-mode geometric-fixture pass above).

**Done when:** 100% fixture pass in `npm run test`; drift green; results logged in PROGRESS.md.
