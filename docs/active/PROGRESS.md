# Project Progress: Phase 2 — The Structural Pivot

> **This file is the single source of truth for implementation state.**
> Every AI session working on this project must read this file first and update it before closing the session. It is the handoff document between sessions.

---

## How to Use This File

**At the start of a session:**

1. Read this file in full.
2. Check **Current Status** — if it reads `NO ACTIVE SPRINT`, do not begin implementation work. Wait for the user to define the next version.
3. If a sprint is active, find the next incomplete task in the Task Registry.
4. Cross-reference the task's epic file (`docs/active/epics/`) for the full work spec.
5. Cross-reference `docs/active/PRD.md` for acceptance criteria and algorithm details.

**During a session:**

- Update the task's status to `[~]` (in progress) when you begin it.
- Append a Session Log entry with what you're doing and any notable decisions.

**At the end of a session:**

- Mark completed tasks `[x]`.
- If a task is blocked, mark it `[!]` and note the blocker.
- Append a Session Log entry summarizing what was completed, decisions made, and where you left off.
- Capture anything non-obvious in Lessons Learned.

**Status legend:**

| Symbol | Meaning                       |
| ------ | ----------------------------- |
| `[ ]`  | Not started                   |
| `[~]`  | In progress                   |
| `[x]`  | Complete                      |
| `[!]`  | Blocked — see log for details |

---

## Current Status

**Phase:** Phase 2 (The Structural Pivot)
**Active version:** v0.0.3-phase-2
**Next task:** None — all epics complete. PHASE_EXIT_AWAITING_AUDIT.
**Blocking issues:** None

---

## Task Registry

### Epic 1: SectorRegistry Flattening (B1.a-e)

> Full spec: `docs/active/epics/epic-1-flattening.md`

| Status | Task    | Description                                        |
| ------ | ------- | -------------------------------------------------- |
| `[x]`  | **1.0** | Capture Baseline Performance (F-2.1)               |
| `[x]`  | **1.1** | Dense SoA: Mirror, SoA Lookup, pixelIndices (B1.a) |
| `[x]`  | **1.2** | CSR Adjacency Implementation (B1.b)                |
| `[x]`  | **1.3** | Contour Extraction & Perimeter Segments (B1.e)     |
| `[x]`  | **1.4** | Border Edge Allocator (B1.c)                       |
| `[x]`  | **1.5** | ISpatialRegistry Contract & Proxy Prep (B1.d)      |

### Epic 2: Rendering Decoupling (B1.5)

> Full spec: `docs/active/epics/epic-2-decoupling.md`

| Status | Task    | Description                               |
| ------ | ------- | ----------------------------------------- |
| `[x]`  | **2.1** | Define IThreeRenderBackend Interface      |
| `[x]`  | **2.2** | Implement NullRenderBackend & Logic Tests |
| `[x]`  | **2.3** | Decouple MapRenderer from Three.js        |

---

## Session Log

### 2026-06-14 — Post-Implementation Check & Phase 2 Audit

**Tasks touched:** docs/audits/phase-2-audit.md (created), PROGRESS.md (lessons learned)
**Outcome:** completed — phase-2-audit.md written; PHASE_EXIT_AWAITING_AUDIT emitted

**What happened:**

Executed thorough post-implementation check of all Epic 1 and Epic 2 acceptance criteria against the actual codebase. All ACs verified against specific file/line evidence. Created `docs/audits/phase-2-audit.md` per PROTOCOLS.md §2.1 Phase Exit requirement.

**Verification results:**

- 217/217 tests pass
- `git grep` zero non-type 'three' imports in MapRenderer.ts ✅
- All four consistency scripts exit 0 ✅
- Bundle size 6,863 bytes gzipped (under 15 KB) ✅
- All PRD ACs verified with line-level evidence ✅

**Discrepancies documented in audit:**

1. `bench/baselines.json`: Node.js `process.memoryUsage()` vs. spec's browser-based `performance.measureUserAgentSpecificMemory()` — pre-existing gap from Task 1.0, flagged for Auditor
2. `IThreeRenderBackend` adds `camera`, `scene`, `mesh`, `texture`, `setSize` beyond PRD spec — justified by decoupling requirements
3. `idToPackedRgb` not in PRD spec — justified by sourceBuffer disposal mandate
4. `updateUniforms` uses `Record<string, unknown>` vs. `Record<string, any>` — improvement, no functional impact

**Left off at:**

Phase 2 complete. `docs/audits/phase-2-audit.md` written. PHASE_EXIT_AWAITING_AUDIT signal emitted.

---

### 2026-06-14 — Epic 2 Implementation (Tasks 2.1–2.3)

**Tasks touched:** 2.1, 2.2, 2.3
**Outcome:** completed — all 217 tests pass, build 6.88 KB gzipped

**What happened:**

Implemented full rendering decoupling. `MapRenderer.ts` now has zero non-type imports from `'three'`; all Three.js construction lives in `ThreeRenderBackend`.

**Files created:**

- `src/render/IThreeRenderBackend.ts` — `IThreeRenderBackend` interface (`camera`, `scene`, `mesh`, `texture`, `uploadTexture`, `uploadBorderEdges`, `updateUniforms`, `render`, `setSize`, `dispose`) and `ThreeRenderBackendInternalAccess` interface (`getThreeScene`, `getThreeRenderer`, `readSectorIdAt`)
- `src/render/ThreeRenderBackend.ts` — Concrete Three.js backend: owns `WebGLRenderer`, `Scene`, `Mesh`, `MeshBasicMaterial`, `CanvasTexture`, `OrthographicCamera`; implements both interfaces
- `src/render/NullRenderBackend.ts` — Test backend: `uploadTexture` slices `ImageData` from OffscreenCanvas-backed textures; `readSectorIdAt` does bounds-checked packed-RGB lookup; `dispose()` clears slice; no `WebGLRenderer`
- `test/NullRenderBackend.test.ts` — 8 tests: instantiation, interface compliance, uploadTexture slice, readSectorIdAt, disposal

**Files modified:**

- `src/MapRenderer.ts` — `import * as THREE` removed; `import type { ..., Vector2 }` for types only; `import { ThreeRenderBackend }` for default backend creation; `THREE.MathUtils.clamp` → `Math.max/min`; `renderer.dispose()/geometry.dispose()/material.dispose()/texture.dispose()` → `this._backend.dispose()`; `renderer.setSize()` → `this._backend.setSize()`; `renderer.render()` → `this._backend.render()`; `_texture.needsUpdate` → `this._backend.uploadTexture(this._texture)`; `renderer`, `material` fields removed (moved to `ThreeRenderBackend`); `scene`, `camera`, `mesh` sourced from backend
- `test/MapRenderer.test.ts` — updated 3 assertions to access `ThreeRenderBackend` via `renderer['_backend']`
- `test/FrameHook.test.ts` — updated 2 `_texture` accesses to use backend
- `test/RenderGating.test.ts` — updated 8 `renderer.renderer` accesses to use backend's `getThreeRenderer()`

**Decisions made:**

- **`camera`, `scene`, `mesh`, `texture` on interface:** PRD spec lists `render(scene, camera)` as method params; adding these as interface properties is the only way MapRenderer can pass them without value-importing THREE.
- **`setSize` added to interface:** resize logic in MapRenderer's rAF loop needs to call the renderer; not in PRD spec but necessary for the decoupling to be complete.
- **`ThreeRenderBackend.material` public:** needed for test assertion `backend.material.map !== null`.
- **Optional `_backend` param on MapRenderer:** MapRenderer still creates `ThreeRenderBackend` internally by default; injecting an `IThreeRenderBackend` via the 6th constructor arg enables testing without WebGL.
- **`readSectorIdAt` returns packed RGB color (not sector ID) in NullRenderBackend:** color data (from OffscreenCanvas `getImageData`) is all that's available without the registry; Phase 3 Worker integration will align this with actual picking.

**Left off at:**

Epic 2 complete. Both Epic 1 and Epic 2 are done. Phase 2 implementation is complete.

### 2026-06-14 — Epic 1 Implementation (Tasks 1.0–1.5)

**Tasks touched:** 1.0, 1.1, 1.2, 1.3, 1.4, 1.5
**Outcome:** completed — all 209 tests pass, build 6.73 KB gzipped

**What happened:**

Complete rewrite of `SectorRegistry` from OO Maps to SoA TypedArrays and CSR adjacency. All Epic 1 tasks implemented in a single session spanning two context windows.

**Files changed:**

- `src/types.ts` — Added `SectorLimitExceededError`, `ISpatialRegistry` interface with strict overloads
- `src/utils.ts` — Added `packRgb(r,g,b)` internal utility
- `src/SectorRegistry.ts` — Complete rewrite: SoA TypedArrays, single O(W×H) scan, two-pass CSR adjacency, contour CSR, border edge allocator, ISpatialRegistry implementation
- `src/MapRenderer.ts` — Updated to use `getSectorPixels`, `getBBox` tuple, `idToPackedRgb`; no more `sourceBuffer` access
- `src/MapEngine.ts` — `getNeighbors` return type `string[] | undefined`
- `src/index.ts` — Added `SectorLimitExceededError` export
- `test/SectorRegistry.test.ts` — Rewrote for new TypedArray/method API
- `test/AdjacencyGraph.test.ts` — Rewrote for CSR `getNeighbors` API
- `test/MapRenderer.test.ts` — Updated sourceBuffer tests to null checks
- `test/FrameHook.test.ts` — Updated `bboxes.get`/`pixelIndices.get` to new method API
- `example/src/controller.ts` — Updated registry API calls (`getBBox`, `getCentroid`, `getSectorPixels`)
- `example/src/ui.ts` — Updated `SelectedRegistryData` type to use tuples

**Decisions made:**

- **sourceBuffer disposal (PR-1):** `sourceBuffer` set to null inside SectorRegistry constructor after `pixelIndices` extraction. `MapRenderer` builds `displayImageData` from `pixelIndices + idToPackedRgb` instead of slicing `sourceBuffer`.
- **Void pixel rendering:** Void pixels (id=0xFFFF) render as black in `displayImageData`. Accepted Phase 2 limitation (GPU palette deferred to ROADMAP CA-7).
- **getSectorAt void return:** Returns `'000000'` for void pixels — functionally equivalent for picking pipeline since `getSector('000000')` is undefined.
- **Per-sector pixel lists:** Maintained as private `_sectorPixels: Uint32Array[]`, exposed via `getSectorPixels(hexKey): Uint32Array | undefined`.
- **`getNeighbors` for unknown keys:** Returns `[]` (empty array), not undefined. `MapEngine.getNeighbors` wraps with undefined check for bitmap-only keys via `getSector`.
- **CSR edge pack:** `(lo<<16)|hi` in JS; Uint32Array + unsigned sort recovers `lo/hi` correctly for all valid IDs 0..65533.
- **Contour CSR:** Per-sector border segment pointers populated in main scan; contourPoints stores geometric endpoints as Int16.
- **Border edge allocator:** `borderEdges: Float32Array(4 * totalGeomSegs)` zero-initialized; Phase 4 populates.

**Left off at:**

Epic 1 complete. Epic 2 (Rendering Decoupling) is next — begin Task 2.1.

---

### 2026-06-12 — Sprint Hardening Revision Execution

**Tasks touched:** PRD.md, epic-1-flattening.md, PROGRESS.md
**Outcome:** completed

**What happened:**
Executed the revision pass for sprint hardening. Updated documentation to mandate the location of `packRgb` in `src/utils.ts` and require strict `ISpatialRegistry` typing.

**Decisions made:**

- **Procedural Correction:** Reverted an unauthorized modification to `src/utils.ts`.
- **Instructional Hardening:** Updated `GEMINI.md` with Zero-Tolerance Directive #5: **Strict Auditor Read-Only Mandate**. This ensures no agent acting as Auditor will ever mutate source code again.
- **Role Alignment:** The implementation of `packRgb` is now correctly identified as a task for the Engineer agent in Epic 1.

**Left off at:**
Task 1.0 (Capture Baseline) is the entry point for implementation. All technical gaps identified during audit have been documented for implementation by the Engineer.

---

### 2026-06-12 — Sprint Hardening & Technical Refinement

**Tasks touched:** PRD.md, epic-1-flattening.md, epic-2-decoupling.md, PROGRESS.md
**Outcome:** completed

**What happened:**
Executed the Sprint Hardening revision pass to resolve findings from the Master Auditor. Hardened the implementation plan against technical gaps in adjacency discovery, interface typing, and memory lookup strategies.

**Decisions made:**

- **CSR Adjacency:** Explicitly integrated "Pass 1 (Discovery)" into the primary O(W×H) pixel scan to uphold P-5 (Single Scan) mandate.
- **Interface Typing:** Hardened `ISpatialRegistry` with TypeScript overloads to ensure strict return-type consistency (`string[]` for `string` input, etc.).
- **Binary Search Lookup:** Specified that `hexColors` must be sorted to enable O(log N) lookup in `pick()`, satisfying Phase 3 Worker requirements.
- **Error Handling:** Standardized on `SectorLimitExceededError` for the hard sector limit (65,534 sectors).
- **Backend Alignment:** Clarified `NullRenderBackend` slicing mandate as a "Source of Visual Truth" requirement for integration tests.

**Left off at:**
Task 1.0 (Capture Baseline) is ready for execution. All documentation is now bulletproof and aligned with the Roadmap.

---

### 2026-06-11 — Master Audit & Alignment (Strict Compliance)

**Tasks touched:** PRD.md, epic-1-flattening.md, PROGRESS.md
**Outcome:** completed

**What happened:**
Conducted a Master Audit of all Phase 2 plans against the Roadmap and Traceability Matrix. Identified a strategic inconsistency regarding the `pick()` API. Per BDFL directive, shifted to "Strict Matrix Compliance" mode.

**Decisions made:**

- **API Stability:** Reverted the `pick()` async transition; it is now strictly deferred to Phase 3 (B3.c) per Matrix #308.
- **Goal Alignment:** Scrubbed PRD.md of the `pick()` exception; Phase 2 is now a "Zero API Break" release.
- **Technical Correction:** Verified `SectorData` types in `src/types.ts`. Confirmed `hexColors`/`sectorIds` must be Main-thread generated during Task 1.1 to resolve Roadmap §4 hallucinations.

**Left off at:**
Task 1.0 (Capture Baseline) is the entry point for implementation. Phase 2 plans are now fully hardened and aligned with the tactical Matrix authority.

---

### 2026-06-11 — Iterative Audit & Refinement (Pass 2)

### 2026-06-11 — Roadmap Audit & Technical Hardening

**Tasks touched:** PRD.md, epic-1-flattening.md, epic-2-decoupling.md, PROGRESS.md
**Outcome:** completed

**What happened:**
Performed a deep audit of the Phase 2 planning documents against `ROADMAP.md`. Identified and resolved several technical gaps including missing recovery buffers (`pixelIndicesMirror`), SoA lookup arrays (`hexColors`/`sectorIds`), and documentation standard violations (Principles Compliance fields).

**Decisions made:**

- Injected `pixelIndicesMirror` (Uint16) into Task 1.1 to satisfy F-3.3 context loss recovery.
- Transitioned hex-to-numeric lookup from JS objects to SoA TypedArrays (`hexColors`, `sectorIds`) to satisfy F-3.1 Transferable Discipline.
- Standardized all tasks with mandatory "Principles Compliance" fields per §3 mandate.
- Reconciled Task 1.4 dependencies to consume both B1.e and B1.b metrics.

**Left off at:**
Task 1.0 (Capture Baseline) remains the entry point for implementation. All planning documents are now hardened and synchronized with the Roadmap authority.

---

### 2026-06-11 — Sprint Initialization

**Tasks touched:** None (Setup only)
**Outcome:** completed

**What happened:**
Initialized `docs/active/PRD.md` and `docs/active/PROGRESS.md` for Phase 2. Extracted requirements from `ROADMAP.md` §7. Established the scope for two epics: Flattening (B1.a-e) and Rendering Decoupling (B1.5).

**Decisions made:**

- Grouped B1.a-e into a single serial Epic (Flattening).
- Kept B1.5 (Decoupling) as a parallel Epic.
- Explicitly stated that actual Worker move (B3) is out of scope for this sprint.

**Left off at:**
Task 1.0 (Capture Baseline) is the entry point for the next session.

---

## Lessons Learned

- **sourceBuffer disposal at constructor time (PR-1):** Setting `sourceBuffer = null` inside the SectorRegistry constructor means any consumer that previously read `registry.sourceBuffer` for color restoration must switch to `registry.idToPackedRgb[id]`. Update MapRenderer, all tests, and example controller when implementing this pattern.
- **Per-sector pixel lists vs flat pixelIndices:** The flat `pixelIndices: Uint32Array` (length = W×H, value = sector ID) replaces the old `Map<string, number[]>`. Per-sector lists for painting are now in `_sectorPixels: Uint32Array[]` (private), exposed via `getSectorPixels(hexKey)`. Tests that accessed `registry.pixelIndices.get(hexKey)` must switch to `registry.getSectorPixels(hexKey)`.
- **CSR adjacency returns arrays not Sets:** `getNeighbors` builds a new `string[]` or `number[]` on each call from CSR data. Old tests using `.has()` and `.size` must switch to `.includes()` and `.length`. Same-reference equality checks (`===`) on adjacency results are no longer valid.
- **FrameHook.test.ts also uses old API:** This file was missed in the initial test update pass. Any test file that accesses `registry.bboxes`, `registry.centroids`, `registry.pixelIndices`, or `registry.sourceBuffer` directly needs updating — not just the three obvious test files.
- **Backend injection for testing:** MapRenderer accepts an optional `_backend?: IThreeRenderBackend` as 6th constructor param. Tests that need a `WebGLRenderer` reference should cast `renderer['_backend'] as ThreeRenderBackend` and call `.getThreeRenderer()`. Tests that don't need WebGL can inject a `NullRenderBackend` to avoid GPU dependency entirely.
- **When renderer fields move to backend, sweep all test private-field accesses:** Moving `renderer.renderer`, `renderer.material`, `renderer['_texture']` to ThreeRenderBackend required updates in MapRenderer.test.ts (3 assertions), FrameHook.test.ts (2), and RenderGating.test.ts (8). Use `git grep "renderer\['\|renderer\.renderer\|renderer\.material" test/` to find access paths that need updating after any future field migration.
