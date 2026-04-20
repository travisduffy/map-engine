# Project Progress

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

**Phase:** Active — v0.0.2 development in progress
**Active version:** v0.0.2
**Next task:** Task 3.1 — `SectorRegistry.adjacency` and Deprecations
**Blocking issues:** None

---

## Task Registry

### Epic 1: The Frame Hook

> Full spec: `docs/active/epics/epic-1-frame-hook.md`

| Status | Task    | Description                                    |
| ------ | ------- | ---------------------------------------------- |
| `[x]`  | **1.1** | Shared Color Utility and Test Infrastructure   |
| `[x]`  | **1.2** | `MapRenderer` Batching Internals               |
| `[x]`  | **1.3** | `MapEngine` Hook Wiring, Dispatch, and Destroy |
| `[x]`  | **1.4** | Epic 1 Tests and Example App                   |

### Epic 2: The Game Clock

> Full spec: `docs/active/epics/epic-2-game-clock.md`

| Status | Task    | Description                  |
| ------ | ------- | ---------------------------- |
| `[x]`  | **2.1** | `GameClock` Implementation   |
| `[x]`  | **2.2** | Epic 2 Tests and Example App |

### Epic 3: The Adjacency Graph

> Full spec: `docs/active/epics/epic-3-adjacency-graph.md`

| Status | Task    | Description                                 |
| ------ | ------- | ------------------------------------------- |
| `[ ]`  | **3.1** | `SectorRegistry.adjacency` and Deprecations |
| `[ ]`  | **3.2** | `MapEngine.getNeighbors`                    |
| `[ ]`  | **3.3** | Epic 3 Tests and Example App                |

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

### 2026-04-20 — Task 2.2: Epic 2 Tests and Example App

**Tasks touched:** 2.2
**Outcome:** completed

**What happened:**
Created `test/GameClock.test.ts` with 15 tests covering all ACs (2.1a, 2.1b, 2.2–2.9, 2.11–2.14). AC 2.9 uses a fresh engine inline (not the beforeEach engine) to isolate the one-callback assertion. Added `<section id="clock-panel">` to `example/index.html` with tick-counter, clock-speed, and speed control buttons. Updated `example/src/main.ts` to import `GameClock`, create a clock after `loadMap`, register an `onTick` callback updating the UI, wire speed controls, and destroy the clock in `stopEngine`. All 174 tests pass; typecheck and typecheck:example clean.

**Decisions made:**
AC 2.5 split into two `it()` blocks (2.5a cap, 2.5b below-cap) to avoid accumulator carryover between sub-assertions. AC 2.9 keeps fake timers from `beforeEach` (they're already active) and only creates a fresh engine to isolate the one-callback count.

**Left off at:**
Task 2.2 complete. Epic 2 fully done. Next: Task 3.1 — `SectorRegistry.adjacency` and Deprecations.

### 2026-04-20 — Task 2.1: `GameClock` Implementation

**Tasks touched:** 2.1
**Outcome:** completed

**What happened:**
Added `ClockTickCallback` type to `src/types.ts`. Created `src/GameClock.ts` with full implementation: fixed-step accumulator, `MAX_TICKS_PER_FRAME = 10` cap, per-tick snapshot semantics, try/catch around callbacks, `pause`/`resume`/`setSpeed` with `_lastSpeed` invariant, `onTick`/`offTick`, `destroy()`. Exported `GameClock` from `src/index.ts`. Typecheck, build pass; AC 2.14 grep check returns zero matches.

**Decisions made:**
No ambiguities — all implementation details fully specified by epic and PRD.

**Left off at:**
Task 2.1 complete. Next: Task 2.2 — Epic 2 Tests and Example App.

### 2026-04-20 — Post-1.4 example app deviation: pulse tied to selected sector

**Tasks touched:** (no task — out-of-band improvement)
**Outcome:** completed

**What happened:**
Changed `example/src/main.ts` so the hue-cycle pulse (onFrame demo) only fires on the currently selected sector rather than the statically hardcoded first sector. `pulseHexKey` is now set in `onClick` on select and cleared on deselect. `SELECT_COLOR` constant removed — the pulse drives the selected sector's color entirely. Epic 1's "Done when" criterion ("pulsing sector visible at localhost:3000") is still satisfied; the pulse is just interaction-driven rather than unconditional.

**Decisions made:**
No PRD or epic change required for Epic 2 — its AC 2.10 instruction to read the file in full before editing covers the new state. Epic 3 AC 3.10 was updated with an explicit implementation note warning that `selectedHex` is pulsed every frame and neighbor highlights must not be applied to it, and that previous neighbors must be reset carefully to avoid touching `selectedHex`.

**Left off at:**
Example app is in a clean state. Next task: 2.1 — `GameClock` Implementation.

### 2026-04-20 — Task 1.4: Epic 1 Tests and Example App

**Tasks touched:** 1.4
**Outcome:** completed

**What happened:**
Created `test/FrameHook.test.ts` with all 11 ACs (1.1–1.12, 1.10). Updated `example/index.html` to add `<section id="frame-hook-panel">` with `<div id="frame-counter">`. Updated `example/src/main.ts` to register `onFrameTick` via `engine.onFrame()` after `loadMap`, incrementing a live frame counter and pulsing the first sector's color on each frame via `setSectorColor`. Discovered and fixed a bug in `src/internal/color.ts`: `parseColorToRgb` needed `_ctx.fillStyle = '#000000'` before `_ctx.fillStyle = color` so invalid CSS color strings fall back to black rather than the previous valid fillStyle. Also discovered that Three.js `Texture.needsUpdate` is a write-only setter (no getter); AC 1.3 assertion uses `_texture.version` delta instead. All 159 tests pass.

**Decisions made:**

- AC 1.10 grep isolation implemented as a browser test using `fetch('/src/...')` to load source files as text and asserting no forbidden imports — works because Vite serves source files in dev/test mode.
- `_texture.needsUpdate` in Three.js is setter-only; changed AC 1.3 assertion to `expect(renderer['_texture'].version).toBeGreaterThan(versionBefore)`.
- Fixed `parseColorToRgb` to reset fillStyle to `#000000` before each parse; this is what the PRD's AC 1.9 "invalid → black" expectation requires.

**Left off at:**
Task 1.4 complete. Epic 1 fully done. Next: Task 2.1 — `GameClock` Implementation.

### 2026-04-20 — Task 1.3: `MapEngine` Hook Wiring, Dispatch, and Destroy

**Tasks touched:** 1.3
**Outcome:** completed

**What happened:**
Added `_frameCallbacks: FrameCallback[]` and `_inTick: boolean` fields. Implemented `onFrame`/`offFrame`. Rewired `loadMap` to build the hook closure (capturing the `renderer` binding via `let`) before `new MapRenderer(...)` and pass it as the third argument. Updated `setSectorColor` to call `parseColorToRgb` and route through `_patchSectorPixels` when `_inTick`, or the immediate path otherwise. Updated `resetSectorColor` similarly. Updated `destroy()` to prepend `_frameCallbacks = []` and null `_pendingDirtyRect` before `renderer.destroy()`. All 148 tests pass; typecheck and build clean.

**Decisions made:**
The PRD described `destroy()` as having an `if (!this._loaded) return` guard — actual code uses `if (this._destroyed) return` with conditional `_destroyed = true` at the end. Applied the two new prepended steps before the existing renderer destroy, guarded with `if (this._renderer)` for the pendingDirtyRect null — semantically equivalent to the PRD intent.

**Left off at:**
Task 1.3 complete. Next: Task 1.4 — Epic 1 Tests and Example App.

### 2026-04-20 — Task 1.2: `MapRenderer` Batching Internals

**Tasks touched:** 1.2
**Outcome:** completed

**What happened:**
Added `SectorBBox` import. Added three new `@internal public` fields (`_preRenderHook`, `_lastFrameTime`, `_pendingDirtyRect`) and updated the constructor to accept `_preRenderHook: () => void` as a third required parameter. Added the `if (this._preRenderHook) this._preRenderHook()` call as the first statement of the rAF loop. Implemented `_patchSectorPixels`, `_patchSectorPixelsFromSource`, and `_flushPendingDirty`. Updated `destroy()` to null both new fields after `cancelAnimationFrame`. Typecheck produces exactly one expected error (MapEngine.ts new MapRenderer call missing third arg); all 148 tests pass.

**Decisions made:**
No ambiguities — all implementation details were fully specified.

**Left off at:**
Task 1.2 complete. Next: Task 1.3 — `MapEngine` Hook Wiring, Dispatch, and Destroy.

### 2026-04-20 — Task 1.1: Shared Color Utility and Test Infrastructure

**Tasks touched:** 1.1
**Outcome:** completed

**What happened:**
Added `FrameCallback` type to `src/types.ts`. Created `src/internal/color.ts` with module-scope OffscreenCanvas singleton and `parseColorToRgb`. Removed `_colorParserCanvas`/`_colorParserCtx` from `MapRenderer` and updated `setSectorColor` to use the shared utility. Created `test/testUtils.ts` exporting `makeCanvas`, `advanceFrame`, and `buildTestBuffer`. Removed the local `makeCanvas` definition from `test/MapEngine.test.ts` and replaced with import from `./testUtils`.

**Decisions made:**
No ambiguities — all implementation details were fully specified by the epic and PRD.

**Left off at:**
Task 1.1 complete. Next: Task 1.2 — `MapRenderer` Batching Internals.

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

- **`Texture.needsUpdate` is write-only in Three.js** — reading it returns `undefined`. Tests that need to verify a texture flush should assert `_texture.version` delta instead.
- **`parseColorToRgb` needs explicit fillStyle reset** — `clearRect` alone does not reset the fillStyle; calling `_ctx.fillStyle = '#000000'` before `_ctx.fillStyle = color` is required so invalid CSS strings fall back to black rather than the previous valid color.
- **AC 1.10 grep isolation in browser tests** — use `fetch('/src/FileName.ts')` to load source files as text in Vitest browser mode; Vite serves them from the dev server.
