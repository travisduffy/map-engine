# Project Progress

> **This file is the single source of truth for implementation state.**
> Every AI session working on this project must read this file first and update it before closing the session. It is the handoff document between sessions.

---

## How to Use This File

**At the start of a session:**

1. Read this file in full.
2. Check the Task Registry below to find the next incomplete task.
3. Cross-reference the task's epic file (`docs/epics/`) for full work spec.
4. Cross-reference `docs/PRD.md` for acceptance criteria and algorithm details.

**During a session:**

- Update the task's status to `[~]` (in progress) when you begin it.
- Append a Session Log entry with what you're doing and any notable decisions.

**At the end of a session:**

- Mark completed tasks `[x]`.
- If a task is blocked, mark it `[!]` and note the blocker.
- Append a Session Log entry summarizing what was completed.
- Capture anything non-obvious in Lessons Learned.

**Status legend:**
| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked — see log for details |

---

## Current Status

**Phase:** Epic 1 in progress.
**Next task:** Task 2.1 — Three.js Scene, Renderer, Camera, Geometry, and Render Loop.
**Blocking issues:** None.

---

## Task Registry

### Epic 1: Core Infrastructure and Spatial Data Parsing

> Full spec: `docs/epics/epic-1-core-infrastructure.md`

| Status | Task    | Description                                                                     |
| ------ | ------- | ------------------------------------------------------------------------------- |
| `[x]`  | **1.1** | Toolchain and Build Configuration                                               |
| `[x]`  | **1.2** | Shared Types, Utilities, Module Stubs, and Test Fixtures                        |
| `[x]`  | **1.3** | `SectorBitmapParser`: Core Decode Pipeline                                      |
| `[x]`  | **1.4** | `SectorBitmapParser`: Error Handling and Tests                                  |
| `[x]`  | **1.5** | `SectorRegistry`: Single Scan Pass and Spatial Structures                       |
| `[x]`  | **1.6** | `SectorRegistry`: Border Edges, Load-Time Validation, Public Methods, and Tests |

### Epic 2: WebGL Rendering and Camera Architecture

> Full spec: `docs/epics/epic-2-webgl-rendering.md`

| Status | Task    | Description                                                                 |
| ------ | ------- | --------------------------------------------------------------------------- |
| `[ ]`  | **2.1** | Three.js Scene, Renderer, Camera, Geometry, and Render Loop                 |
| `[ ]`  | **2.2** | Display Canvas, `displayImageData`, `CanvasTexture`, and Color Parser Setup |
| `[ ]`  | **2.3** | `setSectorColor`: CSS Color Parsing and Pixel Write                         |
| `[ ]`  | **2.4** | `resetSectorColor`, Edge Cases, and Color Mutation Tests                    |
| `[ ]`  | **2.5** | Pointer-Drag Pan and `clampPan()`                                           |
| `[ ]`  | **2.6** | Scroll-Wheel Zoom, `destroy()` Teardown, and Full Camera/Navigation Tests   |

### Epic 3: Interaction, Public API Facade, and Distribution

> Full spec: `docs/epics/epic-3-interaction-api-distribution.md`

| Status | Task    | Description                                                                           |
| ------ | ------- | ------------------------------------------------------------------------------------- |
| `[ ]`  | **3.1** | `MapEngine` Constructor and Event Subscription System (`on` / `off`)                  |
| `[ ]`  | **3.2** | `loadMap()`, Lifecycle Guards, `destroy()`, and Pass-Through Methods                  |
| `[ ]`  | **3.3** | Picking Pipeline: NDC Conversion, Raycasting, and UV-to-Pixel Mapping                 |
| `[ ]`  | **3.4** | Sector Resolution, `PickResult` Construction, and Event Emission                      |
| `[ ]`  | **3.5** | Core API Documentation: Quickstart, API Reference, and Asset Contracts                |
| `[ ]`  | **3.6** | Known Limitations, Web Worker Opt-In, Out-of-Scope List, and Bundle Size Verification |

---

## Session Log

> Entries are prepended (newest first). Each entry records the date, what was attempted, what was completed, and any decisions made that aren't captured elsewhere.

<!-- SESSION ENTRY TEMPLATE — copy and fill in:

### YYYY-MM-DD — [brief title]

**Tasks touched:** X.Y, X.Z
**Outcome:** completed / partial / blocked

**What happened:**
[What was done, in plain language. Include any approaches tried that didn't work.]

**Decisions made:**
[Any implementation choices not fully specified by the PRD, or PRD ambiguities resolved.]

**Left off at:**
[Exact task and step where the session ended, so the next session can resume without re-reading everything.]

-->

### 2026-04-08 — Task 1.6: `SectorRegistry` Border Edges, Load-Time Validation, Public Methods, and Tests

**Tasks touched:** 1.6
**Outcome:** completed

**What happened:**
Promoted `_borderEdges` to public `readonly borderEdges: BorderEdge[]`. Tracked bitmap-only hex keys in a `bitmapOnlyKeys` Set during the scan. After scan: emits `console.warn` for each JSON-only sector (no pixels) and each bitmap-only color (no JSON entry). Implemented `getSectorAt` (floors inputs, bounds checks, reads sourceBuffer), `getSector` (O(1) map lookup), `getSectorKeys` (returns definition keys only). Wrote 37 browser-mode tests covering all Phase 3 acceptance criteria — all 37 pass alongside the 11 existing parser tests.

**Decisions made:**

- Dropped `protected` on `_sectorMap` and `_borderEdges` — Task 1.6 integrated everything into the same class, so they became `private`/`readonly` respectively. No subclassing needed.

**Left off at:**
Epic 1 complete. Task 2.1 — Three.js Scene, Renderer, Camera, Geometry, and Render Loop. Ready to start.

---

### 2026-04-08 — Task 1.5: `SectorRegistry` Single Scan Pass and Spatial Structures

**Tasks touched:** 1.5
**Outcome:** completed

**What happened:**
Implemented `SectorRegistry` constructor with: buffer length validation; single O(W×H) scan pass building bboxes, centroid accumulators, pixelIndex arrays, and border edge accumulator; post-scan finalization (divide centroid sums, sort+convert pixelIndex arrays to Uint32Array). Pre-populated sector map from definition entries before the scan (handles zero-pixel JSON sectors). Border edge accumulator stored as `protected _borderEdges` for Task 1.6 to expose. `typecheck`, `build`, `test`, and `format` all pass.

**Decisions made:**

- Pre-populated `_sectorMap` from all definition keys upfront (not "on first encounter") — simpler and correctly handles zero-pixel sectors without extra logic.
- `_sectorMap` and `_borderEdges` marked `protected` so Task 1.6 can expose them without needing a second scan pass.
- Centroid uses raw pixel coordinates (x, y as integers); averaging them gives the pixel-center centroid (0.5 offset emerges naturally from the math for uniform grids).

**Left off at:**
Task 1.6 — `SectorRegistry`: Border Edges, Load-Time Validation, Public Methods, and Tests. Ready to start.

---

### 2026-04-08 — Task 1.4: `SectorBitmapParser` Error Handling and Tests

**Tasks touched:** 1.4
**Outcome:** completed

**What happened:**
Added runtime type guard (`typeof source !== 'string' && !(source instanceof Blob)` → throws descriptive error). Wrote 11 browser-mode tests covering: URL path (dimensions, 4 quadrant pixel checks, all-alpha-255), Blob path, invalid file type, 404, unreachable host, non-string/Blob input. All 11 pass.

**Decisions made:**

- Vite's SPA fallback returns HTTP 200 + HTML for any unknown static path, so `/test/fixtures/nonexistent.png` passed `response.ok` and failed only at `createImageBitmap`. Added a `test404Plugin()` Vite plugin in `vite.config.ts` that registers a `/test/__404__` middleware returning a genuine HTTP 404. Test uses that endpoint instead of a fake static path.

**Left off at:**
Task 1.5 — `SectorRegistry`: Single Scan Pass and Spatial Structures. Ready to start.

---

### 2026-04-08 — Task 1.3: `SectorBitmapParser` Core Decode Pipeline

**Tasks touched:** 1.3
**Outcome:** completed

**What happened:**
Implemented `SectorBitmapParser.parse(source: string | Blob)`. String path: `fetch` → `response.ok` check (throws with HTTP status) → `response.blob()` → `createImageBitmap(blob)`. Blob path: `createImageBitmap(source)` directly. Both paths draw to `OffscreenCanvas`, call `ctx.getImageData`, return `{ buffer, width, height }`. Verified zero references to `document`, `window`, `HTMLElement`, `HTMLCanvasElement`, and zero `from 'three'` imports. `tsc --noEmit` passes; `vite build` outputs 0.56 kB gzip.

**Decisions made:**

- Used non-null assertion `canvas.getContext('2d')!` — `OffscreenCanvas` always supports `'2d'`; null check would add dead code.

**Left off at:**
Task 1.4 — `SectorBitmapParser`: Error Handling and Tests. Ready to start.

---

### 2026-04-08 — Task 1.2: Shared Types, Utilities, Module Stubs, and Test Fixtures

**Tasks touched:** 1.2
**Outcome:** completed

**What happened:**
Created `src/types.ts` with all 6 required types (`SectorData`, `SectorDefinitionFile`, `MapConfig`, `BorderEdge`, `SectorBBox`, `PickResult`). Created `src/utils.ts` with `toHexKey`. Created stub classes for `SectorBitmapParser`, `SectorRegistry`, `MapRenderer`, `MapEngine` — all methods throw `new Error("Not implemented")`. Replaced placeholder `src/index.ts` with barrel exports (`MapEngine` as default + all named exports). Created all fixture files: `generate-fixtures.js` (ESM), ran it to produce `test-4x4.png`, created `test-4x4.json`, `test-4x4-mismatch.json`, `test-invalid.txt`. `toHexKey(0, 77, 153) === "004d99"` verified. `tsc --noEmit` and `vite build` pass clean.

**Decisions made:**

- Used `Function` type for `on()` implementation signature to satisfy overload compatibility (TypeScript strict mode). Public overloads retain the precise typed signatures from PRD.
- `src/index.ts` uses `export type * from './types'` (TypeScript 5+) for type-only re-exports, per `verbatimModuleSyntax: true` constraint.
- `generate-fixtures.js` written as ESM (with `import` + `__dirname` polyfill via `fileURLToPath`) because `package.json` has `"type": "module"`.

**Left off at:**
Task 1.3 — `SectorBitmapParser`: Core Decode Pipeline. Ready to start.

---

### 2026-04-08 — Task 1.1: Toolchain and Build Configuration

**Tasks touched:** 1.1
**Outcome:** completed

**What happened:**
Vite boilerplate already had `"type": "module"`, `typescript@~6.0.2`, and `vite@^8.0.4`. Created `vite.config.ts` with `build.lib` (entry `src/index.ts`, ES format), `rollupOptions.external: ['three']`, and `test.browser` (playwright/chromium). Updated `package.json` with `"main"/"module": "dist/index.js"`, `peerDependencies.three`, and `"size"` script. Updated `tsconfig.json` to add `strict: true` and set `target: ES2020`, `module: ESNext`. Installed `vitest`, `@vitest/browser`, `playwright`, `sharp`. Created placeholder `src/index.ts` (to be replaced in Task 1.2). Verified `tsc --noEmit` passes, `vite build` emits `dist/index.js`, and `npm run size` prints a byte count.

**Decisions made:**

- Installed vitest@^3.2.4 (not v2.1 as PRD specifies) because the boilerplate already uses vite@^8 which requires vitest 3 for compatibility. The `instances` browser config syntax is the same.
- Removed `"private": true` from `package.json` since this is a distributable library.
- Added placeholder `src/index.ts` containing only a comment so the build target exists; Task 1.2 replaces it with the real barrel export.

**Left off at:**
Task 1.2 — Shared Types, Utilities, Module Stubs, and Test Fixtures. Ready to start immediately.

_(No sessions logged yet.)_

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

_(None yet — populated as implementation proceeds.)_
