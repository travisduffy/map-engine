# Epic 6: Hierarchical Aggregation (CA-5)

**Objective:** Deliver group-level spatial data — `setParentMapping`, `aggregateGroups`, sync `getGroupBBox` — and build the shared Transferable ring-pool + `_postRenderHook` bounce-back infrastructure that CA-8 and CA-6 reuse.
**Scope:** Incorporates PRD §"Acceptance Criteria" → "Epic 6 — Aggregation (CA-5)", §"Transferable Ownership & the ring pool". Normative detail: ROADMAP §9 (CA-5, F-4.2, F-4.3), §4 (F-C.7, F-C.8).

**Verifiable & Measurable Success Criteria:**

- **Fixture exactness:** every fixture in `test/fixtures/mappings/regions.json` (≥ 5) produces `groupBBoxes` equal to `expectedGroupBBoxes` per-coordinate.
- **Sentinel semantics:** `0xFFFF` sectors excluded from all groups; empty groups yield `[INT16_MAX, INT16_MAX, INT16_MIN, INT16_MIN]` (i.e. `[32767, 32767, -32768, -32768]`); all-sentinel mapping resolves with zero groups.
- **Handoff discipline:** `groupBBoxes` arrives via Transferable handoff; bounce-back occurs only inside `MapRenderer._postRenderHook()`; `getGroupBBox` stays synchronous and never observes a detached buffer.
- **Isolation:** `SimulationClock` drift ≤ ±2 ms during aggregation over the largest fixture.

---

## Tasks

### Task 6.1 — Shared infra: `_postRenderHook` + 4-buffer Transferable ring pool (F-C.7/F-C.8)

**PRD Reference:** §"Transferable Ownership & the ring pool", PRD Known Risk 3.

Built here because CA-5 is its first consumer; CA-8 (`anchors`) and CA-6 (`borderEdges`) reuse it unchanged.

**Work:**

- Add `MapRenderer._postRenderHook: (() => void) | null`, invoked in the rAF loop immediately after the `this._backend.render(...)` call inside `MapRenderer._loop`'s dirty-gated block (F-C.11 companion to the existing `_preRenderHook`, which runs unconditionally at the top of every frame — the post-hook, unlike the pre-hook, is dirty-gated). Receipt of any hot-path buffer sets `_dirty = true`, so a render + post-hook always follows a handoff (deadlock falsifier: Epic 8 soak test).
- Implement a Main-side pool helper (internal module — not listed in ROADMAP §12.5's module table since it is `@internal`; illustrative path `src/worker/transferablePool.ts`): ring-buffered pointer-swap over 4 buffers total **per array type** (1 Worker-owned, 1 in-flight, 1 Main-current, 1 Main-pending-bounce). On receipt: swap `Main-current` reference (no `.set()` copy); queue the previous buffer for bounce; flush bounces only from `_postRenderHook`. The swap and the bounce-queue enqueue both execute synchronously inside the Worker-message `onmessage` handler, so `getGroupBBox` — running later on Main's main-thread event loop — can never observe a mid-swap/torn state.
- Worker side: this is bookkeeping over the _same_ 4-buffer pool's `Worker-owned`/`in-flight` slots, not a second, separate 4-buffer pool — the Worker always has a writable buffer available, but the steady-state total stays 4 buffers per array type (F-C.8), not 4 per side (8 total).
- `MapEngine.dispose()`/a subsequent `loadMap()` both call the existing `MapRenderer.destroy()` (note: the renderer's teardown method is `destroy()`, not `dispose()`), which cancels the rAF loop and thereby stops further `_postRenderHook` invocations. A bounce queued but not yet flushed at that point is simply dropped — safe only because the same `dispose()`/`loadMap()` also tears down or replaces the Worker, so no side holds a stale reference. The pool helper must not throw when torn down with a pending bounce.

**Done when:** unit tests (NullRenderBackend) prove: sync reads valid across N consecutive handoffs; bounces flushed only via `_postRenderHook`; no reference ever read after its buffer detaches; pool teardown during `dispose()` with a pending bounce does not throw.

---

### Task 6.2 — Fixtures: `test/fixtures/mappings/regions.json` + maps

**PRD Reference:** §"Acceptance Criteria" → "Epic 6 — Aggregation (CA-5)"; ROADMAP §9 CA-5 Validation Fixture.

**Work:**

- Author ≥ 5 fixtures with schema `{mapImage, definition, parentMapping, maxGroups, expectedGroupBBoxes}` (per ROADMAP §9 CA-5 Validation Fixture — `definition` is the path to the fixture's companion sector-definition JSON): identity (1 sector → 1 group), all-to-one, disjoint-groups, sentinel sectors (`0xFFFF` members), single-pixel groups. Map PNGs (8-bit indexed, ≤ 256×256 — the indexed format is the §9 CA-5 fixture mandate; browsers decode indexed PNGs to RGBA in `getImageData`, so the standard §12.1 decode path consumes them unchanged) generated via a committed `sharp` script into `test/fixtures/mappings/maps/`. `sharp`'s `.png({ palette: true })` quantizes/dithers colors by default (`dither` defaults to 1.0) — the generator MUST pass `{ palette: true, dither: 0, colors: <exact distinct-color count> }` so pixel RGB values survive encoding unchanged; `SectorRegistry`'s hex-key identity depends on exact per-pixel color, so any quantization drift silently breaks sector assignment.
- Each fixture's `definition` field points to the companion sector definition for its `mapImage` (same pattern as `test/fixtures/test-4x4.json` alongside `test-4x4.png`) establishing the hex-color → dense-numeric-ID order, because `SectorRegistry` assigns numeric IDs by JSON-definition iteration order (`Object.entries(definition)`), not by pixel/raster scan order (see `src/SectorRegistry.ts` "Phase 1: Assign dense numeric IDs from definition"). `parentMapping[i]` is indexed by that same dense numeric ID, so the generator's definition file is what fixes the index space `parentMapping` and `expectedGroupBBoxes` are computed against.
- Compute `expectedGroupBBoxes` in the generator from the definition (independent of engine code, i.e. not by calling `SectorRegistry`/`aggregateGroups` itself) so fixtures are reference-grade — but the generator's independent per-sector bbox scan MUST still assign sector IDs using the same definition-order rule above, then union per-sector bboxes into per-group bboxes via `parentMapping`, or the expected values will be computed against a different ID space than the engine uses.

**Done when:** fixtures + generator committed; generator re-run is deterministic; generated PNG pixel colors are byte-exact against the source definition (no quantization drift).

---

### Task 6.3 — Worker aggregation + `setParentMapping`/`aggregateGroups`/`getGroupBBox`

**PRD Reference:** §"Public API delta"; ROADMAP §9 CA-5.

**Work:**

- Worker handlers: `setParentMapping(mapping: Uint16Array, maxGroups: number)` — validate `mapping.length === sectorCount` AND that every entry is either exactly `0xFFFF` or a value `< maxGroups` (throw on violation, same validation style as the length check); an out-of-range group ID that is not caught here would silently no-op-write past the end of the `maxGroups·4` Int16 `groupBBoxes` buffer (typed-array OOB writes do not throw), losing that sector's contribution without error. `0xFFFF` is always the sentinel and never a valid group ID, even if a consumer passes `maxGroups > 0xFFFF` (ROADMAP §12.3 reserves it; `Uint16Array` entries cannot address groups ≥ 65535 anyway). Store the validated mapping as the current mapping (also read by CA-6 later), allocate the `groupBBoxes` ring pool on first call (the F-C.8 4-buffer ring — each buffer `maxGroups·4` Int16, e.g. `maxGroups = 1000` → 8,000 bytes per buffer, 32,000 bytes steady-state total) and notify Main via `INIT_GROUPS`; a later `setParentMapping` with a **different** `maxGroups` must reallocate the pool (fresh allocation on replacement, same discipline as `traversalCosts` in ROADMAP §4) — otherwise the new `< maxGroups` validation bound would admit group IDs beyond the old buffers' capacity, recreating exactly the silent OOB loss described above; `aggregateGroups()` — throws `MappingRequiredError` if no mapping; folds per-sector `bboxes` into group extents (O(sectorCount), yielding every ≤ 8 ms via `yieldIfNeeded`, `src/worker/yield.ts` — CA-5 Yield Mandate), writes sentinels for empty groups, hands the buffer to Main via Transferable handoff (F-4.2).
- `MapEngine.setParentMapping(mapping, maxGroups): Promise<void>` (transfers `mapping`; Main retains no copy), `MapEngine.aggregateGroups(): Promise<void>`, `MapEngine.getGroupBBox(groupId): [number, number, number, number]` — sync read from the ring-pool's Main-current buffer; throws `MappingRequiredError` if called before the first `aggregateGroups()` completes. This reuse is **ratified (BDFL ruling, Hardening Sync)**: ROADMAP §12.5 now documents `MappingRequiredError`'s widened trigger — "methods called before `setParentMapping`, or group accessors (`getGroupBBox`) before the first `aggregateGroups` resolution" — so one canonical error covers the mapping/aggregation precondition family (PR-4).
- Register both async methods for lifecycle invalidation (`MapInvalidatedError`).
- Update `example/src/main.ts`: define a parent mapping over the example map and display a group bbox on demand.

**Done when:** all fixture assertions pass per-coordinate; error path (`MappingRequiredError`), sentinel path (zero groups), and lifecycle rejection tests green; `mapping.byteLength === 0` on Main post-call.

---

### Task 6.4 — Drift assertion

**PRD Reference:** §"Acceptance Criteria" → "Epic 6 — Aggregation (CA-5)".

**Work:**

- Concurrent-load drift test: repeated `aggregateGroups` over the largest fixture while sampling `SimulationClock.getTelemetry()` (the shipped accessor — returns `TickTelemetry` with a `timestamps` ring, `src/worker/SimulationClock.ts`); assert drift ≤ ±2 ms.

**Done when:** assertion green in browser-mode suite; result logged in PROGRESS.md.
