# Project Progress

> **This file is the single source of truth for implementation state.**
> Every AI session working on this project must read this file first and update it before closing the session. It is the handoff document between sessions.

---

## How to Use This File

**At the start of a session:**

1. Read this file in full.
2. Check **Current Status** — if it reads `NO ACTIVE SPRINT`, do not begin implementation work. Wait for the user to define the next version.
3. If a sprint is active, find the next incomplete task in the Task Registry.
4. Cross-reference the task's epic file (`docs/epics/`) for the full work spec.
5. Cross-reference `docs/PRD.md` for acceptance criteria and algorithm details.

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

**Phase:** IDLE — v1.0.0 shipped, awaiting next development cycle
**Active version:** None
**Next task:** None — Task Registry is empty; populate `docs/PRD.md` and `docs/epics/` to begin the next cycle
**Blocking issues:** None

---

## Task Registry

<!-- TODO: Populate with epics and tasks when a new development cycle begins. -->
<!-- Format each epic as shown below:

### Epic N: [Epic Title]

> Full spec: `docs/epics/epic-N-[slug].md`

| Status | Task    | Description |
| ------ | ------- | ----------- |
| `[ ]`  | **N.1** | ...         |

-->

_(No active tasks. Populate when the next development cycle begins.)_

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

**Pointer capture** added for left button in `_onPointerDown` — prevents stuck `_leftDragActive` when user releases outside the canvas.

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

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

_(None yet — populated as implementation proceeds.)_
