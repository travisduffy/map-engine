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

## 3. The Unified Dependency Graph

This graph maps the chronological flow of work. Refactors (A/B) unblock Capabilities (CA).

```text
[Already Shipped: CA-1 Frame Hook, CA-2 Adjacency, CA-9 Game Clock (v1)]
[Partially Shipped: CA-3 Input Pipeline (Features live; structural unification PENDING)]

                    ┌─────────────────────────────────────────┐
    Phase 1         │ A1: Render Gating  | A2: BigInt Clock   │
   (Momentum)       │ A3: SAB Backing    | A4: texSubImage2D  │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
    Phase 2         │ B1 / V3: SectorRegistry Flattening      │
  (Structural)      │ (SoA arrays, CSR layout, Integer IDs)   │
                    └─────────┬───────────────────┬───────────┘
                              │                   │
                    ┌─────────▼────────┐  ┌───────▼───────────┐
    Phase 3         │ B2 / V7 (CA-7):  │  │ B3 / V8: Worker   │
    (Kernel)        │ GPU Map Modes    │  │ Relocation        │
                    │ (Palette Shader) │  └───────┬───────────┘
                    └──────────────────┘          ▼
                                          ┌───────────────────┐
                                          │ B4: Ring Buffers  │
                                          │ B5: 2-Phase Locks │
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
    Phase 5         │ B6 / V17: Multiplayer Rollback Netcode  │
  (Resilience)      │ (WebRTC DataChannels, Lockstep)         │
                    └─────────────────────────────────────────┘
```

---

## 4. Phase 1: Momentum Extraction (Immediate)

_Goal: Eliminate obvious waste and harden determinism without breaking APIs._

### A1 (V1) Render Gating

- **Problem:** `MapRenderer` currently performs an unconditional `renderer.render()` in every rAF frame, wasting ~95% of GPU submits when the scene is static.
- **Solution:** Add a boolean dirty flag to `MapRenderer`. Set to `true` when `_flushPendingDirty` flushes work, when immediate colors are set, on pan/zoom events, or on canvas resize.
- **Requirement:** The flag must be checked AFTER `_preRenderHook()` returns. Initial frame must render unconditionally (default `true`).
- **Acceptance:** GPU submit rate drops to mutation-driven cadence; first frame renders unconditionally.

### A2 (V2) BigInt Clock (Upgrades CA-9)

- **Problem:** `GameClock` uses IEEE-754 floats for its accumulator, leading to cross-platform determinism drift.
- **Solution:** Replace `_accumulator` and `_intervalSeconds` with BigInt microsecond values. Use `BigInt(Math.round(dt * this._speed * 1e6))` for accumulation.
- **Acceptance:** Replay tests produce bitwise-identical `elapsed` values across Node and browser.
- **Critical Gotcha:** `GameClock.test.ts` internal assertions (AC 2.1b, 2.2, 2.5, 2.9) must be updated to expect BigInts. Specifically, six assertions across five tests accessing `clock['_accumulator']` or `testClock['_accumulator']` will break.

### A3 (V4) SAB Backing

- **Problem:** V8's GC and memory cage limit scalability and block zero-copy Worker transfer.
- **Solution:** Allocate `sourceBuffer` and `displayImageData.data` over `SharedArrayBuffer`.
- **Constraint:** COOP/COEP headers are a hard prerequisite. Audit hosting environment before merging.

### A4 (V6) texSubImage2D Dirty-Rect Uploads

- **Problem:** `texture.needsUpdate = true` forces a full `gl.texImage2D` re-upload of the map (tens of MB) even for a single pixel change.
- **Solution:** Use native GL handles (`renderer.properties.get(this._texture).__webglTexture`) to perform `gl.texSubImage2D` on exact dirty rectangles.
- **Technical Fidelity (Y-Axis Gotcha):** Three.js uses `flipY = true`. The `yoffset` for `texSubImage2D` must be `height - bbox.maxY - 1`. Data rows must be provided in bottom-to-top canvas order to match the initial upload. Recommended: wrap sub-rect in `ImageData` and set `UNPACK_FLIP_Y_WEBGL = 1`.
- **Requirements:** Must use `UNPACK_ROW_LENGTH` (WebGL2-only). Pin Three.js version as `__webglTexture` is an internal API.
- **Acceptance:** Per-color-change GPU transfer size drops to O(dirty_area). `_texture.version` assertions in tests (e.g., `FrameHook.test.ts AC 1.3`) must be updated as `needsUpdate` is bypassed.

---

## 5. Phase 2: The Structural Pivot (Critical Path)

_Goal: Rip out the V8-idiomatic object graph and replace it with a high-performance Data Engine._

### B1 (V3) SectorRegistry Flattening (Upgrades CA-2)

- **Problem:** `Map<string, ...>` layout causes high GC pressure and cache misses, and is incompatible with WASM/SAB.
- **Solution:**
  - Assign dense 0..N-1 integer IDs.
  - Convert `bboxes`, `centroids`, `pixelIndices`, and `adjacency` into SoA TypedArrays/CSR formats.
  - Implement V13 (CSR adjacency) and V5 (Lazy `borderEdges` over packed `Int16Array`).
- **Zero API Break Boundary:** The public `MapEngine` surface (`loadMap`, `getNeighbors`, `PickResult`) must remain hex-string based via an internal lookup table.
- **Acceptance:** Constructor allocation profile drops >80% on large maps. Hot O(W×H) scan uses `packRgb` instead of `toHexKey`.

---

## 6. Phase 3: The Concurrent Kernel

_Goal: Move the brain into a Worker and the eyes onto the GPU._

### B2 (V7) Palette Shaders (Implements CA-7)

- **Job Story:** "I want map modes to re-color instantly at 60fps."
- **Solution:** Replace CPU pixel iteration with a fragment LUT. Upload a single static index map; swap map modes by uploading a tiny 1D palette texture.
- **Prerequisite:** V10 (`IRenderBackend` abstraction) to allow backend swapping.

### B3 (V8) Worker Relocation

- **Problem:** Main-thread jank (layout/paint) perturbs simulation tick timing.
- **Solution:** Move `GameClock` and simulation state to a Web Worker. UI reads state via SAB.
- **Prerequisite:** Decouple `GameClock` from `engine.onFrame` (B3 step 1).

### B4 (V9) Wait-Free Ring Buffers

- **Solution:** Establish a bit-packed binary intent pipeline (Opcode | SectorID | Payload) for UI-to-Engine interaction.

### B5 (V16) Two-Phase R/W Lock

- **Requirement:** Enforce Pillar II: Read-Lock (parallel evaluation) / Write-Lock (sequential commit).

---

## 7. Phase 4: GSG Feature Delivery

_Goal: Deliver the actual GSG features built upon the ultra-fast flat memory kernel._

### CA-4: Pathfinding Primitives (`SpatialGraph`)

- **Job Story:** "I want to calculate routes with my game's traversal costs."
- **API Sketch:** `new SpatialGraph(adjacency, centroids?)`, `findPath(from, to, cost, heuristic?)`.

### CA-5: Hierarchical Aggregation

- **Job Story:** "I want combined bounding boxes and adjacency for countries/states."
- **Constraint:** Requires a shared `ISpatialRegistry` interface for stacking.

### CA-6: Dynamic Perimeter Rendering

- **Job Story:** "I want thick, clean borders around country perimeters."
- **Implementation:** Use `THREE.LineSegments` derived from the subset of `borderEdges` between different groups.

### CA-8: Spatial Anchoring

- **Job Story:** "I want guaranteed interior anchor points for labels in non-convex territories."
- **Algorithm:** Pole of Inaccessibility (Chebyshev center).

---

## 8. Phase 5: Multiplayer Resilience

### B6 (V17) Rollback Netcode

- **Mandate:** WebRTC DataChannels + deterministic lockstep. Implicitly depends on BigInt clock (A2) and two-phase lock (B5).

---

## 9. Icebox / Exclusions

- **V11 — Strip Three.js:** Retain Three.js behind `IRenderBackend` (V10) unless performance spikes prove it insufficient.
- **V12 — FBO Read-back Picking:** Replace `THREE.Raycaster` once the Palette Shader (B2) is live.
- **V15 — `TEXTURE_2D_ARRAY`:** Deferred until mobile limits force chunking.
- **V18/V19/V20 — AI & RPN Scripting:** Specialized far-future features.

---

## 10. Revision History
