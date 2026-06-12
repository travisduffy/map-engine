# Epic 1: SectorRegistry Flattening

**Objective:** Transform `SectorRegistry` from an object-oriented map to a high-performance Structure of Arrays (SoA) layout.
**Scope:** Incorporates PRD §"Epic 1: SectorRegistry Flattening (B1.a-e)" and ROADMAP §7.

**Verifiable & Measurable Success Criteria:**

- **Memory Efficiency:** Constructor heap allocation for `large.png` (4096px) is ≤ 0.2x the pre-Phase 2 baseline.
- **Data Integrity:** `getNeighbors`, `getCentroid`, and `getBBox` return identical results to the legacy implementation.
- **Single Pass:** Bitmap scan loop runs exactly once per `loadMap` (verified via Vitest spy).
- **CSR Validity:** Adjacency pointers and neighbors correctly encode the graph topology.

---

## Tasks

### Task 1.0 — Capture Baseline Performance (F-2.1)

**PRD Reference:** §Acceptance Criteria — Epic 1
**Principles Compliance:** PR-3 (Performance ROI).

Establish the "pre-flattening" memory footprint using browser-fidelity measurement. This is a hard prerequisite for all Phase 2 work.

**Work:**
- Execute `npm run bench:registry-alloc fixtures/maps/large.png`.
- **Measurement Mandate (F-2.1):** Use `performance.measureUserAgentSpecificMemory()` via Playwright/Chrome. Fallback to `performance.memory.usedJSHeapSize` ONLY if MAVS is unavailable.
- Ensure `bench/baselines.json` is updated with the median value under the key `b1.constructor_alloc_bytes`.
- Document hardware, browser version, and measurement method.

**Done when:** `bench/baselines.json` contains a valid `b1.constructor_alloc_bytes` entry captured via high-fidelity browser tools.

---

### Task 1.1 — Dense SoA: Mirror, SoA Lookup, pixelIndices (B1.a)

**PRD Reference:** §Architecture — SectorRegistry (Flattened), §Acceptance Criteria — Zero API Break Boundary
**Principles Compliance:** PR-1 (Heap Budget), PR-3 (Performance ROI).

Convert the core sector properties into TypedArrays.

**Work:**
- Assign dense 0..N-1 integer IDs to sectors during the initial discovery pass.
- **Hard Sector Limit Mandate:** Throw a `SectorLimitExceededError` (to be defined in `src/types.ts`) if `sectorCount > 65534` during the discovery pass to prevent sentinel (`0xFFFF`) collision in the `Uint16Array` mirror.
- Replace `Map<string, Sector>` properties with:
  - `bboxes`: `Int16Array(sectorCount * 4)`
  - `centroids`: `Int16Array(sectorCount * 2)`
  - `pixelIndices`: `Uint32Array(width * height)`
  - **Buffer Sequence Mandate (PR-1):** 1. Populate `pixelIndices` from `sourceBuffer`; 2. Set `sourceBuffer` to `null` (dispose); 3. Populate `pixelIndicesMirror` from `pixelIndices`.
  - **Recovery Mirror (F-3.3):** Create an immutable `pixelIndicesMirror`: `Uint16Array` downcast from `pixelIndices`.
  - **Binary Search Lookup (F-3.1):** Implement `hexColors: Uint32Array(sectorCount)` (packed RGB) and `sectorIds: Uint16Array(sectorCount)` (numeric IDs). **Mandate:** `hexColors` must be sorted by packed RGB value, with `sectorIds` storing the corresponding Numeric ID at the same index, forming a binary-searchable table for color -> ID resolution.
  - **Reverse Lookup Mandate (PR-2):** Implement `idToHex: string[]` (Main-thread only) to provide O(1) resolution from Numeric ID to Hex-string for public synchronous APIs.
- **Sentinel Mandate:** Use `0xFFFF` as the 'no sector' sentinel in `pixelIndices` and `pixelIndicesMirror`.
- Implement internal lookup table (Map or Object) to map Hex-IDs to Numeric IDs.
- **Mandate:** Ensure public methods (`pick`, `getNeighbors`, `getCentroid`, `getBBox`) continue to accept and return Hex-IDs (strings) synchronously, using the lookup table for internal TypedArray access. `pick()` MUST NOT be transitioned to async in this phase.
- **packRgb (F-2.4):** Implement `@internal` helper `packRgb(r, g, b) => (r<<16)|(g<<8)|b` for use in pixel processing.

**Done when:** `bboxes`, `centroids`, `pixelIndices`, `pixelIndicesMirror`, `hexColors`, `idToHex`, and `sectorIds` heap usage is within 5% of theoretical minimum; `sourceBuffer` is null/dereferenced; `SectorLimitExceededError` thrown if `sectorCount > 65534`; public API (including `pick`) remains unchanged and passing tests.

---

### Task 1.2 — CSR Adjacency Implementation (B1.b)

**PRD Reference:** §Architecture — SectorRegistry (Flattened)
**Principles Compliance:** PR-3 (Performance ROI).

Replace the neighbor sets with a Compressed Sparse Row (CSR) structure.

**Work:**
- **Double-Pass Adjacency Mandate (PR-3):** To maintain the "Single Scan" of pixel data (Task 1.3) while avoiding GC pressure from temporary objects, implement a two-pass edge builder.
  1. **Pass 1 (Discovery):** **Integrated into the primary O(W×H) pixel scan (Task 1.1).** Use a `Set<number>` to store unique edge pairs, where each pair is a 32-bit packed integer: `(idA << 16) | idB` (where `idA < idB` to ensure symmetry).
  2. **Pass 2 (Flattening):** Flatten the `Set` into an intermediate `Uint32Array`, sort it to group by `idA`, and then populate the CSR arrays.
- Implement `adjacencyPointers: Uint32Array(sectorCount + 1)`.
- Implement `adjacencyNeighbors: Uint16Array(totalEdges)`.
- Update `getNeighbors(id)` to slice from `adjacencyNeighbors` using the pointers.

**Done when:** Adjacency results match the legacy implementation; `adjacencyPointers + adjacencyNeighbors` heap size is exactly `(sectorCount+1)*4 + totalEdges*2` bytes ± 5%; implementation avoids high-frequency object allocation during neighbor collection.

---

### Task 1.3 — Contour Extraction & Perimeter Segments (B1.e)

**PRD Reference:** §Architecture — SectorRegistry (Flattened)
**Principles Compliance:** PR-3 (Performance ROI).

Extract polygon rings during the single O(W×H) scan.

**Work:**
- Implement ordered ring extraction during the primary O(W×H) pixel scan iteration (Task 1.1).
- Populate `contourPointers: Uint32Array(sectorCount + 1)`.
- Populate `contourPoints: Int16Array(totalPoints * 2)`.
- Track `totalGeometricPerimeterSegments` for use in Task 1.4.

**Done when:** `contourPointers` and `contourPoints` are populated; Vitest spy confirms exactly one loop per `loadMap`.

---

### Task 1.4 — Border Edge Allocator (B1.c)

**PRD Reference:** §Goals
**Principles Compliance:** PR-3 (Performance ROI).

Allocate the buffers required for future dynamic border rendering.

**Work:**
- **Ordering Rule (F-2.0):** Consume metrics from B1.e (`totalGeometricPerimeterSegments`) and B1.b (`totalEdges`).
- Allocate `borderEdges: Float32Array(4 * totalGeometricPerimeterSegments)`.
- Allocate `borderEdgeCount: Uint32Array(1)` initialized to 0.
- Ensure these buffers are zero-initialized.

**Done when:** `borderEdges.length === 4 * totalGeometricPerimeterSegments`; `borderEdgeCount[0] === 0`; buffers correctly allocated after prerequisite metrics are available.

---

### Task 1.5 — ISpatialRegistry Contract & Proxy Prep (B1.d)

**PRD Reference:** §Architecture, §Interfaces
**Principles Compliance:** PR-2 (Ergonomic API), PR-4 (Conservative Surface).

Finalize the interface to support future hierarchical proxies.

**Work:**
- Define `ISpatialRegistry` interface in `src/types.ts`.
- **Interface Mandate:** Support both `string` (public hex) and `number` (internal dense) IDs.
- **Return Type Overload Mandate:** Use TypeScript overloads or generics to ensure return type consistency (e.g., `getNeighbors(string) => string[]`, `getNeighbors(number) => number[]`).
- Ensure `SectorRegistry` implements it.

**Done when:** TypeScript interface compiles; `SectorRegistry` implements it without errors; all three mandated methods are present with correct overloads.
