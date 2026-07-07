# Product Requirements Document — "Concurrent Kernel & GSG Logic" Sprint

> **Status: FINAL — ready for implementation (sprint activation is a separate, BDFL-only step)**
> **Target release:** the next patch release (era `v0.0.y`; the BDFL names the version at release time).
> **Scope:** the entirety of the outstanding roadmap work — Phase 3 (The Concurrent Kernel) and Phase 4 (GSG Logic) of `docs/ROADMAP.md`. Phase 5 is human-gated and explicitly excluded.

---

## How to Use This File

**For AI agents:**

- This is the canonical authority for what to build and how to build it. Where this PRD summarizes, `docs/ROADMAP.md` §§4, 8, 9, 12 hold the maximum-fidelity normative detail — every epic task cites the exact roadmap section.
- Every epic and task must be traceable to a requirement in this document.
- Reference specific sections by heading when making implementation decisions (e.g., "per PRD §Worker Message Protocol").
- **Phase boundary is a hard stop.** Phase 4 epics (5–8) must not begin until `docs/audits/phase-3-audit.md` carries a merged `[PASS]` verdict (ROADMAP §3 Phase Exit Gates).

---

## Overview

This sprint completes the roadmap's remaining two phases. **Phase 3** moves the spatial kernel into a Web Worker under Transferable Ownership discipline (B3.a–c), replaces CPU pixel-iteration recoloring with a GPU fragment-LUT palette shader (B2), and exposes the public map-mode API (CA-7). **Phase 4** builds the four GSG capabilities on top of that kernel: pathfinding primitives (CA-4), hierarchical group aggregation (CA-5), spatial label anchoring (CA-8), and dynamic perimeter border rendering (CA-6), closing with the deletion of the deprecated `GameClock` and the Phase 4 finality audit.

Phases 0–2 are complete and audited (`docs/audits/phase-0/1/2-audit.md`, all `[PASS]`). The `SectorRegistry` already produces every SoA buffer the Worker bootstrap needs (`pixelIndices`, `pixelIndicesMirror`, `bboxes`, `centroids`, CSR adjacency, contours, `borderEdges`, `hexColors`/`sectorIds`), and `MapRenderer` is decoupled from Three.js behind `IThreeRenderBackend`.

---

## Goals & Non-Goals

### Goals

1. **Worker relocation (B3.a–c):** simulation kernel in a Web Worker; registry buffers handed over via Transferable ownership at bootstrap; `SharedRegistryProxy` on Main with sync snapshot reads and async round-trip methods; `SimulationClock` (Worker) / `RenderClock` (Main) split.
2. **GPU palette pipeline (B2):** full-map recolor < 1 ms via fragment LUT; index texture uploaded once as `R32UI`; palette swaps touch only a uniform/LUT texture, never the index texture.
3. **Public palette API (CA-7):** `registerMapMode` / `setMapMode` with the ROADMAP §8 state machine (synchronous validation, dirty-flag discipline, registration atomicity per F-3.6, no-op semantics, lifecycle cleanup).
4. **Pathfinding (CA-4):** `setTraversalCosts` + `findPath` (A\* over CSR adjacency in the Worker, cooperative yielding, `PathNotFoundError`).
5. **Hierarchical aggregation (CA-5):** `setParentMapping` + `aggregateGroups` + sync `getGroupBBox` via Transferable handoff with the 4-buffer ring pool (F-C.7/F-C.8).
6. **Spatial anchoring (CA-8):** `computeAnchors` + sync `getAnchor` — Pole of Inaccessibility (polylabel) over B1.e contour segments, precision 1.0 px.
7. **Dynamic borders (CA-6):** `recomputeBorders` + `getBorderSegments`; `BorderRenderer` bound to a managed GPU VBO (F-C.9); bounce-back only inside `MapRenderer._postRenderHook()`.
8. **Resilience & finality:** WebGL context-loss recovery test (F-4.10), `GameClock` deletion with import migration, both phase audits written and gated per ROADMAP §3.

### Non-Goals

- Anything in ROADMAP §10 (Phase 5): Svelte bindings (CA-10), QuickJS modding (CA-11), group-scope palettes (CA-12), WASM.
- Anything in ROADMAP §11 (Icebox/cancelled): SharedArrayBuffer, BigInt accumulators, multiplayer, `TEXTURE_2D_ARRAY` chunking, stripping Three.js.
- Version-number decisions of any kind (BDFL-only).

---

## Architecture

### New modules (canonical paths per ROADMAP §12.5)

| Component                       | Path                                | Thread | Epic |
| ------------------------------- | ----------------------------------- | ------ | ---- |
| Canonical errors                | `src/errors.ts`                     | shared | 1    |
| Worker entry (message dispatch) | `src/worker/index.ts`               | Worker | 1    |
| `SimulationClock`               | `src/worker/SimulationClock.ts`     | Worker | 2    |
| `RenderClock`                   | `src/RenderClock.ts`                | Main   | 2    |
| `yieldIfNeeded`                 | `src/worker/yield.ts`               | Worker | 2    |
| `SharedRegistryProxy`           | `src/worker/SharedRegistryProxy.ts` | Main   | 3    |
| `SpatialGraph`                  | `src/worker/SpatialGraph.ts`        | Worker | 5    |
| `BorderRenderer`                | `src/render/BorderRenderer.ts`      | Main   | 8    |

Existing modules that change: `MapEngine` (worker lifecycle, new public API), `MapRenderer` (`_postRenderHook`), `ThreeRenderBackend` (R32UI index texture, palette LUT, `readSectorIdAt`, `uploadBorderEdges` implementation, context-loss listener), `src/types.ts` (`WorkerMessage`, `BootstrapAckPayload`, `MapModeId`), `src/index.ts` (export updates), `example/` (must track every public API change).

### Worker Message Protocol (normative: ROADMAP §8 F-3.1)

- **`BOOTSTRAP` (Main → Worker):** payload `{pixelIndices, bboxes, centroids, adjacencyPointers, adjacencyNeighbors, contourPointers, contourPoints, borderEdges, borderEdgeCount, width, height, sectorCount, tickHz}`. The transfer list includes `.buffer` for every typed-array field; post-call, all nine buffers on Main have `byteLength === 0`. Image parsing happens entirely on Main; `sourceBuffer` is never sent to the Worker.
- **`BOOTSTRAP_ACK` (Worker → Main):** `{sectorCount, totalEdges, firstSectorBBox, lastSectorBBox}` verification scalars only — now roadmap-normative (F-3.1, 2026-07-07 Hardening Sync); `hexColors`/`sectorIds` are Main-resident and never cross the Worker boundary.
- **`CALL`/`RESULT`/`ERROR`:** monotonic `id` correlation; `RESULT` may carry a `snapshot` refreshing the proxy's sync-read caches.
- **Worker-initiated allocs:** `INIT_GROUPS` (first `setParentMapping`) and `INIT_ANCHORS` (first `computeAnchors`).
- **Hot-path handoff:** `{type: 'borderEdges', edges, count}` with both buffers in the transfer list (F-4.9); analogous handoffs for `groupBBoxes` and `anchors`.

### Transferable Ownership & the ring pool (normative: ROADMAP §4)

Cold-path registry arrays transfer once at bootstrap. Hot-path arrays (`borderEdges`+`borderEdgeCount`, `groupBBoxes`, `anchors`) use the bounce-back protocol (F-C.7) with a 4-buffer ring-buffered pointer-swap pool (F-C.8: 1 Worker-owned, 1 in-flight, 1 Main-current, 1 Main-pending-bounce). Bounce-back to the Worker happens **only** inside `MapRenderer._postRenderHook()`, and for WebGL-bound buffers only after `IThreeRenderBackend.uploadBorderEdges(buffer, count)` has copied the data into the managed GPU VBO (F-C.9).

### GPU pipeline

`pixelIndices` is uploaded as an `R32UI` texture before its Transferable leaves Main (F-3.3); Main retains the immutable `Uint16Array` `pixelIndicesMirror` (already produced by `SectorRegistry`). `ThreeRenderBackend` registers a `webglcontextrestored` canvas listener that re-uploads the index texture from the mirror. If the context is not WebGL2, construction throws `WebGL2NotSupportedError`. The fragment shader resolves each fragment's sector ID from the index texture and looks its color up in a palette LUT; `updateUniforms({palette})` (production) and `_setPaletteUniformDirect` (`@internal`, benchmarks) both funnel into a single private `_writePaletteUniform(colors)`.

### Public API delta (all signatures normative in ROADMAP §§8–9, §12.5)

| Method                                                                     | Kind                                                                                               | Phase |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| `setTickRate(hz: number): void`                                            | sync, pre-`loadMap`                                                                                | 3     |
| `pick(point): Promise<PickResult \| null>`                                 | async — **new method** (no sync `pick()` exists in code today; §12.4 pre-sanctions the async form) | 3     |
| `registerMapMode(id: string, colors: Uint32Array): void`                   | sync                                                                                               | 3     |
| `setMapMode(id: string): void`                                             | sync                                                                                               | 3     |
| `dispose(): Promise<void>`                                                 | async                                                                                              | 3     |
| `setTraversalCosts(costs: Uint8Array): Promise<void>`                      | async                                                                                              | 4     |
| `findPath(startId, endId): Promise<Uint16Array>`                           | async                                                                                              | 4     |
| `setParentMapping(mapping: Uint16Array, maxGroups: number): Promise<void>` | async                                                                                              | 4     |
| `aggregateGroups(): Promise<void>`                                         | async                                                                                              | 4     |
| `getGroupBBox(groupId): [number, number, number, number]`                  | sync snapshot                                                                                      | 4     |
| `computeAnchors(): Promise<void>`                                          | async                                                                                              | 4     |
| `getAnchor(sectorId): [number, number]`                                    | sync snapshot                                                                                      | 4     |
| `recomputeBorders(): Promise<void>`                                        | async                                                                                              | 4     |
| `getBorderSegments(): Float32Array \| null`                                | sync snapshot                                                                                      | 4     |

**Zero API Break Boundary:** `getNeighbors`, `getCentroid`, `getBBox` remain synchronous and hex-string-addressable. The async `pick()` is the sole sanctioned signature break (ROADMAP §12.4) — in practice it lands as a new method, since no `MapEngine.pick()` exists in code today (the current pipeline is the private `_handlePointerEvent` raycast handler; see Epic 3 Task 3.4).

**Canonical errors (`src/errors.ts`):** `WebGL2NotSupportedError`, `MappingRequiredError` (widened trigger: also thrown by group accessors like `getGroupBBox` before the first `aggregateGroups` resolution), `PathNotFoundError`, `CostsRequiredError` (thrown by `findPath` before `setTraversalCosts` has resolved at least once), `ModeNotReadyError` (thrown by `registerMapMode`/`setMapMode` before `loadMap()` resolves), `MapInvalidatedError`; `SectorLimitExceededError` relocates from `src/types.ts` (public export name unchanged). `loadMap()` and `dispose()` reject all in-flight async Promises with `MapInvalidatedError` and discard registered palette data. **`registry` getter gating (ROADMAP §12.4):** `MapEngine.registry` becomes `@deprecated` and throws `MapInvalidatedError` once the bootstrap transfer has detached the registry's buffers; the replacement surface is `getSector`/`getSectorKeys`/`getBBox`/`getCentroid`/`getNeighbors`, served from the pre-transfer `.slice()` snapshots Epic 1 retains.

### Process constraints

- Phase 3 milestones are strictly serial: B3.a → B3.b → B3.c → B2 → CA-7 (F-3.0). Phase 4 recommended order: CA-4 → CA-5 → CA-8 → CA-6 (CA-8 and CA-6 are mutually independent).
- Worker code paths that can exceed 8 ms must call `yieldIfNeeded` (`MessageChannel`-based).
- Every epic's completion runs the CLAUDE.md post-task checklist; each phase exit additionally runs the four `bin/check-*.sh` scripts and follows the ROADMAP §3 audit protocol (write `docs/audits/phase-<N>-audit.md` summary, emit `PHASE_EXIT_AWAITING_AUDIT`, terminate the session; the audit itself is out-of-band).
- Test split (F-2.7): logic tests in `*.spec.ts`/`*.test.ts` against `NullRenderBackend`; GL/visual/perf tests in `*.gl.spec.ts` under Playwright + real Chromium (F-3.5). Reference hardware: i7-12700K / RTX 3060 / Chrome 124 (F-C.5); CI tolerance 5.0× on software rendering.
- Core size budget: `npm run size` < 15 KB gzipped after every epic (P-9). Mobile heap budget 256 MB (§12.3).

### Documented Deviations (require BDFL awareness; do not edit ROADMAP.md)

1. **`hexColors`/`sectorIds` stay on Main.** _[RESOLVED — no longer a deviation.]_ The BDFL-approved 2026-07-07 Hardening Sync folded this into `docs/ROADMAP.md` (§4 rows, F-3.1, B3.c): the arrays are Main-resident, never transferred, and `BOOTSTRAP_ACK` carries verification scalars only. The same sync replaced the `pick()` binary-search mandate with the O(1) Main-resident `idToHex` table. Kept here for traceability of epic citations ("Documented Deviation 1").
2. **`SectorLimitExceededError` relocation** from `src/types.ts` to `src/errors.ts` aligns code with ROADMAP §12.5; `src/index.ts` re-exports it so the public surface is unchanged.

---

## Acceptance Criteria

Falsifiable, per epic. Epic files (`docs/active/epics/`) break these into per-task done-when conditions.

### Epic 1 — Worker Bootstrap (B3.a + Phase 3 setup)

- F-3.2: drift fixture `test/fixtures/game-clock/drift-100tick.json` run against the existing `GameClock` confirms ≤ ±1 ms over 100 ticks before B3.b work starts.
- `src/errors.ts` exists with all seven canonical errors (six new + relocated `SectorLimitExceededError`); `npm run typecheck` passes; public exports unchanged except additions.
- Pre-transfer `.slice()` snapshots of `bboxes`/`centroids`/`adjacencyPointers`/`adjacencyNeighbors` are retained on Main so the shipped sync `getNeighbors` keeps working from the moment of transfer; `engine.registry` throws `MapInvalidatedError` post-transfer (ROADMAP §12.4).
- `setTickRate(hz)`: throws on `Number.isNaN(hz) || hz < 1 || hz > 240` (the explicit NaN clause is required — every bare comparison with `NaN` is `false`) and when called after `loadMap()` has resolved; defaults to 60; the value arrives in the `BOOTSTRAP` payload.
- After `loadMap()`: all nine bootstrap buffers on Main have `byteLength === 0`; `BOOTSTRAP_ACK` values (`sectorCount`, `totalEdges`, first/last bbox) match pre-transfer state.
- `pixelIndices` is uploaded as an `R32UI` texture before transfer; `!(gl instanceof WebGL2RenderingContext)` throws `WebGL2NotSupportedError`; a `webglcontextrestored` listener re-uploads from `pixelIndicesMirror`.

### Epic 2 — Clock Split (B3.b)

- `SimulationClock` ticks in the Worker at `tickHz` (default 60); drift fixture re-run against `SimulationClock` holds ≤ ±1 ms over 100 ticks.
- Under a synthetic 100 ms Main-thread block, `SimulationClock.tick()` cadence stays steady at 60 Hz.
- `yieldIfNeeded` exists in `src/worker/yield.ts`, implemented via `MessageChannel.postMessage(0)`, and yields only when ≥ 8 ms have elapsed since the last yield.
- `GameClock` remains exported and functional (deprecation window ends in Epic 8).

### Epic 3 — SharedRegistryProxy (B3.c)

- Sync snapshot reads (`getBBox`, `getNeighbors`, `getCentroid`) return correct values on Main immediately after an awaited async mutation (`test/integration/proxy-snapshot.spec.ts`).
- Rapid `loadMap → in-flight async → loadMap` rejects the first call's Promise with `MapInvalidatedError` (`test/integration/lifecycle-invalidation.spec.ts`).
- `pick()` returns `Promise<PickResult | null>`; resolves `null` before a successful `loadMap`/`BOOTSTRAP_ACK` or when `readSectorIdAt` yields `0xFFFF`/invalid; otherwise resolves the hex key via the O(1) Main-resident `idToHex` table (ROADMAP §8 B3.c, Hardening Sync — `hexColors`/`sectorIds` are not on the pick path).
- `dispose()` terminates the Worker, releases GPU resources, and rejects in-flight Promises with `MapInvalidatedError`.

### Epic 4 — GPU Palette + CA-7 + Phase 3 exit (B2, CA-7)

- Full-map recolor completes in < 1 ms on reference hardware (Playwright + real Chromium, `performance.now()` bracketing); palette swaps write only the palette uniform/LUT — zero index-texture uploads.
- `registerMapMode` throws synchronously on duplicate ID and on `colors.length !== sectorCount`; `setMapMode` throws `Error('Unknown map mode: <id>')` on unknown ID.
- `setMapMode(id)` triggers exactly one render submit on the next rAF; a second consecutive `setMapMode(currentId)` triggers zero submits and zero uniform writes.
- Registration atomicity (F-3.6, Hardening Sync): `registerMapMode` and `setMapMode` are fully synchronous — no `pendingMapMode` buffering, no `'mapModeRegistrationFailed'` event; both throw `ModeNotReadyError` before `loadMap()` resolves; registered palette data is discarded on `loadMap()`/`dispose()`.
- Phase 3 exit: multi-threaded integrity tests green in CI ∧ Hobbyist Quickstart (1-hour GH Pages sample using only the public API) verified ∧ `docs/audits/phase-3-audit.md` summary written ∧ `PHASE_EXIT_AWAITING_AUDIT` emitted. **Hard stop until `[PASS]` is merged.**

### Epic 5 — Pathfinding (CA-4 + Phase 4 setup)

- Fixture `test/fixtures/pathfinding/grid-10k.json` exists: 100×100 grid, `traversalCosts` from fixed seed 42, 50 start/end pairs.
- A\* over the 10,000-sector graph resolves a 500-sector path in < 2 ms in the Worker; P95 over the 50 fixture pairs < 2 ms on reference hardware.
- `findPath` rejects unreachable pairs with `PathNotFoundError` and rejects with `CostsRequiredError` before `setTraversalCosts` has resolved at least once; search yields at ≤ 8 ms intervals.
- `SimulationClock` drift ≤ ±2 ms during heavy pathfinding.

### Epic 6 — Aggregation (CA-5)

- ≥ 5 fixtures in `test/fixtures/mappings/regions.json` (identity, all-to-one, disjoint-groups, sentinel sectors, single-pixel groups; maps in `test/fixtures/mappings/maps/`, 8-bit indexed PNGs ≤ 256×256); produced `groupBBoxes` match `expectedGroupBBoxes` per-coordinate.
- Sectors mapped to `0xFFFF` are excluded; empty groups yield `[INT16_MAX, INT16_MAX, INT16_MIN, INT16_MIN]`; all-sentinel mapping succeeds with zero groups.
- `aggregateGroups()` before `setParentMapping` rejects with `MappingRequiredError`; `getGroupBBox` before the first `aggregateGroups` resolution throws `MappingRequiredError` (widened trigger, ROADMAP §12.5).
- `getGroupBBox` is synchronous, served from the ring-pool snapshot; bounce-back occurs only in `_postRenderHook`; drift ≤ ±2 ms during aggregation.

### Epic 7 — Anchoring (CA-8)

- 100% pass on `test/fixtures/anchor-shapes.json` (all ≥ 20 fixtures, within a fixed 1.0 px tolerance — the fixture schema is `{id, type, points, expectedAnchor}` with no per-record `tolerancePx` field), using polylabel over B1.e contour segments (an unordered flat CSR segment list, not ordered rings — see Epic 7 Task 7.1) at default precision 1.0 px.
- `getAnchor` is synchronous from the latest snapshot; `anchors` arrive via Transferable handoff; computation yields at ≤ 8 ms; drift ≤ ±2 ms.

### Epic 8 — Dynamic Borders + Finality (CA-6, F-4.10)

- Fixture `test/fixtures/borders/perimeter-cases.json` exists; edge counts and endpoints match known-good results.
- `recomputeBorders` before any `setParentMapping` rejects with `MappingRequiredError`; all-sentinel mapping resolves with zero edges; coalescing rule per ROADMAP §9 CA-6 (concurrent calls serialize/coalesce, resolve together, reject together, `MapInvalidatedError` on `loadMap`/`dispose`).
- After `recomputeBorders()` resolves: dirty flag is `true` and exactly one `renderer.render` occurs on the next rAF; `BufferAttribute` is bound to the managed GPU VBO, never the Transferable's array.
- 1,000-frame perimeter-mutation soak test: zero `ArrayBuffer is detached` DOMExceptions.
- F-4.10: with `WEBGL_lose_context`, the engine recovers (index texture re-uploaded, render resumes) within 100 ms of simulated context loss.
- `src/GameClock.ts` deleted; zero remaining imports (`git grep GameClock src/ example/` → only historical docs); all consumers on `RenderClock`/`SimulationClock`.
- Phase 4 exit: all four `bin/check-*.sh` scripts exit 0 ∧ `docs/audits/phase-4-audit.md` summary written ∧ `PHASE_EXIT_AWAITING_AUDIT` emitted.

---

## What This Version Explicitly Does Not Include

- **Phase 5 (all of it):** CA-10 Svelte 5 OMT bindings, CA-11 QuickJS modding, CA-12 group-scope palettes (`registerMapMode` stays sector-scope only — CA-7 constraint), WASM anything.
- **Cancelled milestones (ROADMAP §11.1):** BigInt accumulator, SharedArrayBuffer transport, async texture swap, multi-writer sync, state history buffers, multiplayer netcode, advanced AI.
- **Exclusions (§11.2):** stripping Three.js, `TEXTURE_2D_ARRAY` chunking.
- Version bumps, `package.json` version edits, or any named future version (BDFL-only, per CLAUDE.md Versioning Policy).
- Roadmap edits (review/revision passes are user-gated; deviations are recorded here and in the phase audit, not in `ROADMAP.md`).

---

## Known Risks

| #   | Risk                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Vitest browser mode cannot spy across the Worker boundary** — B3 acceptance (drift under Main-thread block, transfer-list assertions) needs real `Worker` + `postMessage`.     | Run worker integration specs in browser mode with real Workers; assert observable effects (`byteLength === 0`, message payloads) rather than internal spies. Detached-buffer checks are synchronous and reliable.                               |
| 2   | **Perf gates (< 1 ms recolor, < 2 ms path, 60 fps soak) are hardware-relative** and CI may be software-rendered.                                                                 | Per ROADMAP §12.2: perf gates run locally-before-merge with output JSON checked in, or on a GPU runner; CI applies the 5.0× software tolerance. Never let a slow CI box mark a perf gate green/red authoritatively.                             |
| 3   | **Breaking `pick()` change ripples into the example app and existing tests.**                                                                                                    | The change is sanctioned (§12.4). Epic 3 includes migrating `example/src/main.ts` and every test that calls `pick()` in the same task — the example must always match the live API (CLAUDE.md).                                                 |
| 4   | **Ring-pool/bounce-back deadlock:** if a frame renders nothing (dirty flag false), `_postRenderHook` may not run, starving the Worker of returned buffers.                       | Specify `_postRenderHook` to run on every rAF tick in which a bounce is pending (the receipt of a hot-path buffer itself sets the dirty flag, so a render — and its post-hook — always follows a handoff). Soak test (Epic 8) is the falsifier. |
| 5   | **`GameClock` deletion breaks consumers silently.**                                                                                                                              | Deletion is the last task of the sprint, after `RenderClock`/`SimulationClock` have soaked through Epics 2–8; grep-based acceptance plus full test suite.                                                                                       |
| 6   | **Documented Deviation 1** (`hexColors`/`sectorIds` Main-resident) could be rejected by the phase audit as strategic drift.                                                      | Retired: the 2026-07-07 Hardening Sync folded the deviation into the roadmap itself (§4, F-3.1, B3.c), so there is no longer a doc/plan divergence for the auditor to rule on; cite matrix rows 327–328 in `phase-3-audit.md`.                  |
| 7   | **Worker + Vite build interplay:** `new Worker(new URL(...))` must survive both dev (alias into `src/`) and library build without bundling Three.js or blowing the 15 KB budget. | Worker entry imports only Worker-safe modules (P-1/P-2 already enforced); `npm run size` gate after every epic; example app exercises the built worker path via `npm run example`.                                                              |
