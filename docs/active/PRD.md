# Product Requirements Document: Phase 2 — The Structural Pivot

> **Status: ACTIVE**
> **Active Version:** v0.0.3-phase-2
> This PRD governs the "Structural Pivot" phase, where the engine's core registry is refactored from an object-oriented map to a high-performance Data Engine using Structure of Arrays (SoA).

---

## Overview

Phase 2 transforms the `SectorRegistry` into a memory-efficient, Worker-safe data structure. By flattening sector data into TypedArrays and adopting a CSR (Compressed Sparse Row) format for adjacency, we will reduce the constructor's heap allocation by >80% and eliminate GC pressure during large map loads. This phase also decouples the rendering logic from Three.js via the `IThreeRenderBackend` interface, ensuring future-proofing and easier unit testing.

---

## Goals & Non-Goals

### Goals

- **Flatten `SectorRegistry`:** Replace `Map<string, Sector>` with dense TypedArrays (`Int16Array`, `Uint32Array`, etc.).
- **Memory Efficiency:** Achieve a >80% reduction in constructor heap allocation for `large.png` (4096px).
- **Worker Readiness:** Ensure all flattened data structures are Transferable-safe (no DOM or Three.js dependencies in `SectorRegistry`).
- **CSR Adjacency:** Implement adjacency using CSR for O(1) neighbor lookup without object overhead.
- **Contour Extraction:** Extract ordered polygon rings during the single O(W×H) bitmap scan.
- **Render Decoupling:** Extract `IThreeRenderBackend` to remove Three.js imports from `MapRenderer.ts`.

### Non-Goals

- **Web Worker Relocation:** The actual move to a Web Worker is deferred to Phase 3.
- **Palette Shaders:** GPU-based recoloring is deferred to Phase 3.
- **Dynamic Borders:** Populating border geometry is deferred to Phase 4; Phase 2 only allocates the buffers.
- **API Breaking Changes:** None. The public `MapEngine` API must remain strictly stable for all existing synchronous lookups (`pick`, `getNeighbors`, `getCentroid`, `getBBox`). 
  - **Note:** The `pick()` transition to an asynchronous `Promise` based signature is deferred to Phase 3 (B3.c) to align with Matrix #308.

---

## Architecture

### SectorRegistry (Flattened)
The `SectorRegistry` will no longer store `Sector` objects. Instead, it will manage the following TypedArrays:
- `bboxes`: `Int16Array` (sectorCount * 4) [minX, minY, maxX, maxY]
- `centroids`: `Int16Array` (sectorCount * 2) [x, y]
- `pixelIndices`: `Uint32Array` (width * height) - Flat index map.
- `pixelIndicesMirror`: `Uint16Array` (width * height) - Immutable downcast for recovery (F-3.3).
- `hexColors`: `Uint32Array` (sectorCount) - Packed RGB lookup (F-3.1).
- `sectorIds`: `Uint16Array` (sectorCount) - Numeric IDs for binary search (F-3.1).
  - **Binary Search Lookup Mandate:** `hexColors` must be sorted by packed RGB value, with `sectorIds` storing the corresponding Numeric ID, to enable O(log N) color -> ID resolution in `pick()`.
- `idToHex`: `string[]` (sectorCount) - Reverse lookup from Numeric ID to Hex-string (PR-2).
- `adjacencyPointers`: `Uint32Array` (sectorCount + 1) - CSR Row Pointers.
- `adjacencyNeighbors`: `Uint16Array` (totalEdges) - CSR Column Indices.
- `contourPointers`: `Uint32Array` (sectorCount + 1) - CSR Row Pointers for rings.
- `contourPoints`: `Int16Array` (totalPoints * 2) - Flattened ring segments.
- `borderEdges`: `Float32Array` (4 * totalGeometricPerimeterSegments) - Pre-allocated border pool (B1.c).
- `borderEdgeCount`: `Uint32Array` (1) - 1-element buffer for transferable handoff (B1.c).

**Memory Mandate (P-9, §12.3):** The `sourceBuffer` (Uint8Array) MUST be disposed of immediately after `pixelIndices` extraction to stay under the 256MB heap cap. **Buffer Sequence:** 1. Populate `pixelIndices` (Uint32); 2. Dispose `sourceBuffer`; 3. Populate `pixelIndicesMirror` (Uint16) from `pixelIndices`.

**Sentinels (§12.3):** The ID `0xFFFF` (65535) is the canonical 'no sector' sentinel for `pixelIndices` and `pixelIndicesMirror`. To prevent sentinel collision, the engine enforces a **Hard Sector Limit of 65,534 sectors**. Attempts to load maps exceeding this limit must throw a `SectorLimitExceededError`.

### Principles Compliance (Mandate §3)
- **PR-1 (Hobbyist Deployability):** `sourceBuffer` disposal and `pixelIndicesMirror` (Uint16) optimization ensure peak heap usage ≤ 256MB on mobile.
- **PR-2 (Ergonomic API):** Sync methods (`getNeighbors`, etc.) remain synchronous via hex-string lookups against internal TypedArrays.
- **PR-3 (Performance ROI):** SoA and CSR eliminate O(N) object overhead; >80% reduction in constructor heap.
- **PR-4 (Conservative Surface):** `IThreeRenderBackend` hides Three.js complexity from core logic.
- **PR-5 (Reversibility):** Interface-based rendering allows easy swapping of backends without logic changes.

### Interfaces
- **ISpatialRegistry (B1.d, F-2.3):** Defines the contract for both the base registry and future hierarchical proxies.
  ```ts
  interface ISpatialRegistry {
    getBBox(id: string): [number, number, number, number];
    getBBox(id: number): [number, number, number, number];
    getNeighbors(id: string): string[];
    getNeighbors(id: number): number[];
    getCentroid(id: string): [number, number];
    getCentroid(id: number): [number, number];
  }
  ```

- **IThreeRenderBackend (B1.5, F-2.7):**
  ```ts
  interface IThreeRenderBackend {
    uploadTexture(tex: THREE.Texture): void
    uploadBorderEdges(buffer: Float32Array, count: number): void // F-C.9
    updateUniforms(uniforms: Record<string, any>): void
    render(scene: THREE.Scene, camera: THREE.Camera): void
    dispose(): void
  }
  ```
  **Note (F-2.8):** `uploadTexture` implementations in test-doubles (NullBackend) MUST retain a reference to the source typed-array via `.slice()` to support Main-thread `pick()` lookups.

### Internal Access & Utility (F-2.4, F-2.6)
- **ThreeRenderBackendInternalAccess:** Implementations of `IThreeRenderBackend` (specifically `ThreeRenderBackend`) may also implement an internal access interface for picking and advanced debugging:
  ```ts
  interface ThreeRenderBackendInternalAccess {
    getThreeScene(): THREE.Scene;
    getThreeRenderer(): THREE.WebGLRenderer;
    readSectorIdAt(x: number, y: number): number;
  }
  ```
- **packRgb Utility:** A internal utility `packRgb(r, g, b): number` must be implemented in `src/utils.ts` to produce `(r<<16)|(g<<8)|b`. This is tagged `@internal` and must remain Worker-safe (zero DOM/Canvas dependencies).

---

## Acceptance Criteria

### Epic 1: SectorRegistry Flattening (B1.a-e)
- **B1.a (Dense SoA):** Sector IDs are 0..N-1. `bboxes`, `centroids`, and `pixelIndices` use TypedArrays. Constructor heap for `large.png` is within 5% of theoretical minimum.
- **Zero API Break Boundary:** The public methods `getNeighbors`, `getCentroid`, and `getBBox` MUST remain synchronous and continue to use hex-string IDs. Internal translation maps handle the 0..N-1 conversion.
- **ISpatialRegistry Overloads:** The interface MUST use strict overloads to ensure type safety:
  ```ts
  interface ISpatialRegistry {
    getBBox(id: string): [number, number, number, number];
    getBBox(id: number): [number, number, number, number];
    getNeighbors(id: string): string[];
    getNeighbors(id: number): number[];
    getCentroid(id: string): [number, number];
    getCentroid(id: number): [number, number];
  }
  ```
- **B1.b (CSR Adjacency):** Neighbors are resolved via `adjacencyPointers` and `adjacencyNeighbors`.
- **B1.e (Contour Extraction):** `contourPointers` and `contourPoints` are populated. Total scan loop runs exactly once per `loadMap`.
- **B1.c (Border Edge Allocator):** `borderEdges` (Float32Array) is allocated with length `4 * totalGeometricPerimeterSegments`.
- **B1.d (ISpatialRegistry):** `SectorRegistry` implements the `ISpatialRegistry` interface.
- **Efficiency:** Heap allocation for `large.png` constructor is ≤ 0.2x the pre-Phase 2 baseline.

### Epic 2: IThreeRenderBackend Contract (B1.5)
- **Decoupling:** `MapRenderer.ts` contains zero non-type imports from `'three'`.
- **Internal Access:** `ThreeRenderBackend` implements `ThreeRenderBackendInternalAccess`.
- **NullBackend:** Logic tests run successfully against `NullRenderBackend` in Vitest.
- **Visual Verification:** Visual tests pass against `ThreeRenderBackend` in Playwright/Chromium.

---

## What This Version Explicitly Does Not Include

- **Worker-side Simulation:** All logic remains on the Main thread for now.
- **Pathfinding (CA-4):** Deferred to Phase 4.
- **Hierarchical Aggregation (CA-5):** Deferred to Phase 4.

---

## Known Risks

- **Memory Limit on Mobile:** A 4096px map requires ~64MB for `pixelIndices`. We must ensure `sourceBuffer` is disposed immediately to stay under the 256MB cap.
- **CSR Complexity:** CSR indexing is error-prone compared to `Map<string, Set<string>>`. Requires rigorous unit testing with small 4x4 fixtures.
- **Performance Regression:** The mapping between Hex-IDs (public) and Numeric IDs (internal) must be O(1) or O(log N) to avoid slowing down existing synchronous APIs.
