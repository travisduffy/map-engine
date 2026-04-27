# map-engine: Master Technical Roadmap

> **Document type:** Canonical Master Roadmap
> **Status:** Living document. Version-agnostic.
>
> This document synthesizes the product capabilities from the original `ROADMAP.md` (CA-1 to CA-9) with the structural mandates from the `SCOPE_STATEMENT.md` (Pillars I-VII, Phases A/B). It represents the single, unified technical trajectory for the engine, demonstrating how deep architectural refactors (The "How") unlock grand-strategy product features (The "What").

---

## 1. Vision & Core Engineering Mandates

`map-engine` is a **minimal, browser-native Grand Strategy Game (GSG) spatial runtime** built on WebGL (Three.js) and typed ESM. It provides the Pareto-optimal set of spatial and temporal primitives that every GSG requires, without ever owning game state, simulation logic, or UI.

To achieve the performance required for massive 10,000+ province maps running at 60fps with deterministic multiplayer, the engine adheres to seven **Core Engineering Mandates**:

1. **Temporal Serialization (Pillar I):** Perfectly deterministic, discrete-state automaton decoupled from render framerate via fixed-step BigInt accumulators.
2. **State Management (Pillar II):** Heavily normalized SoA (Structure of Arrays) layout maximizing CPU cache coherency, with strict Two-Phase (Read-Lock/Write-Lock) concurrency.
3. **Memory Architecture (Pillar III):** Zero-copy WASM/SAB memory bridge bypassing V8 garbage collection, using wait-free ring buffers for input.
4. **Rendering (Pillar IV):** Map as an immutable "RGB Index-Map" spatial database. GPU-as-translator via fragment LUTs (palette shaders) and targeted dirty-rect PBO uploads.
5. **Multiplayer (Pillar V):** WebRTC DataChannels (unreliable/unordered UDP) with deterministic lockstep and rollback netcode.
6. **User Interface (Pillar VI):** Svelte 5 Off-Main-Thread (OMT). Simulation kernel strictly inside a Web Worker. Unidirectional data flow.
7. **AI & Modding (Pillar VII):** Modulo-based temporal scheduling, polynomial utility scoring, and Reverse Polish Notation (RPN) integer opcodes for deterministic script evaluation.

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
[Already Shipped: CA-1 Frame Hook, CA-2 Adjacency, CA-3 Input, CA-9 Game Clock]

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

## 4. Phase 1: Momentum & Hardening (Immediate)

_Goal: Eliminate obvious waste and harden determinism without breaking APIs._

- **A1 (V1) Render Gating:** GPU submit rate drops to mutation-driven cadence; idle GPU submits are gated.
- **A2 (V2) BigInt Clock:** Upgrades **CA-9 (Game Clock)**. Replaces IEEE-754 floats with BigInt microsecond accumulators for cross-platform determinism drift prevention.
- **A3 (V4) SAB Backing:** Allocates `sourceBuffer` and `displayImageData` over `SharedArrayBuffer` to prepare for the Web Worker zero-copy bridge.
- **A4 (V6) Dirty-Rect Uploads:** Replaces O(W×H) full-texture uploads with precise `gl.texSubImage2D` calls, drastically reducing PCIe bandwidth usage.

## 5. Phase 2: The Structural Pivot (Critical Path)

_Goal: Rip out the V8-idiomatic object graph and replace it with a high-performance Data Engine._

- **B1 (V3) SectorRegistry Flattening:** Upgrades **CA-2 (Adjacency)**. The most critical architectural shift. Converts all `Map<string, ...>` structures (like bboxes, centroids, pixelIndices, adjacency) into contiguous SoA TypedArrays and CSR (Compressed Sparse Row) formats indexed by dense integer province IDs. This shrinks memory by >80% and makes the registry WASM/Worker-ready.

## 6. Phase 3: The Concurrent Kernel (Near Future)

_Goal: Move the brain into a Worker and the eyes onto the GPU._

- **B2 (V7) Palette Shaders (Implements CA-7: GPU Map Modes):** Replaces CPU pixel iteration with a fragment LUT. A single index map texture is uploaded once; map mode swaps happen instantly by uploading a tiny palette texture (1 pixel per sector).
- **B3 (V8) Worker Relocation:** Moves `GameClock` and simulation state entirely into a Web Worker, communicating with the UI via the SAB established in A3.
- **B4 (V9) Wait-Free Ring Buffers:** Establishes the 64-bit bit-packed binary intent pipeline for UI-to-Engine interactions.
- **B5 (V16) Two-Phase R/W Lock:** Enforces the Read-Lock (parallel evaluation) / Write-Lock (sequential commit) concurrency model.

## 7. Phase 4: GSG Feature Delivery (Far Future)

_Goal: Deliver the actual GSG features built upon the ultra-fast flat memory kernel._

- **CA-4: Pathfinding Primitives (`SpatialGraph`):** A standalone, Worker-safe utility for A\*/Dijkstra routing over the CSR adjacency graph.
- **CA-5: Hierarchical Aggregation (`HierarchyRegistry`):** Groups provinces into states and countries, dynamically calculating macro-level bounding boxes and adjacency without duplicating spatial math.
- **CA-6: Dynamic Perimeter Rendering:** Draws clean, sovereign political borders around country perimeters using `THREE.LineSegments`.
- **CA-8: Spatial Anchoring:** Calculates the Pole of Inaccessibility (Chebyshev center) for guaranteed safe UI anchoring inside non-convex territories.

## 8. Phase 5: Multiplayer Resilience (Far Future)

_Goal: Transform the engine into a deterministic multiplayer simulation._

- **B6 (V17) Rollback Netcode:** Utilizes WebRTC DataChannels for unreliable/unordered delivery. Implements deterministic lockstep and rollback mechanics, relying implicitly on the BigInt clock (A2) and the two-phase lock model (B5).

## 9. Icebox / Exclusions

_Features deliberately held out of the critical path unless specific spikes prove them necessary._

- **V11 — Strip Three.js:** Retaining Three.js behind an `IRenderBackend` wrapper is preferred over a raw WebGL rewrite unless mobile/PBO limitations force the issue.
- **V12 — FBO Read-back Picking:** Replacing `THREE.Raycaster` with pixel-color lookup from a frame buffer object. Deferred until the Palette Shader (B2) is live.
- **V15 — `TEXTURE_2D_ARRAY`:** Deferred until mobile texture limits dictate a chunking strategy.
- **V18/V19/V20 — AI & RPN Scripting:** Specialized far-future features outside the core simulation loop scope.
