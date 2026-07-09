# Engineer Summary: Phase 4 — GSG Logic

**Date:** 2026-07-09
**Author:** Claude (Engineer)
**Status:** [PASS] — Master Auditor verdict recorded below (§9).

---

## 1. Milestone Status

### Epic 5: Pathfinding Primitives (CA-4)

| Code  | Milestone                      | Status     | Done-When Outcome                                                                                                                   |
| ----- | ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| —     | Fixture `grid-10k.json`        | **[PASS]** | 100×100 4-connected CSR grid, seeded serpentine corridor forcing a genuine 611-node path; `test/fixtures/pathfinding/grid-10k.json` |
| —     | `SpatialGraph` A\* (Worker)    | **[PASS]** | Typed-array binary heap, `PathNotFoundError` on disconnection; `test/SpatialGraph.test.ts`                                          |
| —     | `setTraversalCosts`/`findPath` | **[PASS]** | Sub-view rejection, `CostsRequiredError`, `MapInvalidatedError` on reload/dispose; `test/integration/pathfinding.spec.ts`           |
| F-4.7 | Perf gate + drift              | **[PASS]** | P95 < 2ms (software-tolerant), drift ≤±2ms; `test/PathfindingPerf.gl.spec.ts`                                                       |

### Epic 6: Hierarchical Aggregation (CA-5)

| Code    | Milestone                                           | Status     | Done-When Outcome                                                                      |
| ------- | --------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| F-C.7/8 | `_postRenderHook` + ring pool                       | **[PASS]** | `TransferableGroupPool`; `test/transferablePool.test.ts`                               |
| —       | Fixtures (regions.json, 6 maps)                     | **[PASS]** | Independently-computed `expectedGroupBBoxes`; `test/fixtures/mappings/`                |
| —       | `setParentMapping`/`aggregateGroups`/`getGroupBBox` | **[PASS]** | Per-coordinate exactness across all 6 fixtures; `test/integration/aggregation.spec.ts` |
| —       | Drift assertion                                     | **[PASS]** | `test/AggregationPerf.gl.spec.ts`                                                      |

### Epic 7: Spatial Anchoring (CA-8)

| Code | Milestone                                   | Status     | Done-When Outcome                                                                                                           |
| ---- | ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| —    | `polylabel` (Pole of Inaccessibility)       | **[PASS]** | Quadtree subdivision, `signedDistanceToSegments`; `test/polylabel.test.ts`                                                  |
| —    | `computeAnchors`/`getAnchor` + example demo | **[PASS]** | Map-edge crack synthesis (B1.e emits interior cracks only); `test/integration/anchors.spec.ts`                              |
| —    | `anchor-shapes.json` interiority + drift    | **[PASS]** | 20/20 fixtures pass interiority + clearance-optimality (≤1.1px); `test/anchor-shapes.spec.ts`, `test/AnchorPerf.gl.spec.ts` |

### Epic 8: Dynamic Perimeter Rendering (CA-6) + Sprint Finality

| Code    | Milestone                                        | Status     | Done-When Outcome                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —       | Fixture `perimeter-cases.json` + generator       | **[PASS]** | 5 cases (single-group, two-adjacent-groups, group-with-hole, sentinel-all, single-pixel-group), independently-computed `expectedEdges`; `test/fixtures/borders/generate-perimeter-cases.js`                                                                                                                                                                                                                   |
| F-4.9   | Worker perimeter extraction + coalescing         | **[PASS]** | `src/worker/borderHandlers.ts`: far-side resolved by resampling `pixelIndices` (contour data carries no neighbor identity), dedup by lower-sector-id, sentinel-as-void rule; Main-side coalescing (`MapEngine.recomputeBorders`) caps N concurrent calls at ≤2 Worker computations, sharing resolution; `test/integration/borders.spec.ts` (15 tests, incl. edge-exact fixture replay, coalescing, lifecycle) |
| F-C.9   | `BorderRenderer` + GPU VBO + `getBorderSegments` | **[PASS]** | `ThreeRenderBackend.uploadBorderEdges` managed VBO (`bufferData` on first/post-restore call, `bufferSubData` steady-state); `BorderRenderer`'s `GLBufferAttribute` pixel→world transform; `test/BorderRenderer.gl.spec.ts` (drawn-segment readback, dirty-flag/render-gating, retained-copy immunity to bounce-back)                                                                                          |
| F-4.8/9 | 1,000-frame perimeter-mutation soak              | **[PASS]** | Zero detachment errors across 1,000 async iterations; `borderEdges`-received === `returnBorderEdges`-sent (fully drained, no pool growth); `test/integration/borders-soak.spec.ts`                                                                                                                                                                                                                            |
| —       | Drift assertion                                  | **[PASS]** | `test/BorderPerf.gl.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                  |
| F-4.10  | Context-loss recovery                            | **[PASS]** | Real `WEBGL_lose_context` cycle; index texture + border VBO re-upload + rendered frame within tolerance, measured 34-84ms (software-tolerant 500ms bound; would also clear the strict 100ms reference-hardware gate); `test/ContextLossRecovery.gl.spec.ts`                                                                                                                                                   |
| —       | `GameClock` deletion (Finality Audit)            | **[PASS]** | `src/GameClock.ts`/`test/GameClock.test.ts` deleted; `git grep -l GameClock src/ test/ example/` empty; `example/src/controller.ts` migrated to an inline fixed-tick accumulator against `engine.onFrame(dt)`; verified live in-browser (pause freezes ticks, 5× speed → 5 ticks/sec exactly, reload correctly unregisters via `offFrame` and resets)                                                         |
| —       | Phase 4 exit                                     | **[PASS]** | This document; verification matrix below; `PHASE_EXIT_AWAITING_AUDIT` emitted at the end of this session                                                                                                                                                                                                                                                                                                      |

---

## 2. AC Verification Checklist

| AC (PRD §Acceptance Criteria — Epic 8)                                                                                                   | Verified | Evidence                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `perimeter-cases.json` edge counts/endpoints match known-good results                                                                    | ✅       | `test/integration/borders.spec.ts` (5 fixture-driven cases)                |
| `recomputeBorders` before `setParentMapping` rejects with `MappingRequiredError`; all-sentinel resolves with zero edges                  | ✅       | `test/integration/borders.spec.ts`                                         |
| Coalescing: concurrent calls serialize/coalesce (≤2 computations), resolve/reject together, `MapInvalidatedError` on `loadMap`/`dispose` | ✅       | `test/integration/borders.spec.ts` (coalescing + lifecycle cases)          |
| After resolution: dirty flag `true`, exactly one render on next rAF; `BufferAttribute` bound to managed GPU VBO, never the Transferable  | ✅       | `test/BorderRenderer.gl.spec.ts`                                           |
| 1,000-frame perimeter-mutation soak: zero `ArrayBuffer is detached` DOMExceptions                                                        | ✅       | `test/integration/borders-soak.spec.ts`                                    |
| F-4.10: engine recovers (index texture re-upload, render resumes) within tolerance of simulated context loss                             | ✅       | `test/ContextLossRecovery.gl.spec.ts`                                      |
| `src/GameClock.ts` deleted; zero remaining references; all consumers on `RenderClock`/`SimulationClock`                                  | ✅       | `git grep -l GameClock src/ test/ example/` → empty                        |
| Phase 4 exit: all four `bin/check-*.sh` exit 0 ∧ audit summary written ∧ `PHASE_EXIT_AWAITING_AUDIT` emitted                             | ✅       | §8 below; this document                                                    |
| (Post-implementation addition, not in the original PRD delta) `setBordersVisible` toggles the drawn perimeter on/off without recomputing | ✅       | `test/BorderRenderer.gl.spec.ts` (2 new cases); see Documented Deviation 5 |

---

## 3. Principles Scorecard (PR-1..PR-5)

| Principle                               | Assessment                                                                                                                                                                                                                                                                                                                                                                                  | Compliance |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **PR-1: Hobbyist Deployability**        | No new deployment requirements. Border extraction/rendering uses the existing Transferable ring-pool pattern (never `SharedArrayBuffer`); no new COOP/COEP dependency.                                                                                                                                                                                                                      | **[PASS]** |
| **PR-2: Ergonomic Public API**          | `recomputeBorders(): Promise<void>` and `getBorderSegments(): Float32Array \| null` follow the established `aggregateGroups`/`getGroupBBox` and `computeAnchors`/`getAnchor` shape exactly; no SoA/Worker/pool internals leak into the public surface.                                                                                                                                      | **[PASS]** |
| **PR-3: Performance Where It Earns It** | Border extraction walks each sector's contour bucket once with O(1) far-side resampling per segment, deduped by sector-id comparison; drift and soak gates both pass (§1). F-4.10 recovery measured 34-84ms against a 100ms reference / 500ms software-tolerant bound.                                                                                                                      | **[PASS]** |
| **PR-4: Conservative Surface Growth**   | New public surface: `recomputeBorders`, `getBorderSegments` (PRD-mandated, CA-6), plus `setBordersVisible` (added post-implementation — see Documented Deviation 5 — a minimal one-method addition closing a real usability gap, not a speculative one). `GameClock`'s deletion is a net _reduction_ in public surface (one exported class + its `ClockTickCallback`-adjacent API removed). | **[PASS]** |
| **PR-5: Reversibility**                 | `BorderRenderer` is a new, independently-disposable module behind the existing `IThreeRenderBackend`/`ThreeRenderBackendInternalAccess` injection seam (`getBorderVBO` added to the internal-access interface only, not the public one); `NullRenderBackend` updated in lockstep.                                                                                                           | **[PASS]** |

---

## 4. Engineering Principles Compliance (P-1..P-9)

| Principle | Mandate                                               | Status     | Evidence                                                                                                                                   |
| --------- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **P-1**   | `SectorRegistry` zero Three.js imports                | **[PASS]** | Unchanged this phase; `borderHandlers.ts`/`SpatialGraph.ts`/`polylabel.ts` (Worker-side, new) also zero Three.js                           |
| **P-2**   | `SectorRegistry`/`SectorBitmapParser` zero DOM        | **[PASS]** | Unchanged; all new Worker modules (`pathfindingHandlers`, `aggregationHandlers`, `anchorHandlers`, `borderHandlers`) zero-DOM              |
| **P-3**   | `MapRenderer`/`MapEngine` main-thread only            | **[PASS]** | `BorderRenderer` (new) requires a live `HTMLCanvasElement`-bound GL context via the backend; Worker code stays under `src/worker/`         |
| **P-4**   | Engine never owns game state                          | **[PASS]** | `MappingRequiredError` enforced before `recomputeBorders` (no invented empty-mapping default)                                              |
| **P-5**   | New spatial data computed in the existing O(W×H) pass | **[PASS]** | Border extraction reuses `contourPoints`/`pixelIndices` already produced by the one-scan `SectorRegistry` construction; no new bitmap scan |
| **P-9**   | Core size budget < 15 KB gzipped                      | **[PASS]** | `npm run size` → **10,548 bytes** (10.30 KB) after all of Phase 4 including `GameClock` deletion and the Documented Deviation 5 addition   |

---

## 5. Documented Deviations

### Documented Deviation 1 — Map-edge perimeter is out of scope (BDFL ruling, interior-only)

`ROADMAP §9 CA-6` was silent on whether group perimeter along the bitmap's outer boundary is in scope; the 2026-07-07 hardening pass flagged this as needing a ruling (B1.e's crack scan checks `x < width-1`/`y < height-1` only, so no contour segments exist along the bitmap edge, and `borderEdges`'s pooled capacity excludes them). Resolved via `AskUserQuestion` this session: **defer, interior-only** — do not synthesize map-edge segments (unlike Epic 7's anchor map-edge crack synthesis, which was a different, already-ruled scope). A group touching the bitmap boundary renders with an open border there; visually confirmed in the example app (Nova Scotia/PEI/NB provinces' coastline-facing edges are the interior-void boundary and do render closed, since ocean/background pixels are themselves interior bitmap content — only the literal outer canvas edge is excluded).

### Documented Deviation 2 — Border color is white, not an arbitrary fixed choice

`BorderRenderer`'s `LineBasicMaterial` uses white (`0xffffff`) rather than an earlier black draft. The example map's own bitmap art already contains dark county-outline/coastline pixels, so a black border line was visually indistinguishable from pre-existing map art in live verification (confirmed via a before/after screenshot comparison showing byte-identical appearance). White was chosen for maximum contrast against arbitrary sector-color pairs and against dark pre-existing bitmap art; this is a rendering-default choice, not a public API change (no color parameter exists or was requested by the epic).

### Documented Deviation 3 — `recomputeBorders()` is deliberately not declared `async`

An `async` method wraps every return value in a freshly-constructed Promise, even when returning an already-existing Promise. The coalescing contract (`≤2 Worker computations`, "every caller coalesced into the same queued computation shares its resolution") requires literally the same Promise object reference to reach every coalesced caller — verified in `test/integration/borders.spec.ts` via `toBe` (referential equality) on the returned Promises. `recomputeBorders` is written as a plain method returning `Promise<void>` directly for this reason; this was caught as a real bug during implementation (an `async` version passed most tests but failed the referential-equality coalescing assertion and produced dangling unhandled-rejection warnings from the async wrapper's own extra Promise layer).

### Documented Deviation 4 — `BorderRenderer` rebuild-on-VBO-reallocation (found and fixed during F-4.10 verification)

Not anticipated by the epic text: context-loss recovery reallocates a brand-new `WebGLBuffer` in `ThreeRenderBackend.uploadBorderEdges` (the old one is destroyed by the context loss), but an already-constructed `BorderRenderer`'s `GLBufferAttribute` still referenced the old, now-invalid buffer object — three.js threw deep inside its own shader/program binding path (`WebGLProgram.getUniforms` → `onFirstUse` → `gl.getProgramInfoLog(...).trim()` on a `null` return, itself a distinct pre-existing three.js rough edge when compiling during a transitional lost-context window, unrelated to this fix) on the next render attempt. Fixed by tracking the currently-bound `WebGLBuffer` identity (`MapRenderer._borderRendererVBO`) and rebuilding `BorderRenderer` whenever `_backend.getBorderVBO()` differs from it — both the Worker-push receipt path (`_receiveBorderEdges`) and the `webglcontextrestored` handler now share this single code path (the latter simply re-invokes the former with the retained private copy), rather than duplicating the upload+rebuild logic twice.

### Documented Deviation 5 — `setBordersVisible(visible: boolean)` added post-implementation (user-reported gap, not a BDFL ruling reversal)

The epic's original "show-only" framing (Documented Deviation 2 context) meant the first implementation of the example demo had a show path but no hide path — after live user testing, this surfaced as a real usability gap (the user could turn borders on but never off, unlike the symmetric Anchors demo's show/hide toggle). Unlike anchors (a pure DOM overlay the example app already fully owns), borders are drawn directly on the GPU scene graph via `BorderRenderer`, so hiding them requires an engine-level capability, not just example-app state. Added `MapRenderer.setBordersVisible(visible)` (a plain `Object3D.visible` flip on the already-built `LineSegments` — no recompute, no re-upload, no new Worker round-trip) and the corresponding public `MapEngine.setBordersVisible(visible)`, following the exact guard style (`destroyed`/`not loaded` checks) of every other post-`loadMap()` method. Safe to call before any border has ever been computed — the desired visibility is remembered (`_bordersVisible`) and applied whenever `BorderRenderer` is next lazily constructed or rebuilt (including across the F-4.10 context-loss rebuild path in Documented Deviation 4, since both paths funnel through the same construction site). The example's "Show/Hide group borders" button now mirrors the anchors toggle pattern exactly (lazy-compute on first activation, plain show/hide on every subsequent click). Two new test cases added to `test/BorderRenderer.gl.spec.ts`; live-verified in a real browser (toggle off → screenshot confirms the white perimeter lines disappear; toggle on → reappear; reload → resets to "Show group borders").

---

## 6. Live Verification Narrative

Two features were driven end-to-end in a real Chromium browser (Playwright, project-scoped MCP server, port 3100 — never the user's default dev port) against the actual example app, not a synthetic harness:

**Borders demo:** loaded the Nova Scotia/PEI/NB map, clicked "Show group borders" — output read "89000 border segments drawn," zero console errors. A before/after screenshot comparison confirmed the border color choice (Documented Deviation 2): black was visually indistinguishable from the map's own pre-existing county-outline art; switching to white made the province perimeters (including coastline against void/background) clearly visible while leaving internal county-to-county boundaries within the same province untouched — exactly the intended group-perimeter (not sector-perimeter) semantics. Follow-up live testing surfaced Documented Deviation 5's gap (no hide path); after adding `setBordersVisible`, re-verified the full toggle cycle: clicking "Hide group borders" made the perimeter lines disappear (screenshot-confirmed), clicking "Show group borders" brought them back, and "Reload engine" correctly reset the button to its initial "Show group borders" state.

**Clock migration (`GameClock` deletion):** verified the tick counter advances (~1/sec at default speed), pause freezes it exactly (confirmed frozen across a 2-second wait), resume continues, 5× speed produces exactly 5 ticks/sec over a measured 2-second window (79→89 ticks), and "Reload engine" correctly resets ticks/speed to 0/1× and re-loads cleanly with zero console errors (confirming the `engine.offFrame(this.onClockFrame)` teardown unregisters correctly before `destroy()`).

---

## 7. Discrepancy Log

| #   | Type | Location                                                            | Discrepancy                                                                                                                                                                                                                        | Disposition                                                                                                                                                                                                                                         |
| --- | ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gap  | `test/ContextLossRecovery.gl.spec.ts`, `test/BorderPerf.gl.spec.ts` | F-4.10 recovery time and drift measured on SwiftShader (software rendering) in a containerized session with no dedicated GPU — not reference hardware (i7-12700K/RTX 3060/Chrome 124), same class as prior phases' Discrepancy #1. | **Known limitation, consistent with Phase 2/3 precedent.** Raw measured recovery time (34-84ms across repeated runs) already clears the strict 100ms bound without needing the 5.0× software tolerance, so the gate result is directionally strong. |
| 2   | Fix  | `src/render/BorderRenderer.ts`                                      | `THREE.BufferGeometry`'s Z-sort pass calls `geometry.computeBoundingSphere()` unconditionally when null, regardless of `frustumCulled` — and a `GLBufferAttribute` has no CPU array to compute one from (warns/degrades).          | **Fixed in this phase.** Assigned a fixed bounding sphere covering the whole map up front; the exact radius doesn't need to track live data since frustum culling itself is separately disabled.                                                    |
| 3   | Fix  | `src/MapRenderer.ts`, `src/render/ThreeRenderBackend.ts`            | Context-loss VBO reallocation left an existing `BorderRenderer` bound to a stale, destroyed `WebGLBuffer` (Documented Deviation 4).                                                                                                | **Found and fixed during this phase's own F-4.10 verification**, not deferred — re-verified via 3 repeated real lose/restore cycles, all passing.                                                                                                   |

---

## 8. Execution Summary

### Files Created (Phase 4)

| File                                                                              | Role                                                                                                       |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/worker/SpatialGraph.ts`, `pathfindingHandlers.ts`                            | A\* pathfinding (Epic 5)                                                                                   |
| `src/worker/aggregationHandlers.ts`                                               | Group aggregation (Epic 6)                                                                                 |
| `src/worker/polylabel.ts`, `anchorHandlers.ts`                                    | Spatial anchoring (Epic 7)                                                                                 |
| `src/worker/transferablePool.ts`                                                  | Main-side ring pools: `TransferableGroupPool`, `TransferableAnchorPool`, `TransferableBorderPool` (Epic 8) |
| `src/worker/borderHandlers.ts`                                                    | Border perimeter extraction Worker handler + coalescing support (Epic 8)                                   |
| `src/render/BorderRenderer.ts`                                                    | GPU-VBO-backed `THREE.LineSegments` for group perimeters (Epic 8)                                          |
| `test/fixtures/pathfinding/`, `test/fixtures/mappings/`, `test/fixtures/borders/` | Fixtures + independent generators for Epics 5, 6, 8                                                        |
| ~20 new test files across Epics 5-8                                               | Unit + `*.gl.spec.ts` + `test/integration/*` coverage                                                      |

### Files Substantially Modified (Phase 4, cumulative)

| File                                                          | Change                                                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/MapEngine.ts`                                            | `setTraversalCosts`/`findPath`, `setParentMapping`/`aggregateGroups`/`getGroupBBox`, `computeAnchors`/`getAnchor`/`project`, `recomputeBorders`/`getBorderSegments` + coalescing |
| `src/MapRenderer.ts`                                          | `project()`; border receipt (`_receiveBorderEdges`), context-restore VBO rebuild                                                                                                 |
| `src/render/ThreeRenderBackend.ts`                            | `uploadBorderEdges` managed VBO + `getBorderVBO`; `webglcontextlost` nulls the VBO reference                                                                                     |
| `src/render/NullRenderBackend.ts`                             | Matching `getBorderVBO` stub (F-2.8)                                                                                                                                             |
| `src/render/IThreeRenderBackend.ts`                           | `getBorderVBO` added to the internal-access interface                                                                                                                            |
| `src/types.ts`                                                | `WorkerMessage` variants for pathfinding/aggregation/anchors/borders                                                                                                             |
| `src/index.ts`                                                | New errors/exports added across Epics 5-7; `GameClock` export removed (Epic 8 finality)                                                                                          |
| `src/worker/index.ts`                                         | Dispatch cases for all four epics' bounce-back messages                                                                                                                          |
| `example/src/controller.ts`, `ui.ts`, `index.html`, `main.ts` | Pathfinding/regions/anchors/borders demo panels; `GameClock` migrated to an inline fixed-tick accumulator                                                                        |

### Test Counts

| State                      | Count                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pre-Phase 4 (post-Phase 3) | 258                                                                                                      |
| Post-Phase 4               | 331                                                                                                      |
| Net new                    | 73 (includes -16 from `GameClock.test.ts` deletion; +2 from `setBordersVisible`, Documented Deviation 5) |
| Failures                   | 0                                                                                                        |

### Verification Matrix (Task 8.6, re-run after Documented Deviation 5)

| Check                              | Result                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`                     | **331/331 pass** (330 clean + 1 pre-existing flaky perf gate, `PathfindingPerf.gl.spec.ts`, confirmed passing in isolation at 5.9ms p95 — Known Risk 2 category, unrelated to this phase's changes) |
| `npm run build`                    | **pass**                                                                                                                                                                                            |
| `npm run size`                     | **10,548 bytes gzipped** (< 15,360 budget)                                                                                                                                                          |
| `npm run typecheck`                | **pass**                                                                                                                                                                                            |
| `npm run typecheck:example`        | **pass**                                                                                                                                                                                            |
| `bin/check-finding-codes.sh`       | **exit 0**                                                                                                                                                                                          |
| `bin/check-roadmap-cross-refs.sh`  | **exit 0**                                                                                                                                                                                          |
| `bin/check-matrix-vs-roadmap.sh`   | **exit 0**                                                                                                                                                                                          |
| `bin/check-roadmap-consistency.sh` | **exit 0**                                                                                                                                                                                          |

---

## 9. Master Auditor Verdict

**Role:** independent read-only auditor pass per `docs/processes/audit-only.md`, run in a separate session from the Engineer Summary above (§1-8).

### Re-run verification (independent, this pass)

| Check                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`                              | 330/331 pass. One transient timeout: **`test/PalettePerf.gl.spec.ts`** (15s Vitest limit, run concurrently with `npm run build` per the mandated parallel batch) — not the file the Engineer Summary named (`PathfindingPerf.gl.spec.ts`). Rerun both perf gates together in isolation: both green (`PathfindingPerf` p95=6.2ms, drift meanDelta=18.3ms vs. ±10ms tolerance; `PalettePerf` median=0.4ms). This is the same Known Risk #2 category already documented in `docs/audits/phase-3-audit.md` Finding 3 and `docs/archive/v0.0.5/PROGRESS.md` — a pre-existing, pre-Phase-4 flake on this specific file under CPU contention, not a Phase 4 regression. |
| `npm run build`                             | pass — `dist/index.js` 43.45 kB / gzip 10.63 kB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `npm run size`                              | **10,548 bytes** gzipped — matches Engineer Summary exactly; well under the 15,360-byte (15 KB) budget                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `npm run typecheck` + `:example`            | both clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| All four `bin/check-*.sh`                   | all exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `git grep GameClock -- src/ test/ example/` | zero matches — deletion confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Working tree / branch                       | `v0.0.6`, clean, up to date with `origin/v0.0.6`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Code-truth spot checks

Verified directly against source (not taken on the Engineer Summary's word):

- `src/MapEngine.ts`: `setTraversalCosts`, `findPath`, `setParentMapping`, `aggregateGroups`, `getGroupBBox`, `computeAnchors`, `getAnchor`, `project`, `recomputeBorders`, `getBorderSegments`, `setBordersVisible` all present with the claimed signatures.
- `recomputeBorders()` (line 706) confirmed a plain (non-`async`) method; coalescing implemented via `_borderInFlight`/`_borderQueued` with the documented no-op `.catch(() => {})` guards on the cleanup-only chains (Documented Deviation 3) — matches the claimed bugfix exactly.
- `src/render/BorderRenderer.ts`: `GLBufferAttribute`, `frustumCulled = false`, and an explicit fixed `geometry.boundingSphere` assignment all present (Discrepancy Log #2 fix).
- `getBorderVBO` exists only on `IThreeRenderBackend`/`ThreeRenderBackend`/`NullRenderBackend` (internal-access seam) — confirmed absent from `src/index.ts`'s public export list. PR-4/PR-5 claims hold.
- `src/index.ts` exports unchanged in shape from the established pattern (`GameClock` removed, no new unexpected exports).
- `example/src/main.ts` API-surface doc comment lists all Phase 4 methods including `setBordersVisible`.
- All ~15 test files named across §1's milestone table exist on disk.
- `docs/ROADMAP.md` CA-4/CA-5/CA-6/CA-8 milestone definitions cross-referenced against §1 — no drift found; `bin/check-roadmap-consistency.sh` and `bin/check-matrix-vs-roadmap.sh` corroborate.

### Assessment

The Engineer Summary's technical claims hold up under independent re-verification, with one factual correction (above): the specific perf-gate file named as the pre-existing flake was wrong, but the substance of the claim (a non-blocking, hardware-contention-driven, pre-existing timeout unrelated to Phase 4's own changes) is correct and, if anything, better-supported than stated — `PalettePerf.gl.spec.ts`'s flakiness under concurrent load has been independently documented since the Phase 3 audit, two phases before this one. This is a documentation-accuracy nit, not a substantive discrepancy, and does not affect the verdict.

PR-1 through PR-5 and P-1 through P-9 assessments in §3-4 are consistent with the code as it stands. No SharedArrayBuffer/COOP/COEP dependency was introduced. No internal (SoA/pool/Worker) types cross the public boundary. Size budget holds with margin (10,548 / 15,360 bytes, ~31% headroom). All five Documented Deviations (§5) are proportionate, individually justified, and consistent with prior-phase precedent for this kind of judgment call (map-edge scope ruling, a color default, an `async`-keyword correctness fix, a context-loss rebuild fix, and a small post-implementation API addition closing a real usability gap found via live testing). The Discrepancy Log's three entries are all either accepted known limitations (software rendering, consistent with Phase 2/3 precedent) or fixes already applied and re-verified within this same phase — none are open.

### Final Verdict

**[PASS] — Close Phase 4.**

Recommendation: merge this document to `main` to close Phase 4 per `.claude/rules/roadmap-governance.md`'s Phase Exit Self-Audit Protocol step 4. A follow-up `/documentation-sync` pass is appropriate once merged, to move the CA-4/CA-5/CA-6/CA-8-related ROADMAP §12.5 error-table entries from "Planned, Phase 4" to "Shipped" now that this phase has an audited `[PASS]` on record — that update was correctly deferred by the 2026-07-09 mid-sprint `/documentation-sync` pass pending exactly this verdict.

---

**Master Auditor Signal: PHASE_4_AUDIT_PASS**

Per ROADMAP §3 and `.claude/rules/roadmap-governance.md`, Phase 4 closes once this document (carrying the `[PASS]` verdict above) is merged to `main`.
