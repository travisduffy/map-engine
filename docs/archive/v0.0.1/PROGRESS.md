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

**Phase:** CLOSED — v0.0.1 shipped. All sprint tasks complete; all post-ship maintenance sessions logged.
**Next task:** None — version closed.
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
| `[x]`  | **3.5** | Core API Documentation: Quickstart, API Reference, and Asset Contracts                |
| `[x]`  | **3.6** | Known Limitations, Web Worker Opt-In, Out-of-Scope List, and Bundle Size Verification |

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

### 2026-04-13 — comprehensive versioning reset to v0.0.1

**Tasks touched:** (out-of-cycle — versioning reset, no sprint active)
**Outcome:** completed

**What happened:**

Executed TASK.md: renamed `docs/archive/v1.0.0/` → `docs/archive/v0.0.1/` and applied the following semantic mapping throughout all docs and source comments: `v1`/`v1.0.0` → `v0.0.1`, `v2`/`v2.0` (roadmap/narrative) → `v0.1.0`. Internal PRD review iteration cross-references (`v1.5`, `v1.6`, ..., `v1.9`, `v2.0` changelog/review cycle labels) remapped to Iteration nomenclature (`Iteration 5`, ..., `Iteration 9`, `Final Release Candidate`). RESOLVED DECISIONS table ID column updated (e.g. `(v1.5)` → `(Iteration 5)`). Exception B enumeration sentence updated. No code logic changes.

**Files touched:** `CLAUDE.md`, `README.md`, `docs/PROGRESS.md`, `docs/ROADMAP.md`, `docs/claude-strategy.md`, `src/types.ts`, `src/MapRenderer.ts`, `docs/archive/v0.0.1/PROGRESS.md`, `docs/archive/v0.0.1/epics/epic-1,2,3.md`, `docs/archive/v0.0.1/PRD.md` (+ directory rename).

**Left off at:**
All docs consistent with new versioning. No active sprint.

---

### 2026-04-13 — CA-3 doc cleanup & final lock-in

**Tasks touched:** (out-of-cycle — documentation cleanup, no sprint active)
**Outcome:** completed

**What happened:**

Wrap-up session for CA-3. No code changes. Three actions:

1. **Fixed PROGRESS.md inaccuracy:** The CA-3 follow-up entry incorrectly claimed "Pointer capture added for left button." The final code has no `setPointerCapture` for the left button — outside-release is handled via `(e.buttons & 1) === 0` in `_onPointerMove`. Corrected in place.

2. **Locked in middle-click as canonical pan trigger.** The Linux trackpad limitation (middle-button scroll emulation on e.g. ThinkPad X220 buffers the button press until release, preventing real-time pan without OS-level config change) is confirmed as a user-land concern. No workaround belongs in library code.

3. **Updated ROADMAP.md CA-3 "What Shipped" section** to accurately reflect final decisions: middle-click canonical, no pointer capture for left button, Linux trackpad limitation user-land.

**Decisions made:**

- Middle-click is the locked canonical pan trigger going forward.
- The Linux trackpad emulation caveat stays documented in PROGRESS.md only (not the API docs or ROADMAP blurb) — it is an OS configuration detail, not a library bug.

**Left off at:**
All docs consistent with code. No active sprint.

---

### 2026-04-13 — CA-3 follow-up: left-click drag suppression

**Tasks touched:** (out-of-cycle — CA-3 follow-up, no sprint active)
**Outcome:** completed

**What happened:**

Left-click-and-drag was triggering `sectorHover` during the drag and `sectorClick` on release — the same drag-click contamination pattern as the original CA-3 bug, now on the left button. Fixed by adding an independent left-button drag state machine to `MapRenderer`, completely decoupled from middle-button pan.

**New state fields in `MapRenderer`:**

- `_leftPressed` — left button currently held
- `_leftDragActive` — true once cumulative cursor movement exceeds 4px dead zone
- `_leftHasDragged` — sticky flag: persists past `pointerup` through synthesized `click`
- `_leftDragOrigin` — dead-zone origin (pointerdown position)

**New public getters:**

- `isLeftDragging` — live state; suppresses `sectorHover` in `MapEngine`; future hook for marquee-select rendering
- `leftHasDragged` — sticky; suppresses synthesized `sectorClick` in `MapEngine`

**`_onPointerMove` restructured:** removed the early `if (!this._panPressed) return` guard and replaced with two independent `if` blocks — one for middle-button pan, one for left-button drag tracking. Behaviour of existing pan path is identical.

**No `setPointerCapture` for left button** — would interfere with middle-button pointer capture on Linux. Outside-release instead detected via `(e.buttons & 1) === 0` check in `_onPointerMove`.

**`MapEngine._handlePointerEvent`:**

- Hover branch: `if (isPanning || isLeftDragging) return`
- Click branch: `if (leftHasDragged) return`

**Decisions made:**

- Same 4px dead zone threshold as middle-button pan — consistent feel across all drag gestures.
- `leftHasDragged` resets only on next `pointerdown (button:0)`, not on `pointerup` — same pattern as the sticky flag in the original CA-3 design, required because the browser synthesizes `click` after `pointerup`.
- No changes to `destroy()` — the four existing pointer listeners (`pointerdown/move/up/cancel`) already cover the new handlers.
- `isLeftDragging` named as a future hook: when the engine gets marquee-select, this is the entry point.

**Left off at:**
148 tests passing (14 new). All checks clean (typecheck, typecheck:example, build, test, format).

---

### 2026-04-12/13 — CA-3: input pipeline hardening & game feel

**Tasks touched:** (out-of-cycle — no active sprint; maintenance/improvement track per ROADMAP CA-3)
**Outcome:** completed

**What was implemented:**

**First pass (2026-04-12):** Dead-zone + `_hasDragged` sticky flag, pointer capture, zoom-toward-cursor — all wired to left-button pan. Discovered in browser testing: hover and click events bled into pan gestures because left-button drag and left-button click are fundamentally the same gesture disambiguated only at the event level.

**Pivot (2026-04-13): button separation.** Middle button = pan; left button = hover/click/drag. Separated concerns at the button level so no shared state exists between pan and pick:

- `_panPressed` / `_isPanning` — middle button (button: 1) only. Dead zone (4 CSS px cumulative from `_panOrigin`). Pointer capture fixes stuck-drag on outside release.
- Zoom-toward-cursor on scroll wheel — `camera.position += ndc * frustumHalf * (1/zoomBefore - 1/newZoom)` keeps the world point under the cursor fixed.
- `isPanning` getter — `MapEngine` checks this in `pointermove` to suppress `sectorHover` noise during pan.
- **Left-click drag suppression (same session, separate iteration):** `_leftPressed` / `_leftDragActive` / `_leftHasDragged` — independent state machine. `isLeftDragging` suppresses `sectorHover` during drag; `leftHasDragged` swallows the synthesized `click` after a drag. Outside-release handled via `e.buttons & 1` check in `_onPointerMove` (no pointer capture for left button — avoids interfering with middle-button events on Linux trackpads).
- `isLeftDragging` is the future hook for marquee-select rendering.

**Decisions made:**

- Middle button chosen over right: avoids `contextmenu` suppression complexity and keeps right-click free for future use. Known limitation: Linux trackpads with middle-button scroll emulation (e.g. ThinkPad X220) buffer the press until release, making real-time pan impossible without OS-level config (`EmulateWheelButton 0`). Accepted as user-land concern — code is correct.
- `isPanning` returns `_panPressed` (button held), not `_isPanning` (past dead zone) — hover suppression kicks in the moment the middle button goes down.
- No `setPointerCapture` for left button — avoids input interference on Linux; outside-release instead detected via `e.buttons & 1` in `_onPointerMove`.

**Left off at:**
148 tests passing (14 new). All checks clean (typecheck, typecheck:example, build, test, format). CA-3 marked complete in ROADMAP.md.

---

### 2026-04-11 — responsive canvas: fixed-scale resize via rAF size check

**Tasks touched:** (out-of-cycle — responsiveness bug fix, no sprint active)
**Outcome:** completed

**What happened:**

Addressed a user-reported bug: resizing the browser window distorted the map (squish/stretch). Went through four iterations before landing on the correct approach.

**Iteration 1 — ResizeObserver, synchronous `_handleResize`**
Added a `ResizeObserver` on the canvas that synchronously called `renderer.setSize()` and recomputed the camera frustum using the original "contain" strategy. This eliminated squishing but introduced two problems: (a) a visible "wiggle" on every resize, and (b) the map appeared to zoom in/out because the "contain" recomputation changed how many world units fit on screen.

Root cause of wiggle: calling `renderer.setSize()` sets `canvas.width`, which per the HTML spec clears the WebGL drawing buffer. Even though we re-rendered immediately, there was still a perceptible flash. Root cause of zoom: "contain" recalculates the frustum from scratch based on the new canvas aspect ratio, which changes the scale.

**Iteration 2 — ResizeObserver with rAF drain, proportional frustum**
Changed to storing `_pendingResize` in the ResizeObserver callback and draining it at the top of the rAF render loop, plus switched to proportional frustum scaling (storing `_worldUnitsPerPixel` once at construction, scaling frustum half-dimensions proportionally to canvas size on resize). This preserved the constant world-to-pixel ratio — map appears the same size, viewport just grows/shrinks at the edges.

Still had "very subtle warping stutter." Root cause discovered via web research: `requestAnimationFrame` fires **before** `ResizeObserver` in the HTML spec rendering pipeline (rAF → layout → ResizeObserver → paint). So the "drain in rAF" approach was always exactly one full frame late — the CSS-scaled old buffer was composited before the drain ran.

**Iteration 3 — Locked CSS dimensions, no ResizeObserver**
Removed all resize-reactive code and locked the canvas CSS dimensions via `canvas.style.width/height = initialPx`. This overrides the `width: 100%; height: 100%` CSS rule. Container already had `overflow: hidden`, so the canvas became a fixed-size static asset — browser grows reveals more, browser shrinks crops. Zero wiggle, zero race conditions.

User liked this behaviour exactly but identified a follow-up bug: if the page was loaded at a small window size, then the window was grown larger, the canvas stayed at the initial locked size, cropping pan and zoom.

**Iteration 4 — rAF size check (final, shipped)**
Removed the CSS lock. Instead: check `canvas.clientWidth/clientHeight` at the top of every rAF frame (the canonical webgl2fundamentals.org pattern by Gregg Tavares). If the dimensions changed, `renderer.setSize()` + proportional frustum update + `clampPan()` all happen within the same rAF callback, immediately before `renderer.render()`. The browser composites the correctly-sized, correctly-rendered frame — no intermediate scaled or cleared state is ever painted.

Web research confirmed: modern browsers (post-2015) double-buffer the canvas drawing buffer internally (Mozilla bug 691347), meaning the one-frame clear from `canvas.width` reassignment is no longer visually perceivable. The rAF-internal approach also avoids all ResizeObserver timing ambiguity since no external event handler is involved.

**Decisions made:**

- **No ResizeObserver** — avoided entirely. The rAF loop already runs at 60fps; checking two integer reads (`clientWidth/clientHeight`) per frame is negligible overhead.
- **Proportional frustum (constant `_worldUnitsPerPixel`)** — frustum half-dimensions scale linearly with canvas CSS dimensions. The world-to-pixel ratio is frozen at the initial "contain" computation. The map appears exactly the same pixel size regardless of window dimensions; only the viewport boundary moves.
- **No CSS manipulation by the library** — after the locked-CSS experiment, decided the library should not write `canvas.style.width/height`. CSS sizing is the consumer's responsibility per the existing API contract.
- **`clampPan()` called on resize** — camera position stays valid after frustum change. In practice the clamp limits are generous (bitmap extents + 10%), so this is a no-op for typical usage, but correct to call.
- **`_frustumHalfW`/`_frustumHalfH` made mutable** — changed from `readonly` (they were readonly when fixed at construction) to mutable fields since the rAF loop now updates them on resize.

**Research finding worth preserving:**
HTML spec rendering order within a single frame: rAF callbacks → style/layout → ResizeObserver → paint. This ordering is why any "defer to rAF" approach from ResizeObserver is always one frame late, and why checking size inside rAF itself is the correct pattern.

**Left off at:**
All checks pass (typecheck, typecheck:example, build, test, format). No active sprint. Canvas grows and shrinks with the browser with no visual artifacts.

---

### 2026-04-10 — canonical example app, dev tooling cleanup, and library publishing hygiene

**Tasks touched:** (out-of-cycle — tooling and maintenance, no sprint active)
**Outcome:** completed

**What happened:**
Built `example/` as a permanent fixture of the repo: a vanilla TypeScript Vite app that exercises every public API surface of the library and doubles as the primary browser-based development tool.

Workspace setup: root `package.json` converted to an npm workspace (`"workspaces": ["example"]`). Added `typecheck:example` and `build:example` root scripts. Example's `vite.config.ts` aliases `map-engine → ../src/index.ts` so it runs against library source with HMR — no pre-build required.

Example assets: `example/public/map.png` and `sectors.json` are committed static files — a 320×240 RGB bitmap with 8 adjacent sectors and `sectors.json` with `SectorData` fields (`population`, `capital`, `climate`). Map has no void pixels or internal black borders — sectors tile the full canvas meeting at hard pixel edges, representative of real Paradox-style province bitmaps.

Example UI: two-panel layout (canvas + sidebar). Demonstrates `sectorHover` (transient highlight), `sectorClick` (persistent selection with toggle deselect), `setSectorColor`/`resetSectorColor`, `getSectorKeys`/`getSector`, `registry.bboxes`/`.centroids`/`.pixelIndices`, `on`/`off`, `destroy`/reload, and `toHexKey`. Fixed layout thrash in hover and selected panels using fixed-height skeleton rows. Removed color picker (redundant with selection highlight, caused confusing three-way state).

Dev tooling: dropped `concurrently`. Split the old combined `npm run dev` into two independent scripts: `npm run dev` (vitest watch mode) and `npm run example` (example Vite dev server at localhost:3000). Added `browser.headless: true` and `browser.screenshotFailures: false` to suppress the Playwright browser popup and `test/__screenshots__` artifact generation. Added `server.watch.usePolling: true` for reliable file-watch triggering.

Publishing hygiene (later in the same session): codebase health check identified missing type declarations, missing package.json fields, and dead scaffolding files.

**Type declarations:** The build produced no `.d.ts` output. Added `tsconfig.build.json` extending the root config with `emitDeclarationOnly: true`, `declaration: true`, `declarationMap: true`, `outDir: dist`, `rootDir: src`. Updated build script to `vite build && tsc -p tsconfig.build.json` — declarations emitted after Vite (which empties `dist/` first). Dropped the redundant leading `tsc` from the old build script since `tsconfig.build.json` runs a full type check anyway. Tried `vite-plugin-dts` first but its output landed under `dist/src/` and `rollupTypes: true` produced an empty `export {}` due to a TypeScript 6.x / API Extractor version mismatch; uninstalled in favour of plain `tsc`.

**package.json fields:** Added `"types": "dist/index.d.ts"`, a modern `"exports"` block with `types` and `import` conditions, and `"files": ["dist"]`.

**Dead scaffolding removal:** `src/main.ts`, `src/style.css`, and root `index.html` were leftover Vite project scaffolding never used by any workflow (root `npm run dev` is vitest, not a Vite dev server). Removed all three, which also eliminated the need for the `exclude: ["src/main.ts"]` workaround in `tsconfig.build.json`.

**Decisions made:**

- `file:..` (not `"*"`) as the workspace version specifier — `"*"` hit the npm registry instead of resolving locally.
- `new URL('../src/index.ts', import.meta.url).pathname` in example `vite.config.ts` instead of `path.resolve(__dirname, ...)` to avoid needing `@types/node` in the example.
- `tsconfig.json` `"paths"` entry in the example to mirror the Vite alias so `tsc --noEmit` resolves `map-engine` to source.
- Skeleton rows hardcoded to match the known SectorData shape — acceptable because the example owns its own fixture data.
- Advanced panel (`bbox`, `centroid`, `pixels`) made permanently visible with skeleton, not hidden/shown, to eliminate layout thrash.
- Dropped `concurrently` entirely rather than debugging watch mode interaction between two concurrent Vite servers.
- `declarationMap: true` included in `tsconfig.build.json` — lets consumers "Go to definition" and land in the original `.ts` source.
- CI (#2) and ESLint (#4) deferred per user decision.

**Left off at:**
All checks pass (typecheck, typecheck:example, build, test, format). No active sprint.

---

### 2026-04-08 — Task 3.6: Known Limitations, Web Worker Opt-In, Out-of-Scope List, and Bundle Size Verification

**Tasks touched:** 3.6
**Outcome:** completed

**What happened:**
Appended five new sections to `README.md`: (1) Web Worker opt-in with a code example showing `SectorBitmapParser` + `SectorRegistry` inside a worker and `postMessage` buffer transfer; (2) UV coordinate system note with the `pixelY = Math.floor((1 - uv.y) * height)` inversion formula; (3) Known limitations covering all four PRD-specified risks (memory ~400–500 MB for 8K bitmaps, full `texImage2D` re-upload per `setSectorColor`, `gl.MAX_TEXTURE_SIZE` mobile crash risk, main-thread O(W×H) scan blocking) plus canvas resize, continuous rAF, hover-during-drag, and single-instance constraints; (4) Out-of-scope for v0.0.1 — explicit enumerated list drawn from PRD §"What v0.0.1 Explicitly Does Not Include"; (5) Upgrade paths table mapping each limitation to its v2 mitigation. Also added a Bundle size section confirming 3.78 KB gzipped. All 124 tests pass; typecheck and build clean.

**Decisions made:**
No deviations from spec. Bundle size (3.78 KB) is well under the 15 KB target.

**Left off at:**
All 18 tasks complete. v0.0.1 feature-complete.

---

### 2026-04-08 — Task 3.5: Core API Documentation

**Tasks touched:** 3.5
**Outcome:** completed

**What happened:**
Rewrote `README.md` to satisfy all Phase 6 acceptance criteria 1–10. Added: complete copy-pasteable quickstart (imports `MapEngine`, calls `loadMap`, subscribes `sectorHover`/`sectorClick`, valid TypeScript); explicit bitmap constraints (no anti-aliasing, no blending, no transparency, unique RGB, solid fills); recommended tooling (Aseprite indexed-color, GIMP pencil); violation consequences (null hover flicker at anti-aliased edges); validation warning interpretation; hex key zero-padding table with correct (`"004d99"`) and incorrect (`"4d99"`, `"04d99"`, `"FF0000"`) examples; case-sensitivity note; `getSectorKeys()` with legend-building example; full method-by-method API reference with error conditions; `destroy()` never-throws and idempotency note; `on()`/`off()` pre-load exemption; `loadMap()` partial-failure retry pattern; `sectorHover` null case documented; `@experimental` `borderEdges` with direction label semantics clarification; CORS + `SecurityError` note; void-color optimization advisory.

**Decisions made:**
No deviations from spec. All content drawn directly from PRD Phase 6 scope.

**Left off at:**
Task 3.6 — Known Limitations, Web Worker Opt-In, Out-of-Scope List, and Bundle Size Verification. Ready to start.

---

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

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

_(None yet — populated as implementation proceeds.)_
