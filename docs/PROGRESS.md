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

**Phase:** Epic 3 in progress.
**Next task:** Task 3.5 — Core API Documentation: Quickstart, API Reference, and Asset Contracts.
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
| `[x]`  | **2.1** | Three.js Scene, Renderer, Camera, Geometry, and Render Loop                 |
| `[x]`  | **2.2** | Display Canvas, `displayImageData`, `CanvasTexture`, and Color Parser Setup |
| `[x]`  | **2.3** | `setSectorColor`: CSS Color Parsing and Pixel Write                         |
| `[x]`  | **2.4** | `resetSectorColor`, Edge Cases, and Color Mutation Tests                    |
| `[x]`  | **2.5** | Pointer-Drag Pan and `clampPan()`                                           |
| `[x]`  | **2.6** | Scroll-Wheel Zoom, `destroy()` Teardown, and Full Camera/Navigation Tests   |

### Epic 3: Interaction, Public API Facade, and Distribution

> Full spec: `docs/epics/epic-3-interaction-api-distribution.md`

| Status | Task    | Description                                                                           |
| ------ | ------- | ------------------------------------------------------------------------------------- |
| `[x]`  | **3.1** | `MapEngine` Constructor and Event Subscription System (`on` / `off`)                  |
| `[x]`  | **3.2** | `loadMap()`, Lifecycle Guards, `destroy()`, and Pass-Through Methods                  |
| `[x]`  | **3.3** | Picking Pipeline: NDC Conversion, Raycasting, and UV-to-Pixel Mapping                 |
| `[x]`  | **3.4** | Sector Resolution, `PickResult` Construction, and Event Emission                      |
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

### 2026-04-08 — Task 3.4: Sector Resolution, `PickResult` Construction, and Event Emission

**Tasks touched:** 3.4
**Outcome:** completed

**What happened:**
Replaced the `void` stubs in `_handlePointerEvent` with the full steps 5–8: `getSectorAt(pixelX, pixelY)` → hex key; `getSector(hexKey)` → `SectorData | undefined`; miss handling (both empty intersection and undefined getSector) emits `sectorHover` null only if `_lastHexKey !== null`; hit path constructs `PickResult` and emits `sectorHover` (change-detected) or `sectorClick` (unconditional). Added 9 browser-mode picking tests covering: red/green/blue/yellow quadrant hover, change-detection no-op, off-plane null emission, Y-axis inversion validation (blue bottom-left), click pixelX/Y bounds, click on off-plane no-emit, mismatch fixture null, post-destroy listener removal. 124 total tests, all pass.

**Decisions made:**
No deviations from spec.

**Left off at:**
Task 3.5 — Core API Documentation: Quickstart, API Reference, and Asset Contracts. Ready to start.

---

### 2026-04-08 — Task 3.3: Picking Pipeline: NDC Conversion, Raycasting, and UV-to-Pixel Mapping

**Tasks touched:** 3.3
**Outcome:** completed

**What happened:**
Added `THREE.Raycaster` instance (`_raycaster`) to `MapEngine`, created once in the constructor and reused on every pointer event. Replaced the `_handlePointerEvent` no-op stub with the full 4-step picking geometry pipeline: (1) NDC conversion via `getBoundingClientRect()` using `clientX/Y` (not `offsetX/Y` or `canvas.width`); (2) `raycaster.setFromCamera(ndc, renderer.camera)` + `intersectObject(renderer.mesh)`; (3) early return on empty intersection (miss); (4) UV extraction with mandatory Y-inversion and clamping: `pixelX = clamp(floor(uv.x * width), 0, width-1)`, `pixelY = clamp(floor((1-uv.y) * height), 0, height-1)`. Steps 5–8 (sector resolution + event emission) remain as `void` stubs for Task 3.4. Accesses `renderer.camera` and `renderer.mesh` via the existing public `readonly` fields on `MapRenderer`. Used `void this._lastHexKey; void this._emit` to satisfy `noUnusedLocals` until Task 3.4 fills in the emission logic. 115 tests pass, typecheck and build clean.

**Decisions made:**

- Accessed `this._renderer.camera` / `this._renderer.mesh` directly (already public `readonly` on `MapRenderer`) rather than caching separate `_mesh`/`_camera` fields on `MapEngine`.
- Guard `if (!this._renderer || !this._registry || !this._canvas) return` at method entry — listeners are only registered post-load, so this guard is purely defensive.

**Left off at:**
Task 3.4 — Sector Resolution, `PickResult` Construction, and Event Emission. Ready to start.

---

### 2026-04-08 — Task 3.2: `loadMap()`, Lifecycle Guards, `destroy()`, and Pass-Through Methods

**Tasks touched:** 3.2
**Outcome:** completed

**What happened:**
Implemented `loadMap()` with the exact 3-guard check sequence (destroyed → loaded → loading), concurrent `Promise.all` for bitmap parse and JSON fetch, then sequential `SectorRegistry` + `MapRenderer` construction. Stores `_canvas`, `_registry`, `_renderer` on the instance. Registered `pointermove` and `click` picking listeners (bound to a no-op `_handlePointerEvent` stub — logic filled in Task 3.3) and stored bound references for cleanup. Implemented `destroy()` with the 7-step contract including the partial-failure path (no `_destroyed = true` when `_loaded === false`). Added `renderer`/`registry` getters and `getSector`/`getSectorKeys`/`setSectorColor`/`resetSectorColor` pass-throughs with pre-load and post-destroy guards. Wrote 16 new browser-mode tests — 115 total, all pass.

**Decisions made:**

- `_handlePointerEvent` stub uses `void this._lastHexKey; void this._emit` to satisfy `noUnusedLocals` until Task 3.3 fills in the picking logic.
- `getSectorKeys()` added as a pass-through even though not explicitly listed in Task 3.2 spec — it's referenced in the PRD API surface and the 3.5 documentation epic.

**Left off at:**
Task 3.3 — Picking Pipeline: NDC Conversion, Raycasting, and UV-to-Pixel Mapping. Ready to start.

---

### 2026-04-08 — Task 3.1: `MapEngine` Constructor and Event Subscription System

**Tasks touched:** 3.1
**Outcome:** completed

**What happened:**
Added lifecycle flags (`_loaded`, `_destroyed`, `_loading`), `_lastHexKey`, `_parser` (instantiated once in constructor), and `_handlers: Map<string, Set<Function>>` to `MapEngine`. Implemented `on()` with overloaded TypeScript signatures — checks `_destroyed`, creates the handler Set on first use, adds handler. Implemented `off()` with same `_destroyed` guard, performs `Set.delete`. Implemented private `_emit(event, payload)` that iterates the handler Set and calls each function. Remaining stubs (`loadMap`, `destroy`, etc.) reference private fields via `void` expressions to satisfy `noUnusedLocals`. Wrote 9 node-mode tests (constructor, on/off pre-load, \_emit dispatch, off removes only target handler, no-op on unregistered). 99 total tests, all pass.

**Decisions made:**

- Post-destroy guard test for `on()`/`off()` deferred to Task 3.2 integration tests since `destroy()` is not yet implemented; added a placeholder test with a note.

**Left off at:**
Task 3.2 — `loadMap()`, Lifecycle Guards, `destroy()`, and Pass-Through Methods. Ready to start.

---

### 2026-04-08 — Task 2.6: Scroll-Wheel Zoom, `destroy()` Teardown, and Full Camera/Navigation Tests

**Tasks touched:** 2.6
**Outcome:** completed

**What happened:**
Added `_onWheel` bound handler and `_destroyed` guard flag to `MapRenderer`. Registered `wheel` listener with `{ passive: false }` so `preventDefault()` works. Zoom math: `Math.pow(1.1, -deltaY/100)` multiplied into `camera.zoom`, clamped to `[0.5, 20.0]` via `THREE.MathUtils.clamp`, followed by `camera.updateProjectionMatrix()` and `clampPan()`. Updated `destroy()` to remove `wheel` listener and added idempotency guard (`_destroyed` flag returns early on second call). Wrote 7 tests (zoom-in, zoom-out, max clamp, min clamp, clampPan-after-zoom, destroy-no-throw, destroy-idempotent). 90 total tests, all pass.

**Decisions made:**
No deviations from spec.

**Left off at:**
Epic 2 complete. Task 3.1 — `MapEngine` Constructor and Event Subscription System. Ready to start.

---

### 2026-04-08 — Task 2.5: Pointer-Drag Pan and `clampPan()`

**Tasks touched:** 2.5
**Outcome:** completed

**What happened:**
Added `_isDragging`, `_lastPointerPos`, and three bound handler fields (`_onPointerDown`, `_onPointerMove`, `_onPointerUp`) to `MapRenderer`. Registered all three listeners on the canvas in the constructor. `_onPointerMove` applies the world-space scale conversion (`frustumHalfW*2 / clientWidth`) and Y-inversion, then calls `clampPan()`. Implemented `clampPan()` as a public method clamping both axes to `±(dimension/2 + dimension*0.1)`. Updated `destroy()` to `removeEventListener` for all three handlers. Wrote 7 browser-mode tests — 84 total, all pass.

**Decisions made:**
No deviations from spec.

**Left off at:**
Task 2.6 — Scroll-Wheel Zoom, `destroy()` Teardown, and Full Camera/Navigation Tests. Ready to start.

---

### 2026-04-08 — Task 2.4: `resetSectorColor`, Edge Cases, and Color Mutation Tests

**Tasks touched:** 2.4
**Outcome:** completed

**What happened:**
Implemented `resetSectorColor(hexKey)` — same `pixelIndices` guard as `setSectorColor`, iterates indices copying `sourceBuffer[i*4..i*4+2]` into `displayImageData.data`, always writes alpha 255, dirty-rect flushes, sets `texture.needsUpdate = true`. Wrote 9 new browser-mode tests covering: pixel write + adjacent-sector immutability + source buffer immutability for `setSectorColor`; `resetSectorColor` restoration + source buffer immutability; unknown-key `console.warn` for both methods; zero-pixel sector warn; invalid CSS color no-throw. Total: 77 tests, all pass.

**Decisions made:**
No deviations from spec.

**Left off at:**
Task 2.5 — Pointer-Drag Pan and `clampPan()`. Ready to start.

---

### 2026-04-08 — Task 2.3: `setSectorColor`: CSS Color Parsing and Pixel Write

**Tasks touched:** 2.3
**Outcome:** completed

**What happened:**
Implemented `setSectorColor(hexKey, color)` on `MapRenderer`. Guards on `pixelIndices.has(hexKey)` — emits `console.warn` and returns if missing. Parses CSS color via `_colorParserCtx` 1×1 canvas (clearRect → fillStyle → fillRect → getImageData). Iterates `pixelIndices.get(hexKey)`, writing `r, g, b, 255` to `displayImageData.data` at each flat byte offset. Flushes with dirty-rect `putImageData` scoped to `bboxes.get(hexKey)`. Sets `texture.needsUpdate = true`. All 68 tests pass; typecheck and build clean.

**Decisions made:**
No deviations from spec — implementation follows PRD §3 exactly.

**Left off at:**
Task 2.4 — `resetSectorColor`, Edge Cases, and Color Mutation Tests. Ready to start.

---

### 2026-04-08 — Task 2.2: Display Canvas, `displayImageData`, `CanvasTexture`, and Color Parser Setup

**Tasks touched:** 2.2
**Outcome:** completed

**What happened:**
Added `OffscreenCanvas` display buffer (sized `registry.width × registry.height`), `displayCtx`, and `displayImageData` initialized with `registry.sourceBuffer.slice()` (mandatory copy — Task 2.4 verifies immutability). Created 1×1 `_colorParserCanvas`/`_colorParserCtx` for CSS color parsing (used in Task 2.3). Created `THREE.CanvasTexture<OffscreenCanvas>` with `NearestFilter` on both min/mag and `generateMipmaps = false`; assigned to `material.map`. Updated `destroy()` to call `texture.dispose()`. Wrote 5 browser-mode tests — 68 total (up from 62), all pass.

**Decisions made:**

- Field type declared as `THREE.CanvasTexture<OffscreenCanvas>` (not plain `THREE.CanvasTexture`) to avoid TypeScript type mismatch with the OffscreenCanvas argument.
- `_colorParserCtx` is referenced via `void this._colorParserCtx` in the `setSectorColor` stub to satisfy `noUnusedLocals` until Task 2.3 implements it fully.

**Left off at:**
Task 2.3 — `setSectorColor`: CSS Color Parsing and Pixel Write. Ready to start.

---

### 2026-04-08 — Task 2.1: Three.js Scene, Renderer, Camera, Geometry, and Render Loop

**Tasks touched:** 2.1
**Outcome:** completed

**What happened:**
Implemented `MapRenderer` constructor: canvas zero-dimension guard; `THREE.WebGLRenderer` with `antialias: false`, `setPixelRatio`, `setSize(..., false)`; `THREE.Scene`; `THREE.PlaneGeometry(registry.width, registry.height)`; `THREE.MeshBasicMaterial({ map: null, side: DoubleSide })`; `THREE.Mesh` added to scene; `THREE.OrthographicCamera` with "contain" framing (canvasAspect vs bitmapAspect); `camera.position.set(0,0,1)`, `zoom=1.0`, `updateProjectionMatrix()`; continuous `requestAnimationFrame` loop storing `_animFrameId`. Exposed `scene`, `camera`, `mesh`, `renderer`, and `material` as readonly fields. Wrote 14 browser-mode tests — all pass alongside 48 existing tests (62 total). Installed `@types/three` (required for typecheck).

**Decisions made:**

- `setSectorColor`/`resetSectorColor` still throw "Not implemented" — Task 2.3/2.4 implement them.
- `material` exposed as `readonly` field (not private) so Task 2.2 can assign `material.map = texture` from a subclass or the same class.
- `_canvas`, `_registry`, `_frustumHalfW`, `_frustumHalfH` marked `protected` so Tasks 2.5/2.6 can access them in the same class without needing getters.
- `destroy()` partially implemented (cancels rAF, disposes renderer/geometry/material) — texture disposal added in Task 2.6 once texture exists.

**Left off at:**
Task 2.2 — Display Canvas, `displayImageData`, `CanvasTexture`, and Color Parser Setup. Ready to start.

---

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
