# Product Requirements Document — "GSG Logic" Sprint

> **Status: FINAL — ready for implementation (sprint activation is a separate, BDFL-only step)**
> **Target release:** v0.0.6 (named by BDFL 2026-07-07; scope may still adjust before activation).
> **Scope:** Phase 4 (GSG Logic) of `docs/ROADMAP.md`. Phase 3 (The Concurrent Kernel) is complete, audited to `[PASS]`, and archived as v0.0.5 (`docs/archive/v0.0.5/`). Phase 5 is human-gated and explicitly excluded.

---

## How to Use This File

**For AI agents:**

- This is the canonical authority for what to build and how to build it. Where this PRD summarizes, `docs/ROADMAP.md` §§4, 9, 12 hold the maximum-fidelity normative detail — every epic task cites the exact roadmap section.
- Every epic and task must be traceable to a requirement in this document.
- Reference specific sections by heading when making implementation decisions (e.g., "per PRD §Transferable Ownership & the ring pool").
- Epics 5–8 build on the completed, `[PASS]`-audited Phase 3 kernel (v0.0.5). That kernel must be merged to `main` before Epic 5 Task 5.1 begins (ROADMAP §3 Phase Exit Gates) — see `docs/active/PROGRESS.md` Current Status for the live gate state.

---

## Overview

This sprint builds the four GSG capabilities on top of the completed Concurrent Kernel (Phase 3, v0.0.5): pathfinding primitives (CA-4), hierarchical group aggregation (CA-5), spatial label anchoring (CA-8), and dynamic perimeter border rendering (CA-6), closing with the deletion of the deprecated `GameClock` and the Phase 4 finality audit.

The kernel this sprint builds on is already in place: the Worker holds the simulation state behind `SharedRegistryProxy`, `SimulationClock` ticks independently of Main-thread jank, and the GPU fragment-LUT palette pipeline recolors the whole map in under 1 ms. Every Phase 4 epic is Worker-resident work layered on that substrate.

---

## Goals & Non-Goals

### Goals

1. **Pathfinding (CA-4):** `setTraversalCosts` + `findPath` (A\* over CSR adjacency in the Worker, cooperative yielding, `PathNotFoundError`).
2. **Hierarchical aggregation (CA-5):** `setParentMapping` + `aggregateGroups` + sync `getGroupBBox` via Transferable handoff with the 4-buffer ring pool (F-C.7/F-C.8).
3. **Spatial anchoring (CA-8):** `computeAnchors` + sync `getAnchor` — Pole of Inaccessibility (polylabel) over B1.e contour segments, precision 1.0 px.
4. **Dynamic borders (CA-6):** `recomputeBorders` + `getBorderSegments`; `BorderRenderer` bound to a managed GPU VBO (F-C.9); bounce-back only inside `MapRenderer._postRenderHook()`.
5. **Resilience & finality:** WebGL context-loss recovery test (F-4.10), `GameClock` deletion with import migration, Phase 4 audit written and gated per ROADMAP §3.

### Non-Goals

- Anything in ROADMAP §10 (Phase 5): Svelte bindings (CA-10), QuickJS modding (CA-11), group-scope palettes (CA-12), WASM.
- Anything in ROADMAP §11 (Icebox/cancelled): SharedArrayBuffer, BigInt accumulators, multiplayer, `TEXTURE_2D_ARRAY` chunking, stripping Three.js.
- Version-number decisions of any kind (BDFL-only) — this document names v0.0.6 only because the BDFL explicitly did so; do not treat that as license to name versions unprompted elsewhere.

---

## Architecture

### New modules (canonical paths per ROADMAP §12.5)

| Component        | Path                           | Thread | Epic |
| ---------------- | ------------------------------ | ------ | ---- |
| `SpatialGraph`   | `src/worker/SpatialGraph.ts`   | Worker | 5    |
| `BorderRenderer` | `src/render/BorderRenderer.ts` | Main   | 8    |

Existing modules that change: `MapEngine` (new async public API: `setTraversalCosts`, `findPath`, `setParentMapping`, `aggregateGroups`, `getGroupBBox`, `computeAnchors`, `getAnchor`, `recomputeBorders`, `getBorderSegments`), `MapRenderer` (`_postRenderHook`, new this sprint), `ThreeRenderBackend` (`uploadBorderEdges` implementation, F-C.9), `src/types.ts` (new payload/message types for groups/anchors/borders), `src/index.ts` (export updates), `example/` (must track every public API change).

### Worker Message Protocol (extends the shipped Phase 3 protocol — ROADMAP §8 F-3.1, §9)

The `BOOTSTRAP`/`BOOTSTRAP_ACK`/`CALL`/`RESULT`/`ERROR` skeleton shipped in Phase 3 (`docs/archive/v0.0.5/PRD.md`) is reused unchanged. This sprint adds:

- **Worker-initiated allocs (Worker → Main):** `{type: 'INIT_GROUPS', payload: {groupBBoxes: Int16Array}}` and `{type: 'INIT_ANCHORS', payload: {anchors: Int16Array}}`, triggered by the first `setParentMapping` / `computeAnchors` call respectively, and on any subsequent call that requires a reallocation (e.g. changing `maxGroups`).
- **Hot-path handoff:** `{type: 'borderEdges', edges, count}` with both buffers in the transfer list (F-4.9); analogous handoffs for `groupBBoxes` and `anchors`.

### Transferable Ownership & the ring pool (normative: ROADMAP §4)

Cold-path registry arrays already transferred once at bootstrap in Phase 3. Hot-path arrays this sprint introduces (`borderEdges`+`borderEdgeCount`, `groupBBoxes`, `anchors`) use the bounce-back protocol (F-C.7) with a 4-buffer ring-buffered pointer-swap pool (F-C.8: 1 Worker-owned, 1 in-flight, 1 Main-current, 1 Main-pending-bounce — 4 buffers **total**, not 4 per side). Bounce-back to the Worker happens **only** inside `MapRenderer._postRenderHook()`, and for WebGL-bound buffers only after `IThreeRenderBackend.uploadBorderEdges(buffer, count)` has copied the data into the managed GPU VBO (F-C.9).

### Public API delta (all signatures normative in ROADMAP §9, §12.5)

| Method                                                                     | Kind          |
| -------------------------------------------------------------------------- | ------------- |
| `setTraversalCosts(costs: Uint8Array): Promise<void>`                      | async         |
| `findPath(startId, endId): Promise<Uint16Array>`                           | async         |
| `setParentMapping(mapping: Uint16Array, maxGroups: number): Promise<void>` | async         |
| `aggregateGroups(): Promise<void>`                                         | async         |
| `getGroupBBox(groupId): [number, number, number, number]`                  | sync snapshot |
| `computeAnchors(): Promise<void>`                                          | async         |
| `getAnchor(sectorId): [number, number]`                                    | sync snapshot |
| `project(x: number, y: number): [number, number]`                          | sync          |
| `recomputeBorders(): Promise<void>`                                        | async         |
| `getBorderSegments(): Float32Array \| null`                                | sync snapshot |

**Zero API Break Boundary:** `getNeighbors`, `getCentroid`, `getBBox`, and (as of v0.0.5) `pick()` all remain stable; this sprint adds only new methods, no signature changes to anything shipped.

**Canonical errors (`src/errors.ts`, already exist from Phase 3 — this sprint is their first real consumer):** `MappingRequiredError` (thrown by `aggregateGroups()` before `setParentMapping`, and by `getGroupBBox` before the first `aggregateGroups` resolution — widened trigger per ROADMAP §12.5), `PathNotFoundError` (unreachable `findPath` pairs), `CostsRequiredError` (`findPath` before `setTraversalCosts` has resolved at least once). `getAnchor` before the first `computeAnchors` resolution throws, matching `getGroupBBox`'s behavior but **not** its error class — no canonical class is assigned to that trigger (plain `Error` by default — **BDFL ruling**, see Epic 7 Task 7.2). The cross-cutting rule from Phase 3 still applies: `loadMap()` and `dispose()` reject **all** in-flight async Promises — including this sprint's `recomputeBorders`/`aggregateGroups`/`computeAnchors`/`findPath`/`setTraversalCosts`/`setParentMapping` — with `MapInvalidatedError`.

### Process constraints

- Phase 4 recommended order: CA-4 → CA-5 → CA-8 → CA-6 (CA-8 and CA-6 are mutually independent, so this is a recommendation, not a hard serialization like Phase 3's). Note: this deliberately deviates from ROADMAP §9's recommended order (CA-4 → CA-5 → CA-6 → CA-8); F-4.1's dependency graph permits either, and the epic numbering here (Epic 7 = CA-8, Epic 8 = CA-6) follows this PRD's order.
- Worker code paths that can exceed 8 ms must call `yieldIfNeeded` (`MessageChannel`-based, already shipped in `src/worker/yield.ts`).
- Every epic's completion runs the CLAUDE.md post-task checklist; the phase exit additionally runs the four `bin/check-*.sh` scripts and follows the ROADMAP §3 audit protocol (write `docs/audits/phase-4-audit.md` summary, emit `PHASE_EXIT_AWAITING_AUDIT`, terminate the session; the audit itself is out-of-band).
- Test split (F-2.7): logic tests in `*.spec.ts`/`*.test.ts` against `NullRenderBackend`; GL/visual/perf tests in `*.gl.spec.ts` under Playwright + real Chromium (F-3.5). Reference hardware: i7-12700K / RTX 3060 / Chrome 124 (F-C.5); CI tolerance 5.0× on software rendering.
- Core size budget: `npm run size` < 15 KB gzipped after every epic (P-9). Currently 9,171 bytes gzipped as of v0.0.5 — plenty of headroom, but re-check after each epic since `SpatialGraph`/`BorderRenderer` are net-new modules.

### Documented Deviations

None outstanding for Phase 4 at this time. Phase 3's two documented deviations are recorded in `docs/archive/v0.0.5/PRD.md` (both resolved and folded into `docs/ROADMAP.md` before Phase 3 implementation began).

---

## Acceptance Criteria

Falsifiable, per epic. Epic files (`docs/active/epics/`) break these into per-task done-when conditions.

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

### Epic 7 — Anchoring (CA-8) — COMPLETE

- 100% pass on all 20 `test/fixtures/anchor-shapes.json` fixtures, using polylabel over B1.e contour segments (an unordered flat CSR segment list, not ordered rings — see Epic 7 Task 7.1) at default precision 1.0 px, plus synthesized map-edge cracks for bitmap-edge-touching sectors. **BDFL ruling (resolves the fixture-data defect flagged during hardening — 13/20 checked-in `expectedAnchor` values contradicted the polylabel definition):** acceptance is interiority + clearance-optimality (`d_max − d(anchor) ≤ 1.0 px` against an independent brute-force reference), not coordinate equality against `expectedAnchor` — `expectedAnchor` is not treated as authoritative and the implementation was never tuned to reproduce it.
- `getAnchor` is synchronous from the latest snapshot; `anchors` arrive via Transferable handoff; computation yields at ≤ 8 ms; drift ≤ ±2 ms.
- `getAnchor` before the first `computeAnchors()` resolution throws a plain `Error` (**BDFL ruling**: no canonical error class assigned, per the PRD's "Public API delta" note).
- **BDFL ruling (resolves the Epic 7 Task 7.2 Projection API defect):** `MapEngine.project(x, y): [number, number]` and `MapRenderer.project(x, y): [number, number]` were added — a pure-number world→screen transform (no Three.js type crosses the public boundary, satisfying PR-4) computed from the camera's already-orthographic, 1-world-unit-per-pixel geometry. The example's anchor-marker showcase uses this to position DOM overlay markers.

### Epic 8 — Dynamic Borders + Finality (CA-6, F-4.10)

- Fixture `test/fixtures/borders/perimeter-cases.json` exists; edge counts and endpoints match known-good results.
- `recomputeBorders` before any `setParentMapping` rejects with `MappingRequiredError`; all-sentinel mapping resolves with zero edges; coalescing rule per ROADMAP §9 CA-6 (concurrent calls serialize/coalesce, resolve together, reject together, `MapInvalidatedError` on `loadMap`/`dispose`).
- After `recomputeBorders()` resolves: dirty flag is `true` and exactly one `renderer.render` occurs on the next rAF; `BufferAttribute` is bound to the managed GPU VBO, never the Transferable's array.
- 1,000-frame perimeter-mutation soak test: zero `ArrayBuffer is detached` DOMExceptions.
- F-4.10: with `WEBGL_lose_context`, the engine recovers (index texture re-uploaded, render resumes) within 100 ms of simulated context loss.
- `src/GameClock.ts` deleted; zero remaining references (`git grep GameClock src/ test/ example/` → empty; references under `docs/` are historical and remain); all consumers on `RenderClock`/`SimulationClock`.
- Phase 4 exit: all four `bin/check-*.sh` scripts exit 0 ∧ `docs/audits/phase-4-audit.md` summary written ∧ `PHASE_EXIT_AWAITING_AUDIT` emitted.

---

## What This Version Explicitly Does Not Include

- **Phase 3 (already shipped as v0.0.5):** Worker relocation, GPU palette pipeline, map-mode API — see `docs/archive/v0.0.5/PRD.md`.
- **Phase 5 (all of it):** CA-10 Svelte 5 OMT bindings, CA-11 QuickJS modding, CA-12 group-scope palettes (`registerMapMode` stays sector-scope only — CA-7 constraint), WASM anything.
- **Cancelled milestones (ROADMAP §11.1):** BigInt accumulator, SharedArrayBuffer transport, async texture swap, multi-writer sync, state history buffers, multiplayer netcode, advanced AI.
- **Exclusions (§11.2):** stripping Three.js, `TEXTURE_2D_ARRAY` chunking.
- Version bumps, `package.json` version edits (BDFL-only, per CLAUDE.md Versioning Policy) — this PRD's "v0.0.6" target name does not authorize editing `package.json`.
- Roadmap edits (review/revision passes are user-gated; deviations are recorded here and in the phase audit, not in `ROADMAP.md`).

---

## Known Risks

| #   | Risk                                                                                                                                                                                                        | Mitigation                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Vitest browser mode cannot spy across the Worker boundary** — pathfinding/aggregation/anchoring acceptance (drift under Main-thread block, transfer-list assertions) needs real `Worker` + `postMessage`. | Run worker integration specs in browser mode with real Workers; assert observable effects (`byteLength === 0`, message payloads, ring-pool state) rather than internal spies — same pattern Phase 3 established.                                |
| 2   | **Perf gates (< 2 ms path, 60 fps soak) are hardware-relative** and CI may be software-rendered.                                                                                                            | Per ROADMAP §12.2: perf gates run locally-before-merge with output JSON checked in, or on a GPU runner; CI applies the 5.0× software tolerance. Never let a slow CI box mark a perf gate green/red authoritatively.                             |
| 3   | **Ring-pool/bounce-back deadlock:** if a frame renders nothing (dirty flag false), `_postRenderHook` may not run, starving the Worker of returned buffers.                                                  | Specify `_postRenderHook` to run on every rAF tick in which a bounce is pending (the receipt of a hot-path buffer itself sets the dirty flag, so a render — and its post-hook — always follows a handoff). Soak test (Epic 8) is the falsifier. |
| 4   | **`GameClock` deletion breaks consumers silently.**                                                                                                                                                         | Deletion is the last task of the sprint, after `RenderClock`/`SimulationClock` have soaked through Epics 5–8; grep-based acceptance plus full test suite.                                                                                       |
| 5   | **Worker + Vite build interplay:** new Worker-resident modules (`SpatialGraph`) must survive both dev (alias into `src/`) and library build without bundling Three.js or blowing the 15 KB budget.          | Worker entry imports only Worker-safe modules (P-1/P-2 already enforced); `npm run size` gate after every epic; example app exercises the built worker path via `npm run example`.                                                              |
