# map-engine: Technical & Product Roadmap

> **Document type:** Canonical Project Roadmap
> **Status:** Living document. Version-agnostic.
>
> This document is the single, unified authority for the `map-engine` project. It synthesizes the product vision (Capability Areas CA-1 to CA-9) with the architectural mandates (Pillars I-VII) and the dependency-ordered execution plan (Phases A/B). It contains the maximum fidelity context required for both strategic planning and implementation.

---

## 1. Vision & Core Engineering Mandates

`map-engine` is a **minimal, browser-native Grand Strategy Game (GSG) spatial runtime** built on WebGL (Three.js) and typed ESM. It provides the Pareto-optimal set of spatial and temporal primitives that every GSG requires — sector identity, spatial topology, visual synchronization, and traversal — without ever owning game state, simulation logic, or UI.

To achieve the performance required for massive 10,000+ province maps running at 60fps with deterministic multiplayer, the engine adheres to seven **Core Engineering Mandates (The Pillars)**:

### I. Temporal Serialization & Determinism

Enforce a perfectly deterministic, discrete-state automaton. The simulation must be completely decoupled from the rendering frame rate using a fixed-step temporal accumulator. Forbid IEEE 754 floating-point arithmetic for state-critical math; use BigInt microsecond fixed-point mathematics.

### II. State Management & Concurrency

Utilize heavily normalized SoA (Structure of Arrays) layout backed by contiguous memory arrays to maximize CPU cache coherency. Implement a strict Two-Phase (Read-Lock / Write-Lock) concurrency model.

### III. Memory Architecture & JS/WASM Boundary

Bypass the V8 4GB memory cage and GC by allocating game state inside WASM linear memory. Mandate a zero-copy memory bridge using `SharedArrayBuffer` (SAB). Use Wait-Free Ring Buffers for bitwise-packed binary intent serialization.

### IV. Rendering & Map Architecture

The map is an immutable "RGB Index-Map" spatial database. GPU-as-translator via fragment LUTs (palette shaders). Resolve PCIe upload bottlenecks via `gl.texSubImage2D` and PBOs. Use `TEXTURE_2D_ARRAY` for mobile compatibility.

### V. Multiplayer & Networking

Prioritize WebRTC DataChannels (unreliable/unordered UDP) to avoid Head-of-Line blocking. Synchronize clients via deterministic lockstep and rollback netcode.

### VI. User Interface (OMT Svelte 5)

Run the simulation kernel strictly inside a Web Worker. Adopt an Off-Main-Thread (OMT) architecture. Use Svelte 5 for Virtual-DOM-free surgical reactivity.

### VII. AI & Modding Script Boundary

Polynomial Utility Scoring for AI; modulo-based temporal scheduling. Embed QuickJS for modding, compiling modifiers into RPN integer opcodes for deterministic evaluation in WASM.

---

## 2. Architectural Principles

These are non-negotiable constraints. Every capability must be compatible with all of them:

| #       | Principle                                                                                     | Rationale                                       |
| ------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **P-1** | `SectorRegistry` has zero Three.js imports.                                                   | It must be Worker-safe.                         |
| **P-2** | `SectorBitmapParser` and `SectorRegistry` have zero DOM dependencies.                         | Worker-safe contract.                           |
| **P-3** | `MapRenderer` and `MapEngine` are main-thread only.                                           | They touch WebGL and the DOM.                   |
| **P-4** | The engine never owns game state.                                                             | It synchronizes visuals; it does not simulate.  |
| **P-5** | New spatial data structures in `SectorRegistry` are computed during the existing O(W×H) pass. | A second full-bitmap scan is never acceptable.  |
| **P-6** | The public API surface grows conservatively.                                                  | Every export is a maintenance contract.         |
| **P-7** | `three` is always an external peer dependency.                                                | Size budget: <15 KB gzipped.                    |
| **P-8** | New modules are composable, not invasive.                                                     | Prefer wrapping over mutating existing classes. |

---

## 2.1 Normative Memory Contract (SAB-Backed)

To prevent cross-phase data-type contradictions, all milestones MUST adhere to this normative table for SharedArrayBuffer-backed memory.

| Identifier           | TypedArray     | Phase | Owner  | Consumers     | Lifecycle / Sizing Pattern                        |
| -------------------- | -------------- | ----- | ------ | ------------- | ------------------------------------------------- |
| `sourceBuffer`       | `Uint8Array`   | A3    | Main   | Worker        | Fixed: `width * height * 4`                       |
| `pixelIndices`       | `Uint32Array`  | B1.a  | Worker | Main (B2)     | Fixed: `width * height` (Flat index map)          |
| `bboxes`             | `Int16Array`   | B1.a  | Worker | Main, Worker  | Fixed: `sectorCount * 4` [minX, minY, maxX, maxY] |
| `centroids`          | `Int16Array`   | B1.a  | Worker | Main, Worker  | Fixed: `sectorCount * 2` [x, y]                   |
| `adjacencyPointers`  | `Uint32Array`  | B1.b  | Worker | Worker        | Fixed: `sectorCount + 1` (CSR Row Pointers)       |
| `adjacencyNeighbors` | `Uint16Array`  | B1.b  | Worker | Worker        | Fixed: `totalEdges` (CSR Column Indices)          |
| `contourPointers`    | `Uint32Array`  | B1.e  | Worker | Worker        | Fixed: `sectorCount + 1` (CSR Row Pointers)       |
| `contourPoints`      | `Int16Array`   | B1.e  | Worker | Worker        | Fixed: `totalPoints * 2` [x, y]                   |
| `borderEdges`        | `Float32Array` | B1.c  | Worker | Main (Render) | Over-allocated + `setDrawRange()` semantic        |
| `stateHistory`       | `Uint8Array`   | B5.5  | Worker | Worker        | Fixed: Ring Buffer (Circular snapshot storage)    |
| `anchors`            | `Int16Array`   | CA-8  | Worker | Main, Worker  | Fixed: `sectorCount * 2` [x, y]                   |

---

## 3. The Unified Dependency Graph

This graph maps the chronological flow of work. Refactors (A/B) unblock Capabilities (CA).

```text
[Already Shipped: CA-1 Frame Hook, CA-2 Adjacency, CA-9 Game Clock (v1)]
[Partially Shipped: CA-3 Input Pipeline (Features live; structural unification PENDING)]

                    ┌─────────────────────────────────────────┐
    Phase 1         │ A1: Render Gating  | A2: BigInt Clock   │
   (Momentum)       │ A4: texSubImage2D  | A1.5: CA-3 Unify   │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
    Phase 2         │ B1.a-e: SectorRegistry Flattening       │
  (Structural)      │ (SoA, CSR, Borders, ISpatial, Contour)  │
                    │ B1.5: IRenderBackend Contract           │
                    │ A3: SAB Backing                         │
                    └─────────┬───────────────────┬───────────┘
                              │                   │
                    ┌─────────▼────────┐  ┌───────▼───────────┐
    Phase 3         │ B2 / V7 (CA-7):  │  │ B4: Ring Buffers  │
    (Kernel)        │ GPU Map Modes    │  │ B5: 2-Phase Locks │
                    │ (Palette Shader) │  │ B5.5: History     │
                    └──────────────────┘          ▼
                                          ┌───────────────────┐
                                          │ B3: Worker        │
                                          │ Relocation        │
                                          └───────┬───────────┘
                                                  │
                    ┌─────────────────────────────▼───────────┐
    Phase 4         │ CA-4: Pathfinding Primitives            │
  (GSG Logic)       │ CA-5: Hierarchical Aggregation          │
                    │ CA-6: Dynamic Perimeter Rendering       │
                    │ CA-8: Spatial Anchoring                 │
                    └─────────────────────────────┬───────────┘
                                                  │
                    ┌─────────────────────────────▼───────────┐
    Phase 5         │ B6.0: Signaling  | B6: Rollback Netcode │
  (Resilience)      └─────────────────────────────┬───────────┘
                                                  │
                    ┌─────────────────────────────▼───────────┐
    Phase 6         │ B7: WASM   | CA-10: Svelte | CA-11: QJS │
   (Future)         └─────────────────────────────────────────┘
```

---

## 4. Phase 1: Momentum Extraction (Immediate)

_Goal: Eliminate obvious waste and harden determinism without breaking APIs._

**Phase Exit Gate:** Phase 1 complete when `A1`, `A1.5`, `A2`, `A4` acceptance suites are green in CI.

### A1 (V1) Render Gating

- **Problem:** `MapRenderer` currently performs an unconditional `renderer.render()` in every rAF frame, wasting ~95% of GPU submits when the scene is static.
- **Solution:** Add a boolean dirty flag to `MapRenderer`. Set to `true` when `_flushPendingDirty` flushes work, when immediate colors are set, on pan/zoom events, or on canvas resize.
- **Requirement:** The flag must be checked AFTER `_preRenderHook()` returns. Initial frame must render unconditionally (default `true`). **The flag MUST be reset to `false` at the end of the `render()` block.**
- **Acceptance:** GPU submit rate drops to mutation-driven cadence; first frame renders unconditionally. **Verifiable via Jest spy asserting `renderer.render` call count is zero on no-op ticks (after initial frame).**

### A1.5 (V21) CA-3 Structural Unification

- **Problem:** Input handling features (pan, zoom, pick) are live but implemented as fragmented logic across `MapEngine` and `MapRenderer`.
- **Solution:** Consolidate input state and listeners into a unified `InputController`.
- **API Surface:**
  - `onPan(delta: Vector2)`: Triggers A1 dirty flag.
  - `onZoom(zoom: number, point: Vector2)`: Triggers A1 dirty flag.
  - `onPick(point: Vector2) -> PickResult`.
- **Acceptance:** `MapRenderer` and `MapEngine` are decoupled from raw pointer events. **Verifiable via ESLint rule `no-input-listeners-outside-controller` and `git grep` asserting zero `addEventListener('pointer...')` outside `InputController.ts`.**

### A2 (V2) BigInt Clock (Upgrades CA-9)

- **Problem:** `GameClock` uses IEEE-754 floats for its accumulator, leading to cross-platform determinism drift.
- **Solution:** Change `GameClock` to accept a fixed `stepMicros: bigint`. Move the float-to-BigInt conversion into a separate `RealtimeAccumulator` helper outside the core kernel. The kernel must strictly use BigInt microsecond values for its internal accumulator.
- **Acceptance:** Replay tests produce bitwise-identical state hashes across Node and browser.
- **Critical Gotcha:** `GameClock.test.ts` internal assertions (AC 2.1b, 2.2, 2.5, 2.9) must be updated.

### A4 (V6) texSubImage2D Dirty-Rect Uploads

- **Mandate:** Mandatory performance bridge until B2 (Palette Shader) is live.
- **Problem:** `texture.needsUpdate = true` forces a full `gl.texImage2D` re-upload of the map (tens of MB) even for a single pixel change.
- **Solution:** Use native GL handles (`renderer.properties.get(this._texture).__webglTexture`) to perform `gl.texSubImage2D` on exact dirty rectangles.
- **Three.js Pin Lifecycle:** Pinned at `0.160.0` specifically in `package.json` to safely access internal GL properties. **Unpin `three` in the same PR that retires A4 (B2). Do not bump in the interim.**
- **Technical Fidelity (Y-Axis Gotcha):** Three.js uses `flipY = true`. The `yoffset` for `texSubImage2D` must be `height - bbox.maxY - 1`. Data rows must be provided in bottom-to-top canvas order. Recommended: wrap sub-rect in `ImageData` and set `UNPACK_FLIP_Y_WEBGL = 1`.
- **Requirements:** Must use `UNPACK_ROW_LENGTH` (WebGL2-only).
- **Acceptance:** Per-color-change GPU transfer size drops to O(dirty_area). `_texture.version` assertions in tests (e.g., `FrameHook.test.ts AC 1.3`) must be updated as `needsUpdate` is bypassed.

---

## 5. Phase 2: The Structural Pivot (Critical Path)

_Goal: Rip out the V8-idiomatic object graph and replace it with a high-performance Data Engine._

**Phase Exit Gate:** Phase 2 complete when `B1.a-e`, `B1.5`, `A3` acceptance suites green ∧ `ISpatialRegistry` contract fully implemented.

### B1.a-e SectorRegistry Flattening (Upgrades CA-2)

- **Problem:** `Map<string, ...>` layout causes high GC pressure and cache misses, and is incompatible with WASM/SAB.
- **Milestones:**
  - **B1.a (Dense SoA):** Assign dense 0..N-1 integer IDs. Convert `bboxes`, `centroids`, and `pixelIndices` into SoA TypedArrays.
  - **B1.b (CSR Adjacency):** Implement adjacency using `adjacencyPointers: Uint32Array` (indices into neighbors) and `adjacencyNeighbors: Uint16Array` (neighbor IDs).
  - **B1.c (Lazy Borders):** Allocate `borderEdges: Float32Array`. **Sizing:** `maxInterGroupEdges * 4 * Float32Array.BYTES_PER_ELEMENT` (worst-case inter-group boundaries). B1 only allocates; CA-6 owns computation.
  - **B1.d (ISpatialRegistry):** Define shared contract for `SectorRegistry` and hierarchical proxies. Lock `packRgb` definition to `(r<<16)|(g<<8)|b`.
  - **B1.e (CA-8a Contour Extraction):** Extract ordered polygon rings during the existing O(W×H) pass. Produce `contourPointers: Uint32Array` and `contourPoints: Int16Array` SAB arrays.
- **Zero API Break Boundary:** The public `MapEngine` surface (`loadMap`, `getNeighbors`, `PickResult`) must remain hex-string based via an internal lookup table.
- **Acceptance:** Baseline fixture `fixtures/maps/large.png` results in >80% reduction in constructor heap allocation vs current version.

### B1.5 (V10) IRenderBackend Contract

- **Problem:** `MapRenderer` is tightly coupled to Three.js.
- **Solution:** Extract an `IRenderBackend` interface that abstracts texture uploads, uniform updates, and draw calls.
- **Normative Interface:**
  ```ts
  interface IRenderBackend {
    uploadTexture(tex: Texture): void
    updateUniforms(uniforms: Record<string, any>): void
    render(scene: Scene, camera: Camera): void
    dispose(): void
    // A4 Escape Hatch
    getInternalGLTexture(tex: Texture): WebGLTexture | null
  }
  ```
- **Acceptance:** `MapRenderer` can be instantiated with a `NullRenderBackend` for unit testing.

### A3 (V4) SAB Backing

- **Problem:** V8's GC and memory cage limit scalability and block zero-copy Worker transfer.
- **Solution:** Allocate `sourceBuffer` and all B1 SoA arrays over `SharedArrayBuffer` (see §2.1 Table).
- **Constraint:** COOP/COEP headers are a hard prerequisite.
- **Acceptance:** `crossOriginIsolated === true` in the browser.

---

## 6. Phase 3: The Concurrent Kernel

_Goal: Move the brain into a Worker and the eyes onto the GPU._

**Phase Exit Gate:** Phase 3 complete when `B2`, `B4`, `B5`, `B5.5`, `B3` pass multi-threaded integrity tests in CI.

### B2 (V7) Palette Shaders (Implements CA-7)

- **Job Story:** "I want map modes to re-color instantly at 60fps."
- **Solution:** Replace CPU pixel iteration with a fragment LUT.
- **CA-7 API Sketch:** `registerMapMode(id: string, colors: Uint32Array)`, `setMapMode(id: string)`.
- **Acceptance:** Full map re-color completes in < 1ms on reference hardware. **Verifiable via `EXT_disjoint_timer_query_webgl2` measurement.**

### B4 (V9) Wait-Free Ring Buffers

- **Solution:** Establish a bit-packed binary intent pipeline (SPSC topology).
- **Wire Format:** `[8-bit Opcode | 16-bit SectorID | 32-bit Payload]`.
- **Acceptance:** Zero-copy transfer of 10,000 intents/sec with < 0.1ms main-thread overhead. **Verifiable via `ConcurrencyTest.worker.ts` harness asserting integrity under randomized R/W.**

### B5 (V16) Two-Phase R/W Lock

- **Requirement:** Enforce Pillar II: Sequence-Lock for 1W/1R topology.
- **Upgrade Trigger:** Explicitly upgrade from sequence-lock to RWLock when a second concurrent reader is introduced (currently anticipated when CA-10 Svelte bindings consume the registry proxy).
- **Acceptance:** Multi-worker contention harness asserts zero torn-reads via checksum. **Benchmark assertion: <1ms for 10k pushes.**

### B5.5 (V16.5) State History Buffers [Critical Path -> B6]

- **Goal:** Provide snapshots for rollback netcode.
- **Implementation:** Fixed-size ring buffers over SoA SAB arrays with O(1) `snapshot(tick)` and `rewind(tick)` operations.
- **Acceptance:** Pass a deterministic-replay test over ≥120 ticks.

### B3 (V8) Worker Relocation

- **Problem:** Main-thread jank perturbs simulation tick timing.
- **Bootstrap Protocol:** `INIT_SAB` (Main -> Worker) / `INIT_ACK` (Worker -> Main).
- **Proxy Architecture:** Implement a `SharedRegistryProxy` that synchronously reads SAB-backed arrays maintained by the worker.
- **Acceptance:** `GameClock.tick()` runs at steady 60Hz even when the main thread is blocked for 100ms.

---

## 7. Phase 4: GSG Feature Delivery

_Goal: Deliver the actual GSG features built upon the ultra-fast flat memory kernel._

**Phase Exit Gate:** Phase 4 complete when all CAs pass functional tests over graph fixtures in CI.

**Dependency Graph:** `B5.5 || CA-4 || CA-5 -> CA-6; B1.e(CA-8a) -> CA-8`.

### CA-4: Pathfinding Primitives (`SpatialGraph`) [Worker]

- **Job Story:** "I want to calculate routes with my game's traversal costs."
- **Acceptance:** A\* over a 10,000-sector graph resolves a 500-sector path in < 2ms in the worker.

### CA-5: Hierarchical Aggregation [Worker]

- **Job Story:** "I want combined bounding boxes and adjacency for countries/states."
- **Input Contract:** Accepts `parentMapping: Uint16Array` (maps sector ID to parent group ID). This array is strictly supplied by the engine consumer at construction time; the engine neither loads nor persists it.
- **Acceptance:** Aggregated bounding boxes correctly encompass all child sector bounding boxes.

### CA-6: Dynamic Perimeter Rendering [Main Thread]

- **Job Story:** "I want thick, clean borders around country perimeters."
- **Implementation:** Use `THREE.LineSegments`.
- **Signaling:** Main thread polls SAB counter via `Atomics.load` inside `requestAnimationFrame`. Flip `_isDirty` on mutation.
- **Layout:** `borderEdges` contains `[x1, y1, x2, y2]` segments.
- **Acceptance:** Fixture-based edge count and endpoint comparison against known-good results for 100% of cases.

### CA-8: Spatial Anchoring [Worker]

- **Job Story:** "I want guaranteed interior anchor points for labels in non-convex territories."
- **Prerequisite:** B1.e (Contour Extraction / Polygon Rings).
- **Acceptance:** 100% pass on `tests/fixtures/anchor-shapes.json` containing ≥20 fixtures including C-shapes, annulus, spiral, and off-centroid polygons.

---

## 8. Phase 5: Multiplayer Resilience

**Phase Exit Gate:** Phase 5 complete when `B6` passes 1000-tick drift test in CI.

### B6.0 Signaling Harness

- **Solution:** Implement an in-process loopback signaling shim in `tests/harness/` for B6 verification.

### B6 (V17) Rollback Netcode [Worker]

- **Acceptance:** Zero state drift between two clients over 1,000 simulated ticks with 200ms latency simulation.

---

## 9. Phase 6: Future Architecture (Post-Phase 5)

_Status: [scope-pending]. Must complete pre-execution review before activation._

- **B7 (V17.5): WASM Memory Migration (Pillar III)**
- **CA-10: Svelte 5 OMT Bindings (Pillar VI)**
- **CA-11: QuickJS Modding Engine (Pillar VII)**

---

## 10. Icebox / Exclusions

- **V11 — Strip Three.js:** Retain Three.js behind `IRenderBackend` (B1.5).
- **V15 — `TEXTURE_2D_ARRAY`:** Deferred until mobile limits force chunking.
- **V18/V19/V20 — AI:** Specialized far-future features.

---

## 11. Infrastructure & Asset Contracts

### 11.1 Asset Pipeline

Input maps must be 24/32-bit PNGs. The engine decodes to `sourceBuffer` via standard `CanvasRenderingContext2D.getImageData`.

### 11.2 Production Cross-Origin Isolation

Requires COOP: `same-origin` and COEP: `require-corp`. Use `CrossOriginIsolationRequiredError` runtime guard to notify consumers if headers are missing.

### 11.3 Test Infrastructure

- **Unit:** Vitest + `canvas` mock (for non-GL paths).
- **Integration:** Playwright + `headless-gl` (for GL/Worker/Cross-thread verification).
- **Harness:** Signaling loopback for multiplayer B6 testing.

### 11.4 Memory & Sizing Constraints

- **Max Sector ID:** 65,535 (Uint16).
- **Max Map Dimensions:** 32,767px (Int16).
- **Core Size Budget (P-7):** <15KB gzipped for the core engine kernel.
- **Mobile Guard:** Reject SAB allocation if total engine memory exceeds 256MB.

### 11.5 Semver Policy

Project follows `0.x.y` where `x` maps to Phase completions and `y` maps to specific milestones. Public API stability is not guaranteed until `1.0.0`.

---

## 12. Revision History

- **2026-04-30:** Post-audit hardening. Resolved 100% of audit findings. Split B1.a-e, fixed A2 determinism, corrected CA-6 signaling, established Phase Exit Gates, and defined Section 11 infrastructure. Deferring WASM/Svelte/QJS to Phase 6. Established `ROADMAP_TRACEABILITY_MATRIX.md` traceability matrix.
- **2026-04-29:** Post-audit revision. Published §2.1 Normative Memory Contract to resolve `borderEdges` and SAB layout contradictions. Inserted B5.5 (State History Buffers) to unblock Phase 5. Re-sequenced A3 after B1. Defined Worker proxy architecture (B3) and cross-thread signaling (A1, CA-6). Hardened acceptance gates with verifiable benchmarks and spies. Standardized CA-5/CA-8 input/output contracts.
- **2026-04-29:** Major structural audit and revision. Promoted B1.5 (V10), re-sequenced Phase 3 (B4/B5 -> B3), added concrete acceptance criteria for all milestones, and resolved undefined V-codes (V13, V5). Tagged Phase 4 milestones with thread context. Defined SAB transport for CA-6. Marked A4 as STOPGAP.
- **2026-04-28:** Initial Roadmap unification and creation. Consolidated all research and planning material into the singular, canonical roadmap.
