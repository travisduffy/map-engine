# map-engine: Technical & Product Roadmap

> **Document type:** Canonical Project Roadmap
> **Status:** Living document. Version-agnostic.
>
> This document is the single, unified authority for the `map-engine` project. It synthesizes the product vision (Capability Areas CA-1 to CA-9) with the architectural mandates (Pillars I-VII) and the dependency-ordered execution plan (Phases A/B). It contains the maximum fidelity context required for both strategic planning and implementation.

---

## 1. Vision & Core Engineering Mandates

`map-engine` is a **minimal, browser-native Grand Strategy Game (GSG) spatial runtime** built on WebGL (Three.js) and typed ESM. It provides the Pareto-optimal set of spatial and temporal primitives that every GSG requires — sector identity, spatial topology, visual synchronization, and traversal — without ever owning game state, simulation logic, or UI.

To maintain the **"Hobbyist GSG Portfolio"** North Star — prioritizing ergonomics, deployability, and performance ROI over theoretical maximums — the engine adheres to seven **Core Engineering Mandates (The Pillars)**:

### I. Temporal Accumulation (Float-Based)

Enforce a stable, discrete-state temporal accumulator using standard IEEE 754 floating-point `performance.now()` values. This prioritizes ease of debugging and JS-native ergonomics for hobbyist developers while maintaining sufficient precision for GSG-scale simulation loops.

### II. State Management & Transferable Discipline

Utilize heavily normalized SoA (Structure of Arrays) layout to maximize CPU cache coherency. Communication between Main and Worker threads is governed by **Transferable Ownership** rather than shared memory. This eliminates complex locking overhead and simplifies the mental model for state synchronization.

### III. Worker Boundary & Transferable Discipline

Maintain a strict boundary between the UI/Rendering thread and the Simulation kernel using Web Workers. Data is exchanged via `postMessage` using Transferable `ArrayBuffers` to avoid serialization overhead. This ensures the UI remains responsive even during heavy simulation ticks without requiring `SharedArrayBuffer` or complex WASM memory management.

### IV. Rendering & Map Architecture

The map is an immutable "RGB Index-Map" spatial database. GPU-as-translator via fragment LUTs (palette shaders). Resolve PCIe upload bottlenecks via `gl.texSubImage2D` and PBOs. Use `TEXTURE_2D_ARRAY` for mobile compatibility.

### V. [RETIRED]

_This pillar (Multiplayer & Networking) has been retired following the strategic pivot to single-player hobbyist portfolio tools. All legacy networking mandates are deprecated._

### VI. User Interface (OMT Svelte 5)

Run the simulation kernel strictly inside a Web Worker. Adopt an Off-Main-Thread (OMT) architecture. Use Svelte 5 for Virtual-DOM-free surgical reactivity.

### VII. AI & Modding Script Boundary

Polynomial Utility Scoring for AI; modulo-based temporal scheduling. Embed QuickJS for modding, allowing developers to extend game logic using familiar JavaScript without sacrificing simulation stability.

---

## 2. Architectural Principles

These are the non-negotiable constraints that hold veto power over any architectural decision. Every capability must be compatible with both the First-Class Principles (PR) and the Engineering Principles (P).

### 2.1 First-Class Principles (Veto-Bearers)

These principles define the engine's core ethos: **Balance Performance with Pragmatism.**

| #        | Principle                         | Mandate                                                                                                                                                                                               |
| -------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR-1** | **Hobbyist Deployability**        | The engine must run on zero-config static hosts (GitHub Pages, Netlify, itch.io). Any requirement for specialized HTTP headers (COOP/COEP) or non-standard hosting is rejected by default.            |
| **PR-2** | **Ergonomic Public API**          | The public surface must be writable by developers comfortable with idiomatic JS/Three.js. Specialized knowledge of SoA, BigInt arithmetic, or WASM memory models must never leak into the public API. |
| **PR-3** | **Performance Where It Earns It** | Performance optimizations must be tied to concrete GSG-specific targets (e.g., "10,000 sectors at 60fps"). Optimizations without measurable impact on the hobbyist use case are rejected.             |
| **PR-4** | **Conservative Surface Growth**   | Every public export is a maintenance contract. Internal modules and abstractions are inherently preferred over new public exports.                                                                    |
| **PR-5** | **Reversibility**                 | Architectural decisions should be reversible where reasonable. Version pins, required headers, and forced async boundaries carry high reversal costs and demand severe scrutiny.                      |

### 2.2 Engineering Principles (F-C.2)

The operational constraints required to maintain the engine's internal integrity.

| #       | Principle                                                                                     | Rationale                                                                        | Status       |
| ------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------ |
| **P-1** | `SectorRegistry` has zero Three.js imports.                                                   | It must remain Worker-safe for Transferable-discipline.                          | **RETAINED** |
| **P-2** | `SectorBitmapParser` and `SectorRegistry` have zero DOM dependencies.                         | Worker-safe contract.                                                            | **RETAINED** |
| **P-3** | `MapRenderer` and `MapEngine` are main-thread only.                                           | They touch WebGL and the DOM.                                                    | **RETAINED** |
| **P-4** | The engine never owns game state.                                                             | It synchronizes visuals; it does not simulate.                                   | **RETAINED** |
| **P-5** | New spatial data structures in `SectorRegistry` are computed during the existing O(W×H) pass. | A second full-bitmap scan violates PR-3 (Performance ROI).                       | **RETAINED** |
| **P-6** | ~~[RETIRED]~~                                                                                 | ~~Subsumed by PR-4 (Conservative Surface Growth).~~                              | **RETIRED**  |
| **P-7** | ~~[RETIRED]~~                                                                                 | ~~Conflicts with PR-5 (Reversibility); Three.js pins are explicitly forbidden.~~ | **RETIRED**  |
| **P-8** | New modules are composable, not invasive.                                                     | Prefer wrapping over mutating existing classes (Good engineering practice).      | **RETAINED** |
| **P-9** | **Core Size Budget**                                                                          | Ensure engine remains lightweight for hobbyist deployment (PR-1).                | **NEW**      |

---

## 3. Principle Enforcement Mechanisms

To ensure PR-1 through PR-5 remain active constraints rather than passive ideals, the following structural mechanisms are mandatory for all roadmap execution:

1.  **Milestone Template Amendment:** Every milestone (A1, B1.a, CA-4, etc.) must include a mandatory **Principles Compliance** field detailing which First-Class Principles (PR) are touched. Any milestone that conflicts with a PR must include an explicit audit trail justifying the deviation.
2.  **Phase Exit Gates:** A phase does not officially close until a dedicated principles audit confirms no PR has been silently violated by the cumulative work in that phase.
    - **Protocol:** On milestone completion, the executing agent commits a summary of its work to the relevant `phase-<N>-audit.md` file (see below) and emits a `PHASE_EXIT_AWAITING_AUDIT` signal to the operator.
    - **Resume Protocol:** After emitting `PHASE_EXIT_AWAITING_AUDIT`, the agent terminates its session entirely. Resume is not in-process. A new agent invocation begins by reading the `docs/audits/phase-<N>-audit.md` file. If the internal status field is `[PASS]`, the new invocation proceeds to the next phase. If it is `[FAIL]`, the new invocation reads the failure report and re-executes the failed milestone. Iterations and rework are tracked purely via git commit history on the single audit file.
    - **Orchestration (F-ER.3):** Audits are out-of-band; the executing agent never produces them. The audit is performed using `docs/processes/audit-only.md` by a human reviewer or by a separate agent invocation with an audit-only prompt that does not have execution authority.
    - **Audit Prompt (docs/processes/audit-only.md):**
      - **Role:** Read-only auditor.
      - **Input:** `docs/ROADMAP.md`, `docs/audits/phase-<N>-audit.md` (for current status).
      - **Rubric:** Evaluate all completed milestones against PR-1 through PR-5. Check for strategic drift, redundant exports, or unverified performance claims.
      - **Output:** Updates to the `phase-<N>-audit.md` report mirroring the Roadmap Audit Protocol (RAP) structure.
      - **Decision:** Explicit `[PASS]` or `[FAIL]` status updated in the file.
    - **Audit Artifacts:** Each phase has exactly one audit file: `docs/audits/phase-<N>-audit.md` (e.g., `phase-1-audit.md`). This file contains an internal status header: `Status: [PENDING | FAIL | PASS]`.
    - **Finality:** A phase is officially closed only by merging the `[PASS]` audit document to `main`.
3.  **Revision History Citation:** All future roadmap updates, audits, and trajectory changes must explicitly cite which principle (PR-1 to PR-5) motivated the revision.

---

## 4. Normative Memory Contract (Transferable-Based)

To prevent cross-phase data-type contradictions, all milestones MUST adhere to this normative table for contiguous memory. Communication between Main and Worker threads utilizes **Transferable Ownership** of these arrays.

| Identifier           | TypedArray     | Phase                           | Initial Owner          | Steady-state Owner (B3+)          | Consumers | When Allocated                       | Lifecycle / Sizing Pattern                                                                                                                        |
| -------------------- | -------------- | ------------------------------- | ---------------------- | --------------------------------- | --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceBuffer`       | `Uint8Array`   | B3 (bootstrap)                  | Main                   | N/A (Transient, Main-only)        | Main      | Dev-time (Initial `loadMap`)         | Fixed: `width * height * 4`. Disposed after `pixelIndices` extraction.                                                                            |
| `pixelIndices`       | `Uint32Array`  | B1.a                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `width * height` (Flat index map). **Note:** Sole Main-to-Worker bootstrap transfer (F-3.3).                                               |
| `pixelIndicesMirror` | `Uint16Array`  | B3.a                            | Main                   | Main                              | Main      | On `loadMap()`                       | Fixed: `width * height`. Downcast from `pixelIndices` for context recovery (F-3.3).                                                               |
| `bboxes`             | `Int16Array`   | B1.a                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `sectorCount * 4` [minX, minY, maxX, maxY]                                                                                                 |
| `centroids`          | `Int16Array`   | B1.a                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `sectorCount * 2` [x, y]                                                                                                                   |
| `adjacencyPointers`  | `Uint32Array`  | B1.b                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `sectorCount + 1` (CSR Row Pointers)                                                                                                       |
| `adjacencyNeighbors` | `Uint16Array`  | B1.b                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `totalEdges` (CSR Column Indices)                                                                                                          |
| `contourPointers`    | `Uint32Array`  | B1.e                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `sectorCount + 1` (CSR Row Pointers)                                                                                                       |
| `contourPoints`      | `Int16Array`   | B1.e                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `totalContourSegments * 4` [x1, y1, x2, y2] per segment (unordered; a shared edge appears once in each adjacent sector's CSR bucket)       |
| `hexColors`          | `Uint32Array`  | B1.a (shipped)                  | Main                   | Main (never transferred)          | Main      | During `loadMap()` registry scan     | Fixed: `sectorCount` (Packed RGB, sorted ascending). Main-resident packed-RGB→ID table; never crosses the Worker boundary (Hardening Sync, PR-3). |
| `sectorIds`          | `Uint16Array`  | B1.a (shipped)                  | Main                   | Main (never transferred)          | Main      | During `loadMap()` registry scan     | Fixed: `sectorCount` (Numeric IDs paired with `hexColors`). Main-resident; never crosses the Worker boundary (Hardening Sync, PR-3).              |
| `borderEdges`        | `Float32Array` | B1.c (alloc) / CA-6 (populated) | Main                   | Worker (4-buffer pool, see F-C.8) | Main      | On `loadMap()`                       | `4 * totalGeometricPerimeterSegments` Float32 elements (= `16 * totalGeometricPerimeterSegments` bytes). Sized after B1.e produces segment count. |
| `borderEdgeCount`    | `Uint32Array`  | B1.c                            | Main                   | Worker                            | Worker    | Dev-time (Initial `loadMap`)         | Fixed: `1` (Stored in a 1-element TypedArray for Transferable handoff consistency)                                                                |
| `parentMapping`      | `Uint16Array`  | CA-5                            | Main                   | Worker                            | Worker    | Runtime, on `setParentMapping()`     | Fixed: `sectorCount`. Transferred Main → Worker via `postMessage`. Main does not retain copy.                                                     |
| `groupBBoxes`        | `Int16Array`   | CA-5                            | Worker (alloc at CA-5) | Worker (4-buffer pool, see F-C.8) | Main      | Runtime, on first `setParentMapping` | Fixed: `maxGroups * 4` (Transferable handoff). `maxGroups` supplied by consumer at `setParentMapping` time.                                       |
| `traversalCosts`     | `Uint8Array`   | CA-4                            | Main                   | Worker                            | Worker    | Runtime, on `setTraversalCosts()`    | Fixed: `sectorCount`. Transferred Main → Worker via `postMessage`. Main does not retain copy; replacement requires fresh allocation.              |
| `anchors`            | `Int16Array`   | CA-8                            | Worker (alloc at CA-8) | Worker (4-buffer pool, see F-C.8) | Main      | Runtime, on first `computeAnchors`   | Fixed: `sectorCount * 2` (Transferable handoff)                                                                                                   |

> **Ownership Note:** Hot-path arrays (`borderEdges`, `borderEdgeCount`, `groupBBoxes`, `anchors`) utilize a **Transferable Handoff** protocol. Ownership is exchanged via `postMessage`, ensuring zero Garbage Collection (GC) churn during high-frequency visual synchronization. Cold-path arrays (registry data) are transferred once during B3 bootstrap.
>
> **Bounce-Back Protocol (F-C.7):** Hot-path Transferable arrays use a **bounce-back protocol** (see F-C.8 for pool sizing): after Main consumes the buffer, it transfers ownership back to the Worker ONLY inside the `_postRenderHook` (see below).
>
> **Detachment Guard (F-C.8):** To support synchronous accessors (e.g., `getGroupBBox`), Main-side proxies utilize a **ring-buffered pointer-swap** strategy. On receipt of a Transferable buffer, Main swaps its local reference with the new buffer, eliminating the O(N) `.set()` copy overhead. The steady-state pool size is 4 (1 Worker-owned, 1 in-flight, 1 Main-current, 1 Main-pending-bounce).
>
> **GPU Sync Mandate (F-C.9):** WebGL-bound buffers (currently `borderEdges`) must have their data uploaded to a GPU VBO via `IThreeRenderBackend.uploadBorderEdges(buffer, count)` _before_ the CPU-side Transferable is bounced back to the Worker. The `THREE.BufferAttribute` exposed by `BorderRenderer` is bound to the managed GPU VBO, never directly to the Transferable's CPU-side array. **Critically:** Bounce-back to the Worker happens ONLY inside `MapRenderer._postRenderHook()`, ensuring Three.js has completed its draw calls before the buffer is detached.

**Note on `pixelIndices`:** Before transferring `pixelIndices` to the Worker (B3), the main thread MUST upload it as a GPU texture source; the Worker thereafter owns the ONLY CPU-resident copy (F-3.3).

---

## 5. The Unified Dependency Graph

This graph maps the chronological flow of work. Refactors (A/B) unblock Capabilities (CA).

```text
[Already Shipped (F-ER.1):
 - CA-1 Frame Hook: rAF integration is located in `src/MapRenderer.ts`; exported as `engine.onFrame(callback)`. A1 wires the dirty-flag check inside this callback after `_preRenderHook()` returns.
 - CA-2 Adjacency (src/MapEngine.ts, getNeighbors())
 - CA-3 Input Pipeline (src/input/InputController.ts) (F-C.3)
 - CA-9 Game Clock (src/GameClock.ts) (F-C.1, F-C.10)
 - A1 Render Gating (src/MapRenderer.ts, _dirty flag) (F-1.2, F-1.3)
 - MapRenderer._preRenderHook(): void (F-C.11): Public hook (tagged @internal) called once per rAF frame before renderer.render(); default no-op; subclasses override (e.g., camera-following). Located at `src/MapRenderer.ts`.
 - B1.a-e: SectorRegistry SoA Flattening, Adjacency CSR, Contour Extraction, Border Allocation
 - B1.5: Rendering Decoupling (IThreeRenderBackend)]

                    ┌──────────────────────────────────────────────────┐
    Phase 0         │ A0.1: bench:registry-alloc + initial baseline    │
    (Prep)          │ A0.2: audit-only.md prompt                       │
                    │ A0.3: anchor fixture authoring (gates CA-8)      │
                    └───────────────────┬──────────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
    Phase 1         │ A1.5: CA-3 Unify (Prereq for A1)        │
   (Momentum)       │ A1: Render Gating                       │
                    │ Status: [COMPLETE]                      │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
    Phase 2         │ B1.5 -> B1.a -> B1.b -> B1.e -> B1.c    │
  (Structural)      │ B1.d: ISpatialRegistry Contract         │
                    │ Status: [COMPLETE]                      │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
    Phase 3         │ B3.a -> B3.b -> B3.c: Worker Reloc      │
    (Kernel)        │ B2: GPU Map Modes (Palette Shaders)     │
                    │ CA-7: Palette API                       │
                    │ Status: [COMPLETE]                      │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
    Phase 4         │ [CA-4, CA-5] -> CA-6 Dynamic Borders    │
  (GSG Logic)       │ [A0.3, B1.e] -> CA-8 Anchors            │
                    └─────────────────────────────────────────┘
```

---

## 6. Phase 1: Momentum Extraction (COMPLETE)

**Status: [COMPLETE]** — Phase 1 was successfully audited and closed on 2026-05-13.

_Goal: Eliminate obvious waste and harden the rendering pipeline without breaking APIs._

**Phase 0 Prerequisites (COMPLETE):**

1. `npm run typecheck` (or `npx tsc --noEmit`) exits 0 on `main`.
2. **A0.1 (Benchmark Infrastructure):** `npm run bench:registry-alloc <fixture-path>` is implemented.
   - **bench/SPEC.md:** Script must run `npx playwright test bench/registry-alloc.spec.ts` against fixture at `<fixture-path>`, measure `performance.measureUserAgentSpecificMemory()` before and after `new SectorRegistry(bitmap)`, and write median-of-10 to `bench/baselines.json` under key `b1.constructor_alloc_bytes`. The initial baseline must be captured and committed to `main`.
3. **A0.2 (Audit Prompt):** `docs/processes/audit-only.md` exists and is checked into `main`.
4. **A0.3 (Anchor Fixtures):** `test/fixtures/anchor-shapes.json` exists with ≥20 fixtures, ≥2 of each of 7 shape classes (convex, concave, annulus, spiral, off-centroid, narrow corridor, multi-pole), each with a hand-verified `expectedAnchor` accurate to within a fixed 1.0 px tolerance (the tolerance is a test constant, not a per-record JSON field — the shipped fixture schema is `{id, type, points, expectedAnchor}`).
5. **A0.4 (Finding Code Integrity):** `bin/check-finding-codes.sh` exists and is executable.
6. **A0.5 (Roadmap Cross-Refs):** `bin/check-roadmap-cross-refs.sh` exists and is executable.
7. **A0.6 (Matrix Consistency):** `bin/check-matrix-vs-roadmap.sh` exists and is executable. Script must assert that for every Pass 8+ matrix entry in `docs/ROADMAP_TRACEABILITY_MATRIX.md`, the cited document text is actually present in `docs/ROADMAP.md` (string match against the change description).
8. **A0.7 (Roadmap Consistency):** `bin/check-roadmap-consistency.sh` exists and is executable. Script must assert that §4 pool sizes match the F-C.8 narrative and audit filenames match §3 convention.
9. `npm` (v10 or v11+) is installed in the execution environment.

**Phase 0 Acceptance Criteria (Verification REQUIRED):**

- **Benchmark Stability:** Median baseline capture shows <5% variance across two consecutive nightly runs on reference hardware.
- **Anchor Verification:** Anchor fixture `expectedAnchor` values independently re-verified against a reference implementation or second-party review.
- **Integrity Pass:** `bin/check-finding-codes.sh` and `bin/check-roadmap-cross-refs.sh` both exit 0 on current `main`.
- **Mobile Heap Budget Gate:** Synthetic 4096px worst-case mobile heap budget verification (using the Pass 8 `sourceBuffer` disposal and binary-search `hexColors`/`sectorIds` optimizations) confirms peak usage ≤ 256MB on reference mobile hardware.

If any prerequisite or AC fails, halt and surface the failure to the operator before proceeding. Phase 0 completion requires a formal audit of these prerequisites and ACs via `docs/audits/phase-0-audit.md` before Phase 1 begins.

**Execution starts at A1.5 (F-ER.2).**

**Phase Exit Gate:** Phase 1 complete when `A1.5` and `A1` acceptance suites are green in CI ∧ **Principles Audit** (PR-1 to PR-5) confirms no strategic drift. **Audit document: `docs/audits/phase-1-audit.md`.**

### [x] A1.5 CA-3 Structural Unification

- **Problem:** Input handling features (pan, zoom, pick) are live but implemented as fragmented logic across `MapEngine` and `MapRenderer`.
- **Solution:** Consolidate input state and listeners into a unified `InputController`.
- **Principles Compliance:** PR-2 (Ergonomic API), PR-4 (Conservative Surface).
- **Sub-steps:**
  - **[x] A1.5.0 (Pre-flight):** `npm run typecheck` and current `npm run bench:registry-alloc` must pass on `main`.
  - **[x] A1.5.1 (Path migration):** Relocate all shipped modules to §12.5 paths. Update all imports. Re-run `typecheck` and benchmark; both must pass with no perf regression > 5%.
  - **[x] A1.5.2 (InputController):** Build the controller, satisfying the API surface and coupling contract.
  - **[x] A1.5.3 (Verify):** Run grep AC and final benchmarks.
- **Mandate (F-1.1):** `InputController` is Main-thread only (DOM consumer). `SectorRegistry` and `SectorBitmapParser` retain P-1/P-2 Worker-safety.
- **Coupling Contract (F-1.2):** `InputController` accepts an `onDirty: () => void` callback at construction. `MapRenderer` passes `() => { this._dirty = true; }`. No other coupling permitted.
- **API Surface:**
  - `onPan(delta: Vector2)`: Triggers `onDirty` callback.
  - `onZoom(zoom: number, point: Vector2)`: Triggers `onDirty` callback.
- **Acceptance:**
  - `MapRenderer` and `MapEngine` are decoupled from raw pointer events. **Verifiable via `git grep -E '\\b(addEventListener|removeEventListener|PointerEvent|MouseEvent|KeyboardEvent|WheelEvent|TouchEvent|DragEvent|: Event\\b)'` asserting zero hits outside `src/input/InputController.ts`.**
  - All shipped modules relocated to canonical paths per §12.5; old paths deleted.
  - Zero imports from `InputController.ts` in `src/worker/**`.

### [x] A1 Render Gating

- **Problem:** `MapRenderer` currently performs an unconditional `renderer.render()` in every rAF frame, wasting ~95% of GPU submits when the scene is static.
- **Solution:** Add a boolean dirty flag to `MapRenderer`. Set to `true` when `_flushPendingDirty` (F-ER.4) flushes work, when immediate colors are set, on pan/zoom events (via A1.5 `onDirty`), or on canvas resize.
- **Contract:** Future milestones that mutate render state (CA-7 palette swap, CA-6 border geometry update) MUST set the dirty flag at the point of mutation. This is a forward-looking contract enforced by §3 Phase 3/4 audits.
- **Principles Compliance:** PR-3 (Performance ROI).
- **Requirement (F-1.4):** The flag must be checked AFTER `_preRenderHook()` returns. Rationale: `_preRenderHook` may set the dirty flag (e.g., for camera-following behaviors); checking before it would miss those mutations.
- **Initial State:** Initial frame must render unconditionally (default `true`). The flag MUST be reset to `false` at the end of the `render()` block.
- **Acceptance:** GPU submit rate drops to mutation-driven cadence; first frame renders unconditionally.
- **Verifiable via Vitest spy asserting `renderer.render` call count is zero on no-op ticks (after initial frame).**
- **No-Op Tick Definition (F-1.3):** A no-op tick is a rAF callback in which (1) no pointer event fired since the previous frame, (2) `_flushPendingDirty` performed zero work, (3) no `setImmediateColor` call occurred, (4) `canvas.clientWidth/Height` is unchanged. The acceptance test asserts `renderer.render` is called exactly zero times across 10 consecutive no-op ticks (after the initial frame).

---

## 7. Phase 2: The Structural Pivot (Critical Path)

**Status: [COMPLETE]** — Phase 2 was successfully audited (`docs/audits/phase-2-audit.md`, `[PASS]`) and closed on 2026-06-14, archived as `docs/archive/v0.0.4/`. The documentation freeze that was in effect during execution was lifted on 2026-07-07 (see `ROADMAP_TRACEABILITY_MATRIX.md` row 327+ for the post-freeze Hardening Sync pass).

_Goal: Rip out the V8-idiomatic object graph and replace it with a high-performance Data Engine._

**Ordering Rule (F-2.0):** B1.5 may execute in parallel with B1.a. Within the B1.\* sequence, B1.a → B1.b → B1.e → B1.c → B1.d is strictly serial because B1.c consumes B1.e's segment count and B1.b's edge count.

**Phase Exit Gate:** Phase 2 complete when `B1.a-e` and `B1.5` acceptance suites green ∧ **Principles Audit** confirms alignment with PR-1 through PR-5. **Audit document: `docs/audits/phase-2-audit.md`.**

### B1.a-e SectorRegistry Flattening (Upgrades CA-2)

- **Problem:** `Map<string, ...>` layout causes high GC pressure and cache misses.
- **Principles Compliance:** PR-3 (Performance ROI).
- **Phase 2 Entrance Gate (F-2.1):** Before B1.a begins, run `npm run bench:registry-alloc` against `fixtures/maps/large.png` via Playwright + Chrome on reference hardware. Use `performance.measureUserAgentSpecificMemory()` for measurement (fall back to `performance.memory.usedJSHeapSize` only when MAVS is unavailable; document the fallback in `bench/baselines.json` alongside the value). Commit median over 10 runs to key `b1.constructor_alloc_bytes`. All B1.a-e acceptance gates read from this key.
- **Principle Exception (PR-1):** Benchmarking infrastructure inside Playwright may use COOP/COEP headers to enable `measureUserAgentSpecificMemory()`; this does not affect shipped engine deployment requirements which remain header-free.
- **bench/baselines.json Schema:** `{[key: string]: {value: number, unit: string, capturedAt: ISO8601, hardware: string, measurementMethod: string}}`.
- **Baseline (F-2.2):** Baseline = `b1.constructor_alloc_bytes`. Acceptance: post-B1.e median ≤ 0.2 × baseline.
- **Milestones:**
  - **B1.a (Dense SoA):** Assign dense 0..N-1 integer IDs. Convert `bboxes`, `centroids`, and `pixelIndices` into SoA TypedArrays. **Acceptance:** `bboxes + centroids + pixelIndices` heap is within 5% of theoretical-minimum byte size.
  - **B1.b (CSR Adjacency):** Implement adjacency using `adjacencyPointers: Uint32Array` (indices into neighbors) and `adjacencyNeighbors: Uint16Array` (neighbor IDs). **Acceptance:** `adjacencyPointers + adjacencyNeighbors` heap == `(sectorCount+1)*4 + totalEdges*2` bytes ± 5%.
  - **B1.e (Contour Extraction):** Extract per-sector boundary contour segments during the existing O(W×H) pass — an unordered flat CSR segment list (`[x1,y1,x2,y2]` per segment); no ring ordering or per-segment neighbor identity is stored, and consumers needing the far side of a segment pair it by resampling `pixelIndices` (Hardening Sync — Code-Truth). Produce `contourPointers: Uint32Array`, `contourPoints: Int16Array`, and `totalGeometricPerimeterSegments: number` (deduplicated geometric segment count). **Acceptance:** `contourPointers + contourPoints` populated within the same O(W×H) pass; assert via instrumented Vitest spy that the pixel-iteration loop runs exactly once per `loadMap`.
  - **B1.c (Border Edge Allocator):** B1.c executes after B1.e and consumes its `totalGeometricPerimeterSegments` output. Implement `SectorRegistry`'s allocation of `borderEdges: Float32Array` and `borderEdgeCount: Uint32Array(1)` (initialized to 0) during `loadMap()`. Both buffers are transferred to Worker during B3.a bootstrap. **Acceptance:**
    - `borderEdges instanceof Float32Array`
    - `borderEdges.length === 4 * totalGeometricPerimeterSegments`
    - `borderEdges.every(v => v === 0)` (Zero-initialized; relied on by CA-6 sentinel paths)
    - `borderEdgeCount instanceof Uint32Array`
    - `borderEdgeCount.length === 1`
    - `borderEdgeCount[0] === 0`
  - **B1.d (ISpatialRegistry):** Define shared contract for `SectorRegistry` and hierarchical proxies. **Revision:** Drop WASM-facing memory alignment constraints; retain SoA for internal performance. **Acceptance:** TypeScript interface compiles; a `NullSpatialRegistry` test double satisfies it.
  - **Hierarchical Proxy Requirements (F-2.3):** The contract must support: `getBBox(groupId)`, `getNeighbors(groupId)`, `getCentroid(groupId)`.
  - **Internal Canonicalization (F-2.4):** Use `packRgb` internally: `(r<<16)|(g<<8)|b`. Tag as `@internal`. (F-2.5)
- **Zero API Break Boundary:** The following methods MUST remain synchronous and continue to use hex-string IDs: `getNeighbors`, `getCentroid`, `getBBox`. Internal lookup tables handle translation to numeric IDs. `pick()` is transitioned to an asynchronous `Promise` based signature to accommodate GPU readback latency and Worker IPC.
- **Acceptance:** Baseline fixture `fixtures/maps/large.png` results in >80% reduction in constructor heap allocation vs current version.

- **B1.5 (IThreeRenderBackend Contract):**
  - **Problem:** `MapRenderer` is tightly coupled to Three.js.
  - **Solution:** Extract an `IThreeRenderBackend` interface.
  - **Principles Compliance:** PR-4 (Conservative Surface), PR-5 (Reversibility).
  - **Normative Interface:**
    ```ts
    interface IThreeRenderBackend {
      uploadTexture(tex: THREE.Texture): void
      uploadBorderEdges(buffer: Float32Array, count: number): void // F-C.9
      updateUniforms(uniforms: Record<string, any>): void
      render(scene: THREE.Scene, camera: THREE.Camera): void
      dispose(): void
    }
    ```
- **Escape Hatch (F-2.6):** `IThreeRenderBackend` implementations may also implement `ThreeRenderBackendInternalAccess { getThreeScene(): Scene; getThreeRenderer(): WebGLRenderer; readSectorIdAt(x: number, y: number): number; }`. Consumers must feature-detect via `instanceof` and degrade gracefully when absent.
- **Acceptance (F-2.7):**
  - **Test Split:** Logic tests (camera math, dirty-flag flow, etc.) live in `*.spec.ts` and run against `NullRenderBackend` (Vitest). Visual tests (reading from `gl.readPixels`, `canvas.toDataURL`, etc.) live in `*.gl.spec.ts` and run against `ThreeRenderBackend` (Playwright).
  - `MapRenderer` makes zero non-type `import` statements from `'three'`. Verifiable via `git grep -E '^import .* from .three.' src/MapRenderer.ts | grep -v 'import type'` returning zero hits.
- **Null Backend No-Ops (F-2.8):** `NullRenderBackend.uploadTexture` is a no-op but MUST retain a reference to the source typed-array via `.slice()` to support Main-thread `pick()` lookups during unit tests. `updateUniforms`, `render`, `uploadBorderEdges`, and `dispose` are no-ops. Any future methods added to `IThreeRenderBackend` must have a `NullRenderBackend` implementation.

---

## 8. Phase 3: The Concurrent Kernel

**Status: [COMPLETE]** — Phase 3 was successfully audited (`docs/audits/phase-3-audit.md`, `[FAIL] → [PASS]` after same-session remediation of two evidence gaps, §9–§10) and closed on 2026-07-07, archived as `docs/archive/v0.0.5/`. Epic 5 (Phase 4, Task 5.1) is unblocked.

_Goal: Move the brain into a Worker and the eyes onto the GPU using Transferable Discipline._

**Ordering Rule (F-3.0):** Phase 3 milestones are strictly serial: `B3.a-c → B2 → CA-7`. B2 cannot start until B3.a's GPU texture upload (F-3.1) is merged. CA-7 cannot start until B2's palette shader is in place.

**Phase Exit Gate:** Phase 3 complete when `B3.a-c`, `B2`, and `CA-7` pass multi-threaded integrity tests in CI ∧ **Hobbyist Quickstart** (1-hour working sample app on GH Pages using only public API) is verified ∧ **Principles Audit** confirms compliance. **Audit document: `docs/audits/phase-3-audit.md`.**

**Worker Message Protocol (F-3.1):**

- **Bootstrap (Main → Worker):**
  ```ts
  {type: 'BOOTSTRAP', payload: {
    pixelIndices, bboxes, centroids,
    adjacencyPointers, adjacencyNeighbors,
    contourPointers, contourPoints,
    borderEdges, borderEdgeCount,
    width, height, sectorCount, tickHz
  }}
  ```
  Transfer list MUST include `.buffer` for every typed-array field above. Verifiable by post-call assertion `payload.pixelIndices.byteLength === 0` for all nine bootstrap-phase buffers. **Mandate:** Image parsing happens entirely on the Main thread; `sourceBuffer` is never sent to the Worker.
- **Worker-Initiated Alloc (Worker → Main):**
  - `{type: 'INIT_GROUPS', payload: {groupBBoxes: Int16Array}}`
  - `{type: 'INIT_ANCHORS', payload: {anchors: Int16Array}}`
    Triggered by first `setParentMapping` / `computeAnchors` respectively.
- **Bootstrap Ack (Worker → Main):** `{type: 'BOOTSTRAP_ACK', payload: {sectorCount, totalEdges, firstSectorBBox, lastSectorBBox}}` — verification scalars only. **Note:** `hexColors`/`sectorIds` are constructed on Main during registry construction and never routed through the Worker; there is no structured-cloned `hexMap` and no ACK-time Transferable payload (Hardening Sync — the GC-spike concern this ack once addressed is moot with Main-side registry construction, PR-3).
- **Method call (Main → Worker):** `{type: 'CALL', id: number, method: string, args: any[]}`
- **Method result (Worker → Main):** `{type: 'RESULT', id: number, value: any, snapshot?: any}` | `{type: 'ERROR', id: number, message: string}`
- **Worker Lifecycle:** Worker spins up in `MapEngine` constructor; `loadMap()` triggers Bootstrap. Method calls correlate via monotonic `id`.

**Phase 3 Setup (F-3.2):**

1. Run the drift fixture `test/fixtures/game-clock/drift-100tick.json` against the existing GameClock to confirm ±1ms over 100 ticks (must precede B3.b).

### B3 Worker Relocation (Transferable Ownership)

- **Problem:** Main-thread jank perturbs simulation tick timing.
- **Principles Compliance:** PR-1 (Hobbyist Deployability), PR-2 (Ergonomic API), PR-5 (Reversibility).
- **Milestones:**
  - **B3.a (Bootstrap Transfer):**
    - **API Addition:** `MapEngine.setTickRate(hz: number): void`. Synchronous; throws if called after `loadMap()` resolves. Validation: `1 ≤ tickHz ≤ 240`. If consumer does not call `engine.setTickRate()` before `loadMap()`, default to 60. Include in BOOTSTRAP payload.
    - **Principles Compliance:** PR-1 (Hobbyist Deployability), PR-3 (Performance ROI).
    - **GPU Synchronization (F-3.3):**
      - Main thread uploads `pixelIndices` as `R32UI` before transfer.
      - **Context Loss Resilience:** Main thread must create and retain an immutable `pixelIndicesMirror` (`Uint16Array`) downcast from `pixelIndices` before Bootstrap. Memory footprint: 32MB at 4096px (halved vs. Uint32).
      - **Recovery:** `ThreeRenderBackend` must implement a `webglcontextrestored` listener on the canvas that re-uploads the index texture from `pixelIndicesMirror`.
      - **Recovery Acceptance (F-4.10):** Add a Phase 4 acceptance test requiring the use of the `WEBGL_lose_context` extension to assert the engine recovers within 100ms of a simulated context loss.
      - **Runtime Check:** If `!(gl instanceof WebGL2RenderingContext)`, throw `WebGL2NotSupportedError`.
    - **Bootstrap:** Execute `BOOTSTRAP` message transfer.
    - **Acceptance:**
      - Worker receives buffers; main thread `byteLength === 0`.
      - **BootstrapAck:** Worker responds with `BOOTSTRAP_ACK`; main asserts values match pre-transfer state.
  - **B3.b (SimulationClock Relocation):**
    - Add `SimulationClock` to Worker (accumulator-driven, tick rate `tickHz` from `BOOTSTRAP`, default 60Hz). Keep `RenderClock` on Main for rAF integration.
    - **Principles Compliance:** PR-3 (Performance ROI).
    - **Yield Helper Mandate:** Create a cooperative yielding helper — `yieldIfNeeded(state: { lastYield: number }): Promise<void>` (`src/worker/yield.ts`), implemented via a `MessageChannel.postMessage(0)` round-trip; `state` is caller-owned and shared across call sites — used by heavy Worker tasks to prevent event-loop starvation.
    - **Drift Re-verification:** Post-relocation, re-run drift fixture; ±1ms must still hold for `SimulationClock`. Both clocks are float-accumulator-based; the rAF wall-clock distinction is irrelevant for drift measurement, so the existing fixture's expected values transfer.
    - **Acceptance:** `SimulationClock.tick()` runs at steady 60Hz in Worker under 100ms Main-thread block.
  - **B3.c (SharedRegistryProxy):**
    - **Sync methods (snapshot reads):** `getBBox(id)`, `getNeighbors(id)`, `getCentroid(id)`. Serviced from snapshots pushed in `RESULT` messages.
    - **Principles Compliance:** PR-2 (Ergonomic API), PR-4 (Conservative Surface).
    - **Sync methods (direct):**
      - `setMapMode(id)`: Consults Main-thread registry synchronously. Throws `Error('Unknown map mode: <id>')` on miss. On hit, sets dirty flag synchronously and calls `IThreeRenderBackend.updateUniforms({palette: colors})`. No Worker message dispatched.
      - `registerMapMode(id, colors)`: Validates synchronously (throws on duplicate ID or length mismatch), adds to Main-thread registry.
      - `dispose(): Promise<void>`: Terminates Worker, releases GPU resources, drops in-flight buffers and registered palette data.
    - **Async methods (Worker round-trip):** `loadMap`, `pick`, `setTraversalCosts`, `setParentMapping`, `aggregateGroups`, `computeAnchors`, `findPath`. Promises resolve only after Worker returns and proxy's snapshot is refreshed.
    - **Harden Lifecycle Rejection:** `loadMap()` and `dispose()` MUST reject all in-flight async Promises (`recomputeBorders`, `aggregateGroups`, `computeAnchors`, `findPath`, `setTraversalCosts`, `setParentMapping`) with `MapInvalidatedError`. `loadMap` also discards all registered map modes (palette data).
    - **pick(point):** Returns a `Promise<PickResult | null>`. Resolves to `null` if (a) no `loadMap` has been awaited successfully, or (b) `BOOTSTRAP_ACK` has not yet been received. Otherwise, performs `readSectorIdAt()`. If numeric ID is `0xFFFF` or invalid, resolve to `null`. Otherwise resolves to `PickResult` via the Main-resident `idToHex` table (O(1)).
    - **Hex-ID Lookup:** Numeric ID → hex string resolves through the Main-resident `idToHex: string[]` table retained from registry construction — O(1), zero extra memory (Hardening Sync, PR-3). The paired `hexColors`/`sectorIds` arrays remain Main-resident for packed-RGB → numeric-ID lookups (binary search over sorted `hexColors`); they are not on the `pick()` path.
    - **Acceptance:**
      - Verifiable via `test/integration/proxy-snapshot.spec.ts` asserting sync reads on Main post-async-mutation.
      - **Lifecycle Invalidation:** Verifiable via `test/integration/lifecycle-invalidation.spec.ts` asserting that rapid `loadMap → in-flight async → loadMap` results in `MapInvalidatedError` for the first async call.

### B2 Palette Shaders

- **Job Story:** "I want map modes to re-color instantly at 60fps."
- **Solution:** Replace CPU pixel iteration with a fragment LUT.
- **Principles Compliance:** PR-3 (Performance ROI).
- **Internal API:** B2 exposes an internal-only `_setPaletteUniformDirect(colors: Uint32Array)` (tagged `@internal`) used by the B2 test harness.
- **Acceptance:** Full map re-color completes in < 1ms on reference hardware. B2 palette swaps update only the palette uniform, never the index texture.
- **Verifiable via Playwright + real Chromium WebGL2 (performance.now() bracketing).**

### CA-7 Palette API (F-3.4)

- **Problem:** No public interface to trigger map mode swaps.
- **Solution:** Implement the public `MapMode` registry and signaling.
- **Principles Compliance:** PR-4 (Conservative Surface).
- **API Relationship:** The `updateUniforms({palette})` call is the production path; `_setPaletteUniformDirect` (B2) wraps the same uniform write for benchmark harnesses that bypass the registry. Both ultimately call into a single private `_writePaletteUniform(colors)` helper inside `ThreeRenderBackend`.
- **API Surface:**
  - `registerMapMode(id: string, colors: Uint32Array)`: Validation is synchronous (`colors.length !== sectorCount` and duplicate ID both `throw`). Palettes live in a Main-side `Map<string, Uint32Array>`.
  - `setMapMode(id: string)`: Throws `Error('Unknown map mode: <id>')` if the id was not previously registered.
- **Contract & State Machine:**
  1. `setMapMode(id)` consults the Main-thread registry synchronously.
  2. If valid, it sets the dirty flag synchronously.
  3. It executes `IThreeRenderBackend.updateUniforms({palette: colors})` immediately.
  4. **Registration Atomicity (F-3.6):** `registerMapMode` is fully synchronous (validate → persist, no awaited work), so no "in-flight" window exists and no buffering is required. The previously specified `pendingMapMode` buffer and `'mapModeRegistrationFailed'` event are removed as unreachable states (Hardening Sync, PR-4: no API surface for impossible conditions). Both `registerMapMode` and `setMapMode` throw `ModeNotReadyError` if called before `loadMap()` has resolved.
  5. **Lifecycle Cleanup:** Registered palette data is discarded on `loadMap()` or `dispose()`.
- **No-Op Semantics:** If the id is already the active mode, the call must no-op (zero uniform writes, zero dirty-flag mutations).
- **Constraint:** Group-level coloring (country/state palettes) is deferred to Phase 5. CA-7 handles sector-level palettes only.
- **Acceptance:**
  - `registerMapMode` correctly persists modes.
  - `setMapMode` triggers exactly one render submit on the next rAF; second consecutive `setMapMode(currentId)` triggers zero submits. Deterministic single-frame test via rAF hook.

---

## 9. Phase 4

_Goal: Deliver actual GSG features built upon the ultra-fast Transferable-discipline kernel._

**Phase Exit Gate:** Phase 4 complete when all CAs pass functional tests over graph fixtures in CI ∧ **Principles Audit** confirms alignment. **Audit document: `docs/audits/phase-4-audit.md`.**

- **Finality Audit:** The Phase 4 audit MUST verify that `src/GameClock.ts` has been deleted (after the B3.b deprecation window) and all imports have migrated to `RenderClock` or `SimulationClock`.

**Recommended Execution Order:** CA-4 (independent, smallest scope, validates worker A\* harness) → CA-5 → CA-6 (CA-5 unblocks group data needed by CA-6) → CA-8 (largest scope, builds on stabilized worker).

**Dependency Graph (F-4.1):**

```text
B3
├─→ CA-4 (independent)
├─→ CA-5 ──→ CA-6
└─→ CA-8 (also requires B1.e contour outputs)
```

### CA-4: Pathfinding Primitives (`SpatialGraph`) [Worker]

- **Job Story:** "I want to calculate routes with my game's traversal costs."
- **Principles Compliance:** PR-3 (Performance ROI).
- **Yield Mandate:** Mandate yielding every ≤8ms using the B3.b helper during pathfinding search.
- **Public API:**
  - `engine.setTraversalCosts(costs: Uint8Array): Promise<void>`: Main → Worker transfer, called once or on cost mutation.
  - `engine.findPath(startId: number, endId: number): Promise<Uint16Array>`: Returns sector ID sequence; rejects on unreachable with `PathNotFoundError`; rejects with `CostsRequiredError` if called before `setTraversalCosts` has resolved at least once (explicit failure beats silently pathing over costs the consumer never supplied — the engine never invents game state, P-4).
- **Signaling:** Path results are returned to the main thread via standard `postMessage`.
- **Acceptance (F-4.7):**
  - A\* over a 10,000-sector graph resolves a 500-sector path in < 2ms in the worker.
  - **Drift Assertion:** Concurrent-load drift test asserting `SimulationClock` drift remains ≤ ±2ms during heavy pathfinding.
- **Fixture:** `test/fixtures/pathfinding/grid-10k.json` — 100×100 grid graph with `traversalCosts` drawn from a fixed seed (`seed=42`), 50 randomized start/end pairs. P95 path resolution time < 2ms on reference hardware.

### CA-5: Hierarchical Aggregation [Worker]

- **Job Story:** "I want combined bounding boxes and adjacency for countries/states."
- **Principles Compliance:** PR-3 (Performance ROI).
- **Yield Mandate:** Mandate yielding every ≤8ms using the `yieldIfNeeded` helper (`src/worker/yield.ts`) during aggregation.
- **Public API (F-4.3):**
  - `engine.setParentMapping(mapping: Uint16Array, maxGroups: number): Promise<void>`.
  - `engine.aggregateGroups(): Promise<void>`.
  - `engine.getGroupBBox(groupId: number): [number, number, number, number]` (sync accessor reading from latest snapshot; throws `MappingRequiredError` before the first `aggregateGroups` resolution — see the widened trigger in §12.5).
- **Signaling:** Aggregated `groupBBoxes` are sent to the main thread via **Transferable Handoff** inside the tick loop. (F-4.2)
- **Validation Fixture (`test/fixtures/mappings/regions.json`):**
  - Schema: `{mapImage: string, definition: string, parentMapping: number[], maxGroups: number, expectedGroupBBoxes: [[minX,minY,maxX,maxY], ...]}`. `definition` is the path to a companion sector-definition JSON (same pattern as `test/fixtures/test-4x4.json`) whose key iteration order fixes the dense numeric-ID space that `parentMapping` indexes — `SectorRegistry` assigns numeric IDs in definition order, not raster order (Hardening Sync).
  - Map images live in `test/fixtures/mappings/maps/` (8-bit indexed PNGs ≤ 256×256).
  - Mandate ≥5 fixtures including: identity (1 sector → 1 group), all-to-one, disjoint-groups, sentinel sectors, single-pixel groups.
- **Acceptance:**
  - For every fixture in `test/fixtures/mappings/regions.json`, the produced `groupBBoxes` exactly match `expectedGroupBBoxes` (per-coordinate equality).
  - Sectors mapped to group ID = `0xFFFF` are excluded from any group's bounding box.
  - Empty groups produce sentinel `[INT16_MAX, INT16_MAX, INT16_MIN, INT16_MIN]`.
  - **Error Path:** Verify `aggregateGroups()` throws `MappingRequiredError` if called before `setParentMapping`.
  - **Sentinel Path:** If all sectors map to `0xFFFF`, `aggregateGroups` returns successfully with zero groups.
  - **Drift Assertion:** Concurrent-load drift test asserting `SimulationClock` drift remains ≤ ±2ms during aggregation.

### CA-8: Spatial Anchoring [Worker]

- **Job Story:** "I want guaranteed interior anchor points for labels in non-convex territories."
- **Prerequisite (F-4.5):** B1.e (data) + B3 (Worker availability) + **A0.3 (Anchor Fixtures)**.
- **Independence:** CA-8 is execution-independent of CA-6; both consume the post-B3 Worker independently.
- **Principles Compliance:** PR-3 (Performance ROI).
- **Yield Mandate:** Mandate yielding every ≤8ms using the `yieldIfNeeded` helper (`src/worker/yield.ts`) during anchor computation.
- **Public API:**
  - `engine.computeAnchors(): Promise<void>`.
  - `engine.getAnchor(sectorId: number): [number, number]` (sync accessor reading from latest snapshot).
- **Algorithm:** **Pole of Inaccessibility (polylabel)** computed from the contour segments produced by B1.e (unordered segment list — distance tests are segment-wise; no ring reconstruction is required), with default precision = 1.0px.
- **Signaling:** Computed `anchors` are returned to the main thread via **Transferable Handoff**. (F-4.6)
- **Acceptance:**
  - 100% pass on `test/fixtures/anchor-shapes.json`.
  - **Drift Assertion:** Concurrent-load drift test asserting `SimulationClock` drift remains ≤ ±2ms during anchor computation.

### CA-6: Dynamic Perimeter Rendering [Worker -> Main]

- **Job Story:** "I want thick, clean borders around country perimeters."
- **Implementation:** Use `THREE.LineSegments`. **GPU Sync (F-C.9):** On receipt of `borderEdges`, `BorderRenderer` copies data into a managed GPU-side VBO via `IThreeRenderBackend.uploadBorderEdges(buffer, count)` BEFORE the CPU buffer is bounced back to the Worker. This prevents detachment errors in the rendering pipeline.
- **Principles Compliance:** PR-3 (Performance ROI).
- **Yield Mandate:** Mandate yielding every ≤8ms using the `yieldIfNeeded` helper (`src/worker/yield.ts`) during perimeter extraction.
- **Public API:** `engine.recomputeBorders(): Promise<void>`. (Snapshot accessor: `engine.getBorderSegments(): Float32Array | null` — sync; returns the Main-side private copy populated during receipt, or `null` if `recomputeBorders` has not yet resolved.)
- **Worker Statefulness:** Worker maintains the latest `parentMapping` received via `setParentMapping`. `recomputeBorders` reads from this latest mapping.
- **Coalescing Rule:** Concurrent calls are serialized and coalesced (if 3 calls pending, only one extra computation runs after the in-flight one completes). All Promises returned by coalesced calls resolve together when the underlying computation completes. An in-flight `recomputeBorders` always completes against the mapping it started with (snapshot at start). A `setParentMapping` call invalidates any queued/coalesced `recomputeBorders` calls; they re-snapshot the new mapping when they begin executing. If the computation throws, all coalesced Promises reject with the same error. **Lifecycle Mandate:** If `loadMap()` or `dispose()` occurs in-flight, all pending/coalesced Promises MUST reject with `MapInvalidatedError`.
- **Pre-condition:** `setParentMapping` must have been awaited at least once before `recomputeBorders`. If called without prior mapping, the Promise rejects with `MappingRequiredError`. `recomputeBorders` does NOT require `aggregateGroups` to have been called.
- **Backend Integration:** Lazily construct a `BorderRenderer` on first non-empty `recomputeBorders` resolution. `BorderRenderer` owns a `THREE.LineSegments` whose geometry's position attribute is bound to a GPU-side VBO managed by `IThreeRenderBackend.uploadBorderEdges(buffer, count)` (see F-C.9). The CPU-side `BufferAttribute.array` is _never_ bound to the Transferable; updates happen via `gl.bufferSubData` inside `uploadBorderEdges` before the CPU buffer is bounced back. `MapEngine` disposes the current `BorderRenderer` (if any) and its associated GPU resources on `loadMap()` or `dispose()`.
- **Signaling (F-4.9):** Worker computes edges → transfers `borderEdges` and `borderEdgeCount` via a single `postMessage({type: 'borderEdges', edges, count}, [edges.buffer, count.buffer])`.
- **Layout:** `borderEdges` contains `[x1, y1, x2, y2]` segments.
- **Acceptance (F-4.8):**
  - Fixture-based edge count and endpoint comparison against known-good results.
  - **Error Path:** Verify `MappingRequiredError` is thrown if called before `setParentMapping`.
  - **Sentinel Path:** If all sectors map to `0xFFFF`, `recomputeBorders` returns successfully with zero edges.
  - **Dirty Flag Verification:** After `recomputeBorders()` completes, the renderer's dirty flag is `true` and exactly one `renderer.render` call occurs on the next rAF.
  - **Drift Assertion:** Concurrent-load drift test asserting `SimulationClock` drift remains ≤ ±2ms during perimeter extraction.
  - **Detachment Soak Test:** 1,000-frame perimeter-mutation soak test asserting zero `DOMException: ArrayBuffer is detached` errors.
- **Fixture:** `test/fixtures/borders/perimeter-cases.json` — authored as a Phase 4 setup task.

---

## 10. Phase 5: Future Architecture (Post-Phase 4) (F-5.1)

_Status: [scope-pending]. **Phase 5 work is gated by an explicit human review. No agent may begin Phase 5 milestones until this gate is removed from this section.**_

- **CA-10: Svelte 5 OMT Bindings (Pillar VI)**
- **CA-11: QuickJS Modding Engine (Pillar VII)**
- **CA-12: Group Palettes (Pillar IV):** Extend `registerMapMode` to support group-scope coloring via `parentMapping`.
  - **API Direction:** `registerMapMode(id, {scope: 'sector' | 'group', colors: Uint32Array})`.
  - **Implementation:** Group-scope modes resolve sector→group via `parentMapping` in the fragment shader (additional `usampler2D` for `parentMapping`, palette indexed by group ID).
- **WASM Relegation:** Move WASM-related milestones to the Icebox; focus on JS-native performance ROI (PR-3).

---

## 11. Icebox / Exclusions

### 11.1 Explicitly Cancelled Milestones (F-C.6)

- **A2 — BigInt Accumulator:** Cancelled per PR-2 (Ergonomic API). Standard float-based performance.now() retained.
- **A3 — SAB Transport:** Cancelled per PR-1 (Hobbyist Deployability). Replaced with Transferable Discipline.
- **A4 — Async Texture Swap:** Cancelled in favor of synchronous `gl.texSubImage2D` (B2).
- **B4/B5 — Multi-Writer Sync:** Cancelled following SAB removal.
- **B5.5 — State History Buffers:** Cancelled to prioritize core kernel stability.
- **B6 — Multiplayer Netcode:** Pillar V retired; engine focused on single-player GSG portfolio.
- **V18/V19/V20 — Advanced AI:** Specialized features deferred to library-space.

### 11.2 Exclusions

- **V11 — Strip Three.js:** Retain Three.js behind `IThreeRenderBackend` (B1.5).
- **V15 — `TEXTURE_2D_ARRAY`:** Deferred until mobile limits force chunking.
- **BigInt & Rollback:** Formally removed following strategic pivot.

---

## 12. Infrastructure & Asset Contracts

### 12.1 Asset Pipeline

Input maps must be 24/32-bit PNGs. The engine decodes to `sourceBuffer` via standard `CanvasRenderingContext2D.getImageData`.

### 12.2 Test Infrastructure

- **Package Manager:** npm (v10 or v11+). The project uses vanilla `npm` with a `package-lock.json`. Project will not bootstrap correctly with any manager other than `npm` due to lockfile structure.

- **Unit:** Vitest + `canvas` mock (for non-GL paths).
- **Integration:** Playwright + `headless-gl` (for non-shader integration tests).
- **Performance/Shader Verification (F-3.5):** Playwright + real Linux Chromium (with WebGL2 enabled) for all B2 palette shader and CA-x performance gates.
- **Principle Exception (PR-1):** Benchmarking infrastructure inside Playwright may use COOP/COEP headers to enable measureUserAgentSpecificMemory(); this does not affect shipped engine deployment requirements which remain header-free.
- **Reference Hardware (F-C.5):** Reference hardware = `Intel i7-12700K / NVIDIA RTX 3060 / Chrome 124`.
- **Performance Gates:**
  - Correctness gates run in CI.
  - Performance gates run nightly on a designated self-hosted GPU runner OR locally before merge with output JSON checked in.
  - CI tolerance: 5.0× for software-rendered fallback if GPU runner is unavailable.

### 12.3 Memory & Sizing Constraints

- **Sector ID:** `0xFFFF` (65535) is reserved as the 'no sector' sentinel only in arrays that semantically permit it (e.g., `parentMapping`, `pixelIndices`). `adjacencyNeighbors` does NOT use sentinels, as CSR offsets implicitly handle neighborhood emptiness; thus, neighbor ID 65535 is valid in `adjacencyNeighbors`.
- **Addressable Count:** Maximum sector count is 65,535 (IDs `0..65534`) to ensure `0xFFFF` remains a globally safe sentinel for mapping and picking.
- **Max Map Dimensions:** 4,096 × 4,096 px (Hard cap on mobile). 8,192px maps supported on desktop only via opt-in flag. Coordinate limit remains 32,767.
- **Core Size Budget (P-9):** <15KB gzipped for the core engine kernel.
- **Mobile Heap Budget (PR-1):** Hard cap at 256MB for total Transferable pool.

| Map Dimensions | `sourceBuffer` | `pixelIndices` | Auxiliary (Typical) | Total Base Heap | Headroom (256MB) |
| -------------- | -------------- | -------------- | ------------------- | --------------- | ---------------- |
| 1024 × 1024    | 4 MB           | 4 MB           | 2 MB                | 10 MB           | High             |
| 2048 × 2048    | 16 MB          | 16 MB          | 8 MB                | 40 MB           | High             |
| 4096 × 4096    | 64 MB          | 64 MB          | 64 MB               | 192 MB          | Low (64MB)       |
| 8192 × 8192    | 256 MB         | 256 MB         | 128 MB              | 640 MB          | **EXCEEDED**     |

_Note: The `sourceBuffer` MUST be disposed immediately after `pixelIndices` extraction for all map sizes to preserve heap headroom (P-9). "Auxiliary" heap includes the 32MB `pixelIndicesMirror` at 4096px and other steady-state buffers._

### 12.4 Semver Policy (F-ER.5)

The BDFL (User) is the sole authority on versioning. The project is currently in a "pre-v1.0" development state where public API stability is not guaranteed.

**Pre-1.0 Planned Breaking Changes:**

- **async `pick()` (Pass 8 Revision):** `MapEngine.pick()` signature will change from synchronous to `Promise<PickResult | null>`.
  - **Rationale:** Accommodate GPU readback latency and Web Worker IPC overhead. Required to maintain OMT (Off-Main-Thread) architecture without blocking the Main thread.

- **`registry` getter gating (Hardening Sync):** `MapEngine.registry` becomes `@deprecated` and throws `MapInvalidatedError` once the B3.a bootstrap transfer has detached the registry's buffers.
  - **Rationale (PR-2):** Post-transfer, buffer-backed registry methods would silently read zero-length detached arrays — fail loudly instead. Replacement surface: `MapEngine.getSector`/`getSectorKeys`/`getBBox`/`getCentroid`/`getNeighbors`, served from pre-transfer snapshots (B3.a retains `.slice()` copies of `bboxes`, `centroids`, `adjacencyPointers`, `adjacencyNeighbors` — ≤ ~1 MB at the 65,534-sector cap — so the shipped sync API keeps working from the moment of transfer).

### 12.5 Module Layout (F-C.4)

| Component             | Path                                |
| --------------------- | ----------------------------------- |
| `MapEngine`           | `src/MapEngine.ts`                  |
| `MapRenderer`         | `src/MapRenderer.ts`                |
| `SectorRegistry`      | `src/SectorRegistry.ts`             |
| `SectorBitmapParser`  | `src/SectorBitmapParser.ts`         |
| `InputController`     | `src/input/InputController.ts`      |
| `IThreeRenderBackend` | `src/render/IThreeRenderBackend.ts` |
| `ThreeRenderBackend`  | `src/render/ThreeRenderBackend.ts`  |
| `NullRenderBackend`   | `src/render/NullRenderBackend.ts`   |
| `BorderRenderer`      | `src/render/BorderRenderer.ts`      |
| `SharedRegistryProxy` | `src/worker/SharedRegistryProxy.ts` |
| `RenderClock`         | `src/RenderClock.ts` (Main)         |
| `SimulationClock`     | `src/worker/SimulationClock.ts`     |
| `yieldIfNeeded`       | `src/worker/yield.ts`               |
| `GameClock`           | `src/GameClock.ts` (deprecated)     |
| `SpatialGraph`        | `src/worker/SpatialGraph.ts`        |
| `Worker Entry`        | `src/worker/index.ts`               |
| `Common Types`        | `src/types.ts`                      |

**Canonical Exports (Shipped):**
| Module | Export | Signature |
| --- | --- | --- |
| `MapEngine` | `onFrame` | `onFrame(cb: (dt: number) => void): void` |
| `MapEngine` | `offFrame` | `offFrame(cb: (dt: number) => void): void` |
| `MapEngine` | `destroy` | `destroy(): void` |

**Canonical Exports (Planned):**
| Module | Export | Signature | Phase |
| --- | --- | --- | --- |
| `MapEngine` | `setTickRate` | `setTickRate(hz: number): void` | Phase 3 |
| `MapEngine` | `onMappingChanged` | `onMappingChanged(cb: () => void): () => void` | Phase 4 |

**Canonical Errors (Planned):**
| Error | Path | Rationale | Phase |
| --- | --- | --- | --- |
| `WebGL2NotSupportedError` | `src/errors.ts` | Thrown if WebGL2 is unavailable. | Phase 3 |
| `SectorLimitExceededError` | `src/errors.ts` | Thrown if map exceeds 65,534 sectors. | Phase 2 |
| `MappingRequiredError` | `src/errors.ts` | Thrown when a mapping/aggregation precondition is unmet: methods called before `setParentMapping`, or group accessors (`getGroupBBox`) before the first `aggregateGroups` resolution. | Phase 4 |
| `PathNotFoundError` | `src/errors.ts` | Thrown if pathfinding fails. | Phase 4 |
| `CostsRequiredError` | `src/errors.ts` | Thrown by `findPath` before `setTraversalCosts` has resolved at least once. | Phase 4 |
| `ModeNotReadyError` | `src/errors.ts` | Thrown if `registerMapMode`/`setMapMode` called before `loadMap()` resolves. | Phase 3 |
| `MapInvalidatedError` | `src/errors.ts` | Thrown when in-flight async calls are invalidated by `loadMap()` or `destroy()`/`dispose()`. | Phase 3 |

**Common Types:**

- `type PickResult = { hexKey: string, sectorData: SectorData, pixelX: number, pixelY: number }`
- `type MapModeId = string` (Planned, Phase 3)
- `type WorkerMessage = ...` (Planned, Phase 3)
- `type BootstrapAckPayload = ...` (Planned, Phase 3)

---

## 13. Revision History

- **2026-07-07-phase-3-close:** Documentation Sync (PR-5, Reversibility — keeping status markers truthful minimizes the cost of resuming or auditing work later). Marked Phase 3 `[COMPLETE]` in both the §5 dependency graph and the §8 prose header following the `phase-3-audit.md` `[PASS]` verdict and its merge to `main` as v0.0.5. Corrected the Phase 2 (§7) header, which still read `[DOCUMENTATION FREEZE]` after the freeze was already lifted per the traceability matrix's own closing note — a stale-status drift, not a new decision.
- **2026-07-07-hardening-sync:** Code-Truth Synchronization (pre-implementation sprint hardening). Resolved 5 BDFL rulings and 6 doc/code drift defects surfaced by the per-epic hardening pass. Synchronized §4/F-3.1/B3.c to Main-resident `hexColors`/`sectorIds` — `BOOTSTRAP_ACK` carries verification scalars only (PR-3). Replaced the `pick()` binary-search mandate with the O(1) Main-resident `idToHex` table (PR-3). Rewrote F-3.6 as Registration Atomicity — removed unreachable `pendingMapMode` buffering and the `'mapModeRegistrationFailed'` event (PR-4). Added `CostsRequiredError` for the `findPath` precondition (P-4); widened `MappingRequiredError` to aggregation preconditions; scoped `ModeNotReadyError` to pre-`loadMap` guards (PR-2). Gated the deprecated `MapEngine.registry` getter post-transfer with snapshot-backed replacement surface (§12.4, PR-2). Corrected B1.e/CA-8/§4 contour descriptions to the shipped unordered segment list and fixed the `contourPoints` sizing row (Code-Truth). Specified the `yieldIfNeeded` signature (B3.b). Corrected A0.3 tolerance wording (test constant, not a fixture field). Added the CA-5 fixture `definition` field fixing the numeric-ID space.
- **2026-05-07-pass-12:** Technical Hardening. Removed all specific git commit SHAs from the document to improve robustness and prevent agent confusion. Codified the "No Commit SHAs in Roadmap" standard in `GEMINI.md`.
- **2026-05-07-pass-11:** Technical Hardening. Resolved 100% of Pass 10 findings. Synchronized Memory Contract (§4) with Pass 8.1 mandates (`pixelIndicesMirror`, `hexColors`, `sectorIds`). Hardened milestones with mandatory "Principles Compliance" fields (B1.5, B3.a-c). Relocated future errors and types to "Planned" status in §12.5. Corrected visibility of `_preRenderHook` to Public.
- **2026-05-07-pass-10:** Phase 0 Audit. Identified missing Phase 0 prerequisites (scripts, benchmarks, fixtures). Detected hallucinations in Canonical Exports and Memory Contract. Marked §6 prerequisites as "Pending Implementation".
- **2026-05-04-pass-9:** Consistency Pass. Standardized on Vitest as test runner. Reverted `pick()` and `PickResult` to match event-driven Code-Truth. Normalized fixture paths to `test/`. Corrected `destroy()` and `onFrame` signatures. Removed premature verification claims for CA-9.
- **2026-05-04-pass-8.1:** Consistency Patch (Resolving Residuals). Resolved 100% of residual and new defects identified in Pass 8 audit. Mandated `pixelIndicesMirror` (Uint16) and `webglcontextrestored` listener for WebGL context loss recovery (F-3.3, F-4.10). Standardized `_postRenderHook` as a `MapRenderer` property (F-C.11) and removed it from the stateless `IThreeRenderBackend` interface (B1.5). Defined `MapInvalidatedError` and mandated strict async rejection on `loadMap`/`dispose` (B3.c, CA-6). Formally specified `yieldIfNeeded` signature and `MessageChannel` implementation (B3.b). Unified all hot-path pool sizes to 4 buffers (§4). Standardized audit filenames to `phase-<N>-audit.md` (§3) and added `bin/check-roadmap-consistency.sh` to Phase 0. Re-affirmed documentation freeze for Phases 1 & 2.
- **2026-05-04-pass-8:** Architectural Hardening & Process Simplification. Resolved 100% of reviewer feedback including 1 BLOCKER and 6 MAJOR findings. Transitioned `pick()` to async signature (F-ER.1) to avoid GPU stalls. Replaced `hexMap` structured-clone with binary-searchable Transferable arrays (F-3.1) to preserve mobile heap budget. Implemented ring-buffered pointer-swap pool (size=4) and `_postRenderHook` (F-C.8, F-C.9) to prevent Three.js detachment errors. Mandated cooperative yielding helper (B3.b) and drift assertions in Phase 4. Formalized Phase 0 Exit Gate and simplified audit protocol to single-file iteration (§3). Declared documentation freeze for Phases 1 & 2.
- **2026-05-03-pass-7:** Technical Alignment Pass. Resolved 100% of reviewer feedback (5 BLOCKERs, 11 MAJORs, 6 MINORs). Unified `borderEdges` sizing across §4 and CA-6 (Blocker 2). Reordered Phase 2 to resolve B1.c/B1.e dependency paradox (Blocker 1). Aligned `SharedRegistryProxy` with Main-thread palette design (Blocker 4). Hardened CA-6 Backend Integration with GPU Sync mandate (Blocker 3, Major 12). Restored `onFrame` unsubscription and `PickResult | null` (Blocker 5, Major 11). Documented `RenderClock` and `SimulationClock` in module layout (Major 10).
- **2026-05-01-pass-6:** Final Technical Hardening. Resolved 100% of reviewer feedback (3 BLOCKERs, 8 MAJORs, 6 MINORs). Hardened `setMapMode` state machine with Last-Write-Wins buffering (Blocker 2). Carved out PR-1 exception for benchmarking infrastructure (Blocker 3). Completed global finding-code renumbering to phase-based convention (Major 4). Unified `MappingRequiredError` across CA-5/CA-6 (Major 5). Defined `BorderRenderer` lifecycle and `MapEngine.dispose()` (Major 7).
- **2026-05-01-pass-5:** Technical Hardening & Consistency. Resolved 100% of reviewer feedback (5 BLOCKERs, 10 MAJORs, 8 MINORs). Restored B3.a transfer list (Blocker 1). Hardened sync/async map mode boundaries (Blocker 3). Updated Phase 2 baseline to browser-fidelity measurement (Blocker 4). Completed global finding-code rename to `F-` prefix (Blocker 5). Specified CA-6 pre-conditions and Worker coalescing (Blocker 2, Major 14). Restored CA-8 fixture shapes (Minor 23) and added CA-12 API sketch (Minor 18).
- **2026-05-01-pass-4:** Technical Synchronization. Resolved 100% of reviewer feedback including 6 BLOCKERs and 17 MAJORs. Synchronized memory allocation timing to `loadMap()` for all hot-path buffers (Blocker 1). Hardened sync/async API split for Worker relocation (Blocker 2, 3). Fixed Transferable ownership contradictions (Blocker 4). Formalized Phase Exit Gate signal-and-halt orchestration (Blocker 5). Decoupled CA-5 and CA-6 (PR-4, PR-5). Tightened mobile heap cap to 4096px (PR-1).
- **2026-05-01-pass-3:** Final Hardening. Resolved 100% of reviewer feedback including 6 BLOCKERs and 18 MAJORs. Split B3 into B3.a-c (F-3.1). Formalized sync/async API boundary for Worker relocation (PR-2, PR-5). Specified Pole of Inaccessibility for CA-8 and automated triggers for CA-6. Hardened A1.5/B1.5 acceptance criteria. Established mobile heap budget table and sentinel IDs (§12.3). Updated infrastructure for nightly perf gates.
- **2026-05-01-pass-2:** Resolved review findings F-2.1 through F-2.8. Pinned baseline capture as Phase 2 entrance gate (PR-3). Renamed `IRenderBackend` → `IThreeRenderBackend` for honesty (PR-5). Strengthened B1.5 acceptance. Split CA-7 from B2 (PR-2, PR-5). Added Section 4 column split for ownership lifecycle.
- **2026-05-01-pass-1:** Master Audit Revision. Resolved 26 of 26 synthesis findings from `ROADMAP_REVIEW.md`. Strategic pivot to "Hobbyist GSG Portfolio" finalized. Removed SharedArrayBuffer, BigInt, and Rollback netcode. Implemented Transferable Discipline and Principle Enforcement Mechanisms.
- **2026-04-30:** Post-audit hardening. Resolved 100% of audit findings. Split B1.a-e, fixed A2 determinism, corrected CA-6 signaling, established Phase Exit Gates, and defined Section 11 infrastructure. Deferring WASM/Svelte/QJS to Phase 6. Established `ROADMAP_TRACEABILITY_MATRIX.md` traceability matrix.
- **2026-04-29:** Post-audit revision. Published §2.1 Normative Memory Contract to resolve `borderEdges` and SAB layout contradictions. Inserted B5.5 (State History Buffers) to unblock Phase 5. Re-sequenced A3 after B1. Defined Worker proxy architecture (B3) and cross-thread signaling (A1, CA-6). Hardened acceptance gates with verifiable benchmarks and spies. Standardized CA-5/CA-8 input/output contracts.
- **2026-04-29:** Major structural audit and revision. Promoted B1.5 (V10), re-sequenced Phase 3 (B4/B5 -> B3), added concrete acceptance criteria for all milestones, and resolved undefined V-codes (V13, V5). Tagged Phase 4 milestones with thread context. Defined SAB transport for CA-6. Marked A4 as STOPGAP.
- **2026-04-28:** Initial Roadmap unification and creation. Consolidated all research and planning material into the singular, canonical roadmap.
