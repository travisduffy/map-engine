# Epic 6: Hierarchical Aggregation (CA-5)

**Objective:** Deliver group-level spatial data — `setParentMapping`, `aggregateGroups`, sync `getGroupBBox` — and build the shared Transferable ring-pool + `_postRenderHook` bounce-back infrastructure that CA-8 and CA-6 reuse.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 6", §"Transferable Ownership & the ring pool". Normative detail: ROADMAP §9 (CA-5, F-4.2, F-4.3), §4 (F-C.7, F-C.8).

**Verifiable & Measurable Success Criteria:**

- **Fixture exactness:** every fixture in `test/fixtures/mappings/regions.json` (≥ 5) produces `groupBBoxes` equal to `expectedGroupBBoxes` per-coordinate.
- **Sentinel semantics:** `0xFFFF` sectors excluded from all groups; empty groups yield `[INT16_MAX, INT16_MAX, INT16_MIN, INT16_MIN]`; all-sentinel mapping resolves with zero groups.
- **Handoff discipline:** `groupBBoxes` arrives via Transferable handoff; bounce-back occurs only inside `MapRenderer._postRenderHook()`; `getGroupBBox` stays synchronous and never observes a detached buffer.
- **Isolation:** `SimulationClock` drift ≤ ±2 ms during aggregation over the largest fixture.

---

## Tasks

### Task 6.1 — Shared infra: `_postRenderHook` + Transferable ring pool (F-C.7/F-C.8)

**PRD Reference:** §"Transferable Ownership & the ring pool", PRD Known Risk 4.

Built here because CA-5 is its first consumer; CA-8 (`anchors`) and CA-6 (`borderEdges`) reuse it unchanged.

**Work:**

- Add `MapRenderer._postRenderHook: (() => void) | null`, invoked in the rAF loop immediately after `renderer.render()` inside the dirty-gated block (F-C.11 companion to the existing `_preRenderHook`). Receipt of any hot-path buffer sets `_dirty = true`, so a render + post-hook always follows a handoff (deadlock falsifier: Epic 8 soak test).
- Implement a Main-side pool helper (internal module, e.g., `src/worker/transferablePool.ts`, `@internal`): ring-buffered pointer-swap over 4 buffers (1 Worker-owned, 1 in-flight, 1 Main-current, 1 Main-pending-bounce). On receipt: swap `Main-current` reference (no `.set()` copy); queue the previous buffer for bounce; flush bounces only from `_postRenderHook`.
- Worker side: symmetric pool so the Worker always has a writable buffer available.

**Done when:** unit tests (NullRenderBackend) prove: sync reads valid across N consecutive handoffs; bounces flushed only via `_postRenderHook`; no reference ever read after its buffer detaches.

---

### Task 6.2 — Fixtures: `test/fixtures/mappings/regions.json` + maps

**PRD Reference:** §"Acceptance Criteria — Epic 6"; ROADMAP §9 CA-5 Validation Fixture.

**Work:**

- Author ≥ 5 fixtures with schema `{mapImage, parentMapping, maxGroups, expectedGroupBBoxes}`: identity (1 sector → 1 group), all-to-one, disjoint-groups, sentinel sectors (`0xFFFF` members), single-pixel groups. Map PNGs (8-bit indexed, ≤ 256×256) generated via a committed `sharp` script into `test/fixtures/mappings/maps/`.
- Compute `expectedGroupBBoxes` in the generator from the definition (independent of engine code) so fixtures are reference-grade.

**Done when:** fixtures + generator committed; generator re-run is deterministic.

---

### Task 6.3 — Worker aggregation + public API

**PRD Reference:** §"Public API delta"; ROADMAP §9 CA-5.

**Work:**

- Worker handlers: `setParentMapping(mapping: Uint16Array, maxGroups: number)` — validate `mapping.length === sectorCount`, store as the current mapping (also read by CA-6 later), allocate the `groupBBoxes` pool (`maxGroups·4` Int16) on first call and notify Main via `INIT_GROUPS`; `aggregateGroups()` — throws `MappingRequiredError` if no mapping; folds per-sector `bboxes` into group extents (O(sectorCount), yielding every ≤ 8 ms), writes sentinels for empty groups, hands the buffer to Main via Transferable handoff (F-4.2).
- `MapEngine.setParentMapping(mapping, maxGroups): Promise<void>` (transfers `mapping`; Main retains no copy), `MapEngine.aggregateGroups(): Promise<void>`, `MapEngine.getGroupBBox(groupId): [number, number, number, number]` — sync read from the ring-pool's Main-current buffer; throws if called before the first aggregation completes (documented).
- Register both async methods for lifecycle invalidation (`MapInvalidatedError`).
- Update `example/src/main.ts`: define a parent mapping over the example map and display a group bbox on demand.

**Done when:** all fixture assertions pass per-coordinate; error path (`MappingRequiredError`), sentinel path (zero groups), and lifecycle rejection tests green; `mapping.byteLength === 0` on Main post-call.

---

### Task 6.4 — Drift assertion

**PRD Reference:** §"Acceptance Criteria — Epic 6".

**Work:**

- Concurrent-load drift test: repeated `aggregateGroups` over the largest fixture while sampling `SimulationClock` telemetry; assert drift ≤ ±2 ms.

**Done when:** assertion green in browser-mode suite; result logged in PROGRESS.md.
