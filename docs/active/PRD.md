# PRD: map-engine v0.0.2

> **Status:** DRAFT — In Development. This document is not finalized. Content is subject to change before the development cycle begins.
> **Audience:** Implementation engineers, AI coding agents
> **Source CAs:** CA-1 (The Frame Hook), CA-9 (Game Clock), CA-2 (Adjacency Graph) — see `docs/ROADMAP.md` for full capability sketches

---

> **DRAFT NOTICE:** This PRD is a working draft. Sections marked `<!-- TODO -->` are
> incomplete and must be resolved before implementation begins. Do not treat this document
> as an implementation authority until the Status above reads "Active." If you are an AI
> agent reading this: stop and inform the user that the PRD is not yet finalized.

---

## PROJECT OVERVIEW

### What This Is

v0.0.2 extends the v0.0.1 engine with three orthogonal primitives:

1. **The Frame Hook (CA-1):** A synchronization hook that fires at the top of every render frame, giving consumers a guaranteed pre-render callback boundary. Enables frame-coherent batching of `setSectorColor` calls and eliminates redundant dirty-rect flushes.

2. **The Game Clock (CA-9):** A standalone, speed-configurable, pausable clock that advances in discrete units of game time (ticks). Driven internally by the Frame Hook accumulator pattern. Fires `onTick` callbacks at a consistent rate independent of render frame rate — the correct primitive for grand strategy simulation logic.

3. **The Adjacency Graph (CA-2):** A queryable, bidirectional, deduplicated neighbor map (`SectorRegistry.adjacency`) built during the existing O(W×H) constructor scan. Closes the gap between raw `borderEdges` data and a usable topology API for consumer game logic.

None of these features add visual complexity, break existing API surfaces, or introduce new dependencies. All are clean additions to existing module boundaries.

### Goals

- Ship `onFrame` / `offFrame` on `MapEngine` with the frame-coherent batching path for `setSectorColor`.
- Ship `GameClock` as a standalone export: speed-configurable, pausable, driven by the Frame Hook accumulator, firing `onTick` callbacks at a consistent rate decoupled from frame rate.
- Ship `SectorRegistry.adjacency` and `MapEngine.getNeighbors` with the correct bidirectionality and deduplication semantics.
- Deprecate `SectorRegistry.borderEdges` (retain; add `@deprecated` JSDoc).
- Each merged change must pass: `npm run typecheck` (zero type errors), `npm run build` (clean library output), `npm run test` (full test suite passing), and `npm run typecheck:example` (example workspace zero type errors). All four commands exist in v0.0.1's root `package.json` — this PRD adds no new scripts.

### Non-Goals

- `SpatialGraph` pathfinding (CA-4) — requires CA-2 first; scoped to a future version.
- GPU palette / map modes (CA-7) — requires CA-1 first; scoped to a future version.
- Hierarchical aggregation (CA-5), perimeter rendering (CA-6), spatial anchoring (CA-8) — all icebox.
- Calendar / date system built into `GameClock` — elapsed tick count is the primitive; date math is user-land.
- Web Worker offloading of `SectorBitmapParser` / `SectorRegistry`.
- Any changes to the picking pipeline, pan/zoom, or canvas resize strategy.
- Render-on-demand (rAF loop remains always-running).
- Touch, keyboard, or gamepad input.

---

## ARCHITECTURE

### Module Ownership

| Feature               | Module(s) Modified                                                                   |
| --------------------- | ------------------------------------------------------------------------------------ |
| CA-1: The Frame Hook  | `MapEngine` (hook surface), `MapRenderer` (hook execution point)                     |
| CA-9: Game Clock      | New `GameClock` class (standalone export, wires into `MapEngine.onFrame` internally) |
| CA-2: Adjacency Graph | `SectorRegistry` (new `adjacency` field), `MapEngine` (new `getNeighbors` method)    |

### Architectural Principles — No Violations

The following principles are non-negotiable constraints from `docs/ROADMAP.md §Architectural Principles`. Every change must comply with all of them. If a proposed design violates one, the design changes — not the principle.

| #       | Principle                                                                                                                | Rationale                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **P-1** | `SectorRegistry` has zero Three.js imports.                                                                              | It must be Worker-safe.                                                                 |
| **P-2** | `SectorBitmapParser` and `SectorRegistry` have zero DOM dependencies.                                                    | Worker-safe contract.                                                                   |
| **P-3** | `MapRenderer` and `MapEngine` are main-thread only.                                                                      | They touch WebGL and the DOM.                                                           |
| **P-4** | The engine never owns game state.                                                                                        | It synchronizes visuals; it does not simulate.                                          |
| **P-5** | New spatial data structures built inside `SectorRegistry` are computed during the existing O(W×H) constructor scan pass. | A second full-bitmap scan is never acceptable.                                          |
| **P-6** | The public API surface grows conservatively.                                                                             | Every export is a maintenance contract.                                                 |
| **P-7** | `three` is always an external peer dependency.                                                                           | Size budget: <15 KB gzipped.                                                            |
| **P-8** | New modules are composable, not invasive.                                                                                | Prefer a new class that takes an existing one as input over modifying existing classes. |

**How each principle applies to this release:**

- **P-1 / P-2:** `SectorRegistry` continues to have zero Three.js imports and zero DOM dependencies.
- **P-5:** The adjacency map is built during the existing O(W×H) scan. No second pass.
- **P-6:** New top-level named exports from `src/index.ts`: `GameClock`. New types exported via `src/index.ts` (which uses `export type * from './types'`, making all `types.ts` symbols top-level): `FrameCallback`, `ClockTickCallback`. New methods on existing classes: `onFrame`, `offFrame` on `MapEngine`; `getNeighbors` on `MapEngine`. New field on existing class: `adjacency` on `SectorRegistry`. No speculative additions.
- **P-4:** `GameClock` does not own game state. It fires callbacks; all state management is consumer responsibility.
- **P-7:** `three` remains external. No new peer dependencies.
- **P-8:** Composable additions — no invasive changes to existing module responsibilities.

### v0.0.1 Source Reference

**This PRD assumes the implementing agent has read access to the v0.0.1 source at `src/`.** All fields and methods referenced below exist in v0.0.1 and are named exactly as listed here.

**Fields:**

| Field / Method     | Location         | Type                                   | Notes                                                                                     |
| ------------------ | ---------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `displayImageData` | `MapRenderer`    | `ImageData`                            | Mutable display image data; initialized as a slice of `registry.sourceBuffer`             |
| `displayCtx`       | `MapRenderer`    | `OffscreenCanvasRenderingContext2D`    | 2D context of the display OffscreenCanvas; `putImageData` is called on this               |
| `_texture`         | `MapRenderer`    | `THREE.CanvasTexture<OffscreenCanvas>` | Private; set `_texture.needsUpdate = true` to trigger GPU re-upload                       |
| `_loaded`          | `MapEngine`      | `boolean`                              | Private; `false` until `loadMap()` completes successfully; stays `true` after `destroy()` |
| `_destroyed`       | `MapEngine`      | `boolean`                              | Private; `false` until `destroy()` is called (only set when `_loaded === true`)           |
| `_registry`        | `MapEngine`      | `SectorRegistry \| null`               | Private; null until `loadMap()` completes                                                 |
| `_renderer`        | `MapEngine`      | `MapRenderer \| null`                  | Private; null until `loadMap()` completes                                                 |
| `registry`         | `MapEngine`      | `SectorRegistry`                       | **Public getter** (already exists in v0.0.1); throws if destroyed or not loaded           |
| `_sectorMap`       | `SectorRegistry` | `Map<string, SectorData>`              | Private; fully populated from definition file before the pixel scan begins                |
| `pixelIndices`     | `SectorRegistry` | `Map<string, Uint32Array>`             | Flat pixel indices per sector                                                             |
| `bboxes`           | `SectorRegistry` | `Map<string, SectorBBox>`              | Bounding box per sector                                                                   |
| `sourceBuffer`     | `SectorRegistry` | `Uint8ClampedArray`                    | Pristine original pixel buffer; never mutated after construction                          |

**`SectorBBox` shape** (from `types.ts`): `{ minX: number, minY: number, maxX: number, maxY: number }` — all bounds are **inclusive** pixel coordinates.

**Methods (existing v0.0.1 implementations — referenced in §1.4):**

| Method             | Location      | Signature                               | Current behavior (v0.0.1)                                                                                                                                                                                                         |
| ------------------ | ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setSectorColor`   | `MapEngine`   | `(hexKey: string, color: string): void` | Guard checks (`_destroyed`, `_loaded`), then delegates to `_renderer!.setSectorColor(hexKey, color)`                                                                                                                              |
| `resetSectorColor` | `MapEngine`   | `(hexKey: string): void`                | Guard checks, then delegates to `_renderer!.resetSectorColor(hexKey)`                                                                                                                                                             |
| `setSectorColor`   | `MapRenderer` | `(hexKey: string, color: string): void` | Parses CSS `color` string via a 1×1 `OffscreenCanvas`; writes `r, g, b` to all `pixelIndices` pixels in `displayImageData.data`; flushes dirty rect immediately via `displayCtx.putImageData`; sets `_texture.needsUpdate = true` |
| `resetSectorColor` | `MapRenderer` | `(hexKey: string): void`                | Reads original `r, g, b` from `_registry.sourceBuffer` at each flat pixel index; writes to `displayImageData.data`; flushes dirty rect immediately; sets `_texture.needsUpdate = true`                                            |

> **Note on `registry` getter:** `engine.registry` already exists in v0.0.1 in `MapEngine`. No new public accessor needs to be added. `engine.registry.adjacency` is the primary access path for the full adjacency map.

> **MapRenderer color parser (v0.0.1 → v0.0.2 migration):** `MapRenderer` in v0.0.1 owns `_colorParserCanvas: OffscreenCanvas` and `_colorParserCtx: OffscreenCanvasRenderingContext2D` for CSS color parsing. v0.0.2 extracts this logic to the shared `src/internal/color.ts` singleton. Remove `_colorParserCanvas` and `_colorParserCtx` from `MapRenderer` as part of the CA-1 implementation — they are replaced by `parseColorToRgb`.

### Source File Map

| Class / Symbol          | File                        |
| ----------------------- | --------------------------- |
| `MapEngine`             | `src/MapEngine.ts`          |
| `MapRenderer`           | `src/MapRenderer.ts`        |
| `SectorRegistry`        | `src/SectorRegistry.ts`     |
| `SectorBitmapParser`    | `src/SectorBitmapParser.ts` |
| `GameClock` (new)       | `src/GameClock.ts`          |
| `parseColorToRgb` (new) | `src/internal/color.ts`     |
| `toHexKey`              | `src/utils.ts`              |
| Types                   | `src/types.ts`              |
| Public entry point      | `src/index.ts`              |

**`src/index.ts` re-export:** `export type * from './types'` is confirmed present on line 1 of v0.0.1's `src/index.ts`. No action needed — `FrameCallback` and `ClockTickCallback` will become top-level exports automatically.

**Pre-load guard pattern (confirmed v0.0.1 behavior):** `MapEngine` guards all state-dependent methods via two private boolean flags — both confirmed to exist as explicit fields in v0.0.1:

1. `if (this._destroyed) throw new Error('MapEngine: destroyed')` — checked first
2. `if (!this._loaded) throw new Error('MapEngine: not loaded — call loadMap() first')` — checked second

`getNeighbors` must follow this exact two-check pattern. Do not use null-checks on `_registry`/`_renderer` as the guard — use the boolean flags.

**`toHexKey` location (confirmed v0.0.1):** `toHexKey` lives in `src/utils.ts` and is already exported from `src/index.ts` via `export { toHexKey } from './utils'`. Do not re-implement.

---

## CORE FUNCTIONALITY

### 1. CA-1: The Frame Hook (Pre-Render Callback)

#### 1.1 New Type

```typescript
// In types.ts — new export
// dt is elapsed wall-clock seconds since the previous frame (e.g. 0.01667 at 60fps).
// On the very first rAF frame after loadMap() completes, dt === 0.
// On all subsequent frames, dt is elapsed wall-clock seconds since the previous frame,
// regardless of when a given callback was registered via onFrame.
type FrameCallback = (dt: number) => void
```

#### 1.2 New `MapEngine` Methods

```typescript
onFrame(callback: FrameCallback): void
offFrame(callback: FrameCallback): void
```

**`onFrame` behavior:**

- Appends `callback` to `_frameCallbacks: FrameCallback[]` — a flat ordered array on `MapEngine`. Not routed through the existing `_handlers` Set system; frame callbacks must fire in registration order, and `Set<Function>` does not guarantee order.
- Respects the destroyed-guard: if `MapEngine` has been destroyed, `onFrame` is a no-op (consistent with the existing `on` / `off` guard pattern).
- **Pre-load behavior:** If called before `loadMap()` has completed, `onFrame` is allowed and appends `callback` to `_frameCallbacks`. Callbacks begin firing on the first rAF frame once the renderer is running. No callbacks fire before `loadMap()` completes and the rAF loop starts.

**`offFrame` behavior:**

- Splices `callback` from `_frameCallbacks` by reference equality (`===`). If the callback is not registered, no-op.
- Respects the destroyed-guard.

**Callback firing semantics:**

- All registered `FrameCallback`s fire **synchronously**, in registration order, at the **top of every rAF frame** — before `renderer.render(this.scene, this.camera)`.
- `dt` is elapsed wall-clock seconds since the previous frame. Computed as `(now - renderer._lastFrameTime) / 1000`. On the very first frame after `loadMap`, `dt === 0` because `_lastFrameTime` initializes to `0`. Subsequent frames receive actual elapsed time regardless of when their `onFrame` registration occurred.
- The frame hook fires every frame regardless of whether any callbacks are registered (the pre-render hook is always wired once `loadMap` completes).

**Snapshot and concurrent-mutation semantics:**

- When firing callbacks, iterate over a snapshot (`[...this._frameCallbacks]`). This means:
  - Callbacks added via `onFrame` during iteration start firing on the **next frame**, not the current one.
  - Callbacks removed via `offFrame` during iteration **will still fire** in the current frame if their snapshot slot has not yet been reached. They will not fire on subsequent frames.
  - A callback that calls `offFrame(otherCb)` during iteration does not prevent `otherCb` from firing in the current frame if `otherCb` is later in the snapshot — `otherCb` will not fire on subsequent frames.

#### 1.3 `MapRenderer` Changes

**New field:** `_preRenderHook: (() => void) | null`

- Initialized to `null` in the constructor.
- Called as the **first statement** in the rAF callback, before any other per-frame work (camera updates, resize checks). The `performance.now()` timestamp is captured inside the hook closure itself — the rAF callback simply calls `_preRenderHook()` with no preceding work.
- Wired by `MapEngine.loadMap()` immediately after `new MapRenderer(...)` — before the renderer's first frame fires. This is safe because `MapRenderer`'s constructor schedules the rAF loop via `requestAnimationFrame` but does not invoke it synchronously; the first rAF callback fires on the next event-loop turn at earliest, after `loadMap()` has assigned `_preRenderHook`. **Do not alter `MapRenderer`'s constructor to fire the first frame synchronously**, as this would break the wiring guarantee.
- Set back to `null` in `MapRenderer.destroy()`.

**New field:** `_lastFrameTime: number`

- Lives on `MapRenderer`. Initialized to `0`.
- Written by the pre-render hook closure in `MapEngine.loadMap()` via `renderer._lastFrameTime = now`.
- Updated each frame after the pre-render hook fires and before `renderer.render()`.

**New field:** `_pendingDirtyRect: SectorBBox | null`

- Initialized to `null`.
- Accumulates the union of all dirty bounding boxes written during a frame via `_patchSectorPixels`.
- Cleared to `null` by `_flushPendingDirty()` after each consolidated flush.

**New internal method:** `_patchSectorPixels(hexKey: string, r: number, g: number, b: number): void`

- Writes `r`, `g`, `b` values directly into `displayImageData.data` for every flat pixel index in `pixelIndices.get(hexKey)`.
- Unions the sector's bbox into `_pendingDirtyRect`:
  - If `_pendingDirtyRect` is null: set it to `{ ...bboxes.get(hexKey) }` (copy the sector's bbox).
  - If already set: expand with `Math.min`/`Math.max` on each of the four fields (`minX`, `minY`, `maxX`, `maxY`).
- Does **not** call `putImageData`. Does **not** set `_texture.needsUpdate`. Pixel data is staged; flush is deferred.
- If `hexKey` is not in `pixelIndices`, no-op.

**New internal method:** `_flushPendingDirty(): void`

- If `_pendingDirtyRect` is null, no-op (nothing staged).
- Otherwise: call `displayCtx.putImageData` with the dirty-rect overload, then set `_texture.needsUpdate = true`, then set `_pendingDirtyRect = null`. The exact call, given `SectorBBox = {minX, minY, maxX, maxY}` with **inclusive** bounds:
  ```typescript
  displayCtx.putImageData(
    displayImageData,
    0,
    0,
    _pendingDirtyRect.minX,
    _pendingDirtyRect.minY,
    _pendingDirtyRect.maxX - _pendingDirtyRect.minX + 1, // inclusive → +1 for width
    _pendingDirtyRect.maxY - _pendingDirtyRect.minY + 1 // inclusive → +1 for height
  )
  ```
  This matches the existing dirty-rect call pattern in v0.0.1 `MapRenderer.setSectorColor`.

**Access modifier note:** `_preRenderHook`, `_lastFrameTime`, `_pendingDirtyRect`, `_patchSectorPixels`, and `_flushPendingDirty` are declared **`public`** on `MapRenderer` with `@internal` JSDoc tags. This allows `MapEngine` to access them directly without bracket-notation workarounds or `// @ts-ignore`. They are not part of the documented public library interface — by convention, symbols tagged `@internal` are excluded from the public API surface — but TypeScript's access modifier treats them as public. Do not mark them `private` or `protected`.

#### 1.4 Batching Coordination (`MapEngine`)

**New field:** `_inTick: boolean` — lives on `MapEngine`.

- Set to `true` immediately before firing frame callbacks.
- Set to `false` immediately after all callbacks return.
- Used by `MapEngine.setSectorColor` / `MapEngine.resetSectorColor` to select the dispatch path.

**Shared color parsing utility:**

Extract `parseColorToRgb(color: string): { r: number; g: number; b: number }` to `src/internal/color.ts`. This utility uses a **module-level singleton** 1×1 `OffscreenCanvas` and its 2D context — allocated once at module load, reused on every call. Allocating a new `OffscreenCanvas` per call is unacceptable in the hot path (a tick firing 100 `setSectorColor` calls would otherwise create 100 canvas allocations per frame).

`src/internal/color.ts` must carry a top-of-file JSDoc: `/** @main-thread-only — uses OffscreenCanvas; do not import from SectorRegistry or SectorBitmapParser */`. AC 3.9's grep must additionally verify `SectorRegistry.ts` does not import `./internal/color` or any file that transitively does.

**Silent fallback for invalid colors:** `parseColorToRgb` inherits v0.0.1's parsing behavior — invalid CSS strings silently produce `{ r: 0, g: 0, b: 0 }` (black) per the browser's `CanvasRenderingContext2D.fillStyle` fallback. No error is thrown. This is parity with v0.0.1; no behavioral change.

`MapEngine.setSectorColor` calls `parseColorToRgb(color)` once before the `_inTick` dispatch check. `MapRenderer.setSectorColor` is updated to call `parseColorToRgb` instead of its existing `_colorParserCanvas`/`_colorParserCtx` approach (see migration note in v0.0.1 Source Reference). The `MapRenderer.setSectorColor` public method signature **does not change** — it remains `(hexKey: string, color: string): void`; it now delegates color parsing to the shared utility.

**`MapEngine.setSectorColor` dispatch logic (updated):**

`color` is a CSS color string (type `string`), identical to the v0.0.1 signature. `MapEngine.setSectorColor` calls `parseColorToRgb(color)` to get `{r, g, b}` before the dispatch check:

```
const { r, g, b } = parseColorToRgb(color)
if (_inTick):
    call _renderer._patchSectorPixels(hexKey, r, g, b)   // staged write, no flush
else:
    call _renderer.setSectorColor(hexKey, color)           // immediate flush (unchanged)
```

**`MapEngine.resetSectorColor` dispatch logic (updated):**

- Same pattern: if `_inTick`, read the original `r, g, b` for each flat pixel index from `this._registry.sourceBuffer` (the pristine original pixel buffer — `sourceBuffer[offset]`, `sourceBuffer[offset+1]`, `sourceBuffer[offset+2]`) and stage via `_patchSectorPixels`; otherwise call `_renderer.resetSectorColor(hexKey)` immediately.

**Pre-render hook closure (wired in `loadMap`):**

`_inTick` is a private field on `MapEngine`. `_lastFrameTime` is a private field on `MapRenderer`, written by the pre-render hook closure via `renderer._lastFrameTime = now`.

```typescript
// The function assigned to _preRenderHook must be an arrow function or explicitly bound.
// Factoring the body into a MapEngine private method (e.g. this._onPreRender(dt)) called
// from the arrow is acceptable. A plain standalone function declaration is not — `this`
// would be unbound.
renderer._preRenderHook = () => {
  const now = performance.now()
  const dt =
    renderer._lastFrameTime === 0 ? 0 : (now - renderer._lastFrameTime) / 1000
  renderer._lastFrameTime = now

  this._inTick = true
  try {
    for (const cb of [...this._frameCallbacks]) {
      try {
        cb(dt)
      } catch (err) {
        console.error('[map-engine] FrameCallback threw:', err)
      }
    }
  } finally {
    this._inTick = false
    renderer._flushPendingDirty()
  }
  // renderer.render(...) follows immediately in the rAF loop
}
```

**Exception and `_inTick` safety:** `_inTick` is always reset to `false` in the `finally` block — even if a callback throws — so subsequent imperative `setSectorColor` calls are never stuck routing to the batched path. `_flushPendingDirty()` likewise always runs in `finally`, ensuring any staged pixel writes from completed callbacks are committed even when a later callback throws.

**Destroy-during-tick semantics:**

If `engine.destroy()` is called from within a frame callback (i.e., while `_inTick === true`):

- The remaining callbacks in the current snapshot continue to fire (the snapshot iteration is not aborted mid-loop).
- `engine.destroy()` executes **synchronously in its entirety** within the callback: (1) sets `renderer._pendingDirtyRect = null` (discards pending dirty state), (2) calls `renderer.destroy()` which cancels the rAF loop and disposes Three.js resources, (3) nulls `this._registry`, `this._renderer`, `this._canvas`, (4) sets `this._destroyed = true`. No steps are deferred.
- The `finally` block still executes correctly because the pre-render hook closure holds `renderer` as a **local variable** — it does not go through `this._renderer`. `renderer._flushPendingDirty()` is called, finds `_pendingDirtyRect === null`, and returns immediately. The staged pixel writes from before the destroy are **discarded**.
- Subsequent callbacks in the same snapshot that call `setSectorColor` or `resetSectorColor` after `engine.destroy()` hit the `_destroyed` guard, which **throws `'MapEngine: destroyed'`** (confirmed v0.0.1 behavior). This throw is caught by the per-callback `try/catch`, logged via `console.error`, and iteration continues.
- `_frameCallbacks` is cleared (`this._frameCallbacks = []`) as part of `engine.destroy()` teardown, releasing references. In the destroy-during-tick path this happens synchronously within the `engine.destroy()` call — the snapshot taken before the loop is unaffected.
- After the `finally` block completes, no further rAF frames run.
- Tests must cover this path (see AC 1.8).

#### 1.5 Constraints

- Callbacks are never re-ordered. `offFrame` splices in place; `onFrame` appends.
- A callback may call `offFrame(itself)` during execution — the splice must not corrupt the in-progress iteration. Iterate over a snapshot (`[...this._frameCallbacks]`) when firing.
- The frame hook is not a message queue. It fires on every frame, even with zero registered callbacks and zero pending dirty state.
- `setSectorColor` / `resetSectorColor` called **outside** a frame callback continue to flush immediately — no behavioral change for existing consumers who do not use `onFrame`.
- `engine.destroy()` clears `_frameCallbacks = []` as part of teardown, releasing references to user callbacks. In the destroy-during-tick path (§1.4), this clear happens synchronously inside `engine.destroy()` — the snapshot already captured before the loop is unaffected.

---

### 2. CA-9: Game Clock

#### 2.1 New Types

```typescript
// In types.ts — new exports

// Callback fired on each discrete clock tick. elapsed is the total number of
// ticks fired since this GameClock was constructed (monotonically increasing integer).
type ClockTickCallback = (elapsed: number) => void
```

#### 2.2 New `GameClock` Class

```typescript
// New top-level named export from src/index.ts
// Runs on whichever thread MapEngine.onFrame fires on — currently the main thread
// as a consequence of MapEngine's threading model (P-3). GameClock itself has
// zero imports from Three.js or DOM APIs.
class GameClock {
  constructor(engine: MapEngine, options?: { ticksPerSecond?: number })

  setSpeed(multiplier: number): void // 0 = paused; positive = speed factor; negative: no-op / clamp to 0
  pause(): void // sugar for setSpeed(0); records last non-zero speed for resume()
  resume(): void // restores the last non-zero speed; no-op if already running

  onTick(callback: ClockTickCallback): void
  offTick(callback: ClockTickCallback): void

  readonly paused: boolean // true when speed === 0
  readonly speed: number // current multiplier (0 when paused)
  readonly elapsed: number // total ticks fired since construction

  destroy(): void // unregisters from engine.onFrame; subsequent calls are no-ops
}
```

**Source location:** Create `src/GameClock.ts`. Export from `src/index.ts` via `export { GameClock } from './GameClock'`.

**Constructor behavior:**

- `ticksPerSecond` defaults to `1` (one game tick per real second at speed 1×).
- `ticksPerSecond` must be a **finite positive number**. Values `≤ 0`, non-finite (`Infinity`, `-Infinity`), or `NaN` throw a `TypeError` in the constructor with message `'GameClock: ticksPerSecond must be a finite positive number'`. Fractional values are permitted (e.g., `0.5` = one tick every 2 real seconds at speed 1×).
- Registers one internal callback with `engine.onFrame(internalFrameCallback)` immediately on construction.
- `speed` initializes to `1`. `elapsed` initializes to `0`. `paused` initializes to `false`.
- If `engine` has already been destroyed at construction time, `GameClock` is inert — `onFrame` registration is a no-op, no callbacks will ever fire.

#### 2.3 Accumulator Algorithm

The internal frame callback implements a standard fixed-step accumulator:

```typescript
// Module-scope constant in the GameClock file — not exported, not a class field.
// Test by calling advanceFrame(renderer, 11000 / ticksPerSecond) and asserting
// exactly 10 ticks fire and clock['_accumulator'] is toBeCloseTo(0, 10) afterward.
const MAX_TICKS_PER_FRAME = 10 // spiral-of-death guard

// internal state (private fields on GameClock):
// _accumulator: number = 0
// _speed: number = 1
// _elapsed: number = 0
// _lastSpeed: number = 1   (for resume())
// _intervalSeconds: number = 1 / ticksPerSecond

internalFrameCallback = (dt: number) => {
  if (this._speed === 0) return // paused — skip accumulation entirely

  this._accumulator += dt * this._speed

  let ticks = 0
  while (
    this._accumulator >= this._intervalSeconds &&
    ticks < MAX_TICKS_PER_FRAME
  ) {
    this._accumulator -= this._intervalSeconds
    this._elapsed++
    for (const cb of [...this._tickCallbacks]) cb(this._elapsed)
    ticks++
  }

  // If the cap was hit, discard remaining accumulated time to avoid
  // a burst of catch-up ticks on the next frame after a lag spike.
  if (ticks === MAX_TICKS_PER_FRAME) {
    this._accumulator = 0
  }
}
```

**Key semantics:**

- `dt` comes from the `onFrame` callback; no additional time source. The clock is entirely derived from the render loop wall-clock.
- Multiple ticks can fire in a single frame if `dt` is large (e.g., tab was backgrounded, or speed is very high).
- **Each tick fired within a single frame takes its own snapshot of `_tickCallbacks`** (the `[...this._tickCallbacks]` spread inside the `while` loop). A callback that calls `offTick(itself)` during tick N will not fire for tick N+1 within the same frame.
- If a `ClockTickCallback` throws, the exception is caught, logged via `console.error('[map-engine] ClockTickCallback threw:', err)`, and iteration continues with the next callback in the snapshot. The accumulator and `_elapsed` continue advancing normally.
- `MAX_TICKS_PER_FRAME = 10` is a module-scope constant — not exported, not a constructor option in this version.
- When `speed === 0`, the accumulator is frozen. Accumulated partial progress from before pausing is preserved and resumes when unpaused.
- `elapsed` is the authoritative tick counter passed to callbacks; the consumer derives their game date from it.
- **Floating-point note:** Accumulator comparisons in production code use `>=` directly — FP errors in the sub-nanosecond range do not affect tick count in practice. Tests asserting `_accumulator` state should use `expect(clock['_accumulator']).toBeCloseTo(0, 10)` (or equivalent tolerance) rather than strict `=== 0`, unless the test values are exact in binary floating point (e.g., integer millisecond amounts that are powers of 2 or small integers).

#### 2.4 `setSpeed` / `pause` / `resume` Behavior

- `setSpeed(n)`: clamps `n` to `[0, ∞)`. Negative values treated as `0`. Updates `_speed`. If `n > 0`, also updates `_lastSpeed = n`.
- `pause()`: if already paused, no-op. Otherwise: `_lastSpeed = _speed`, `_speed = 0`.
- `resume()`: if not paused, no-op. Otherwise: `_speed = _lastSpeed` (which is always `> 0` by invariant).

**`_lastSpeed` invariant:** `_lastSpeed` always holds the most recent strictly-positive speed. It is never set to `0`. **Proof:** `_lastSpeed` initializes to `1`. `setSpeed(n)` updates `_lastSpeed` only when `n > 0`. `pause()` updates `_lastSpeed = _speed` only when `_speed > 0` (the "already paused" guard returns early otherwise). No code path sets `_lastSpeed` to `0`. Therefore `_lastSpeed > 0` holds at all times — do not add a defensive guard against `_lastSpeed === 0`, it is dead code.

#### 2.5 `onTick` / `offTick` Behavior

- Same pattern as `onFrame` / `offFrame` on `MapEngine`: flat ordered array `_tickCallbacks: ClockTickCallback[]`.
- `onTick` appends; `offTick` splices by reference equality.
- Both are no-ops if the clock has been destroyed.
- Iteration snapshots the array (`[...this._tickCallbacks]`) so a callback may safely call `offTick(itself)` during execution.

#### 2.6 `destroy()` Behavior

- Calls `engine.offFrame(internalFrameCallback)` to stop the accumulator.
- Clears `_tickCallbacks` to release references.
- Subsequent calls to `onTick`, `offTick`, `setSpeed`, `pause`, `resume`, `destroy` are all no-ops.
- If `destroy()` is called from within an `onTick` callback, the remaining callbacks in the current tick's snapshot still fire (the snapshot iteration is not aborted). Subsequent ticks do not fire because `engine.offFrame` has unwired the accumulator from the render loop.

#### 2.7 Constraints

- `GameClock` runs on whichever thread `MapEngine.onFrame` fires on — currently the main thread as a consequence of `MapEngine`'s threading model (P-3). `GameClock` itself has zero imports from Three.js or DOM APIs.
- One `GameClock` per engine per feature area. Multiple `GameClock` instances on the same engine are technically supported (each registers its own `onFrame` callback) but not a documented pattern in this version.
- The clock does not fire any ticks on the frame it is constructed — the accumulator starts from zero on the first frame callback.

---

### 3. CA-2: Adjacency Graph

#### 3.1 New `SectorRegistry` Field

```typescript
// In SectorRegistry — new read-only public field
readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>
```

**Behavior contract:**

- Every hex key present in `_sectorMap` (definition-registered sectors) gets an entry — pre-initialized to an empty `Set` before the scan begins.
- Bitmap-only colors (no definition entry) are **excluded** on both sides. Exclusion is purely definition-membership based — the engine does not special-case `"000000"` or any other specific value.
- **Bidirectional:** if B is in `adjacency.get(A)`, then A is in `adjacency.get(B)`.
- **Deduplicated:** regardless of how many shared border pixels exist between A and B, B appears exactly once in `adjacency.get(A)`.
- **4-connectivity only:** adjacency is determined by orthogonal neighbors (right and bottom during scan, bidirectionalized). Diagonal-only pixel contact does not constitute adjacency.
- A defined sector surrounded entirely by void/bitmap-only pixels will have an **empty `ReadonlySet`** — its entry exists (was pre-initialized), but is empty.

**Construction order guarantee:** `_sectorMap` is fully populated from the definition file before the pixel scan begins (this is already true in v0.0.1 — the definition-map population loop runs before the pixel loop in the constructor). The adjacency pre-initialization runs after `_sectorMap` population and before the pixel loop.

**`readonly` assignment rule:** The `this.adjacency = adjacencyMutable` assignment must occur within the `SectorRegistry` constructor body. TypeScript's `readonly` modifier permits assignment only in the constructor. If the pixel scan is factored into a private helper method, the helper must return the built map and the constructor must perform the final assignment — the helper itself cannot assign to `this.adjacency`.

**Algorithm (built inside the existing O(W×H) scan, alongside `borderEdges`):**

Pre-scan step — after `_sectorMap` is populated, before the pixel loop:

```typescript
const adjacencyMutable = new Map<string, Set<string>>()
for (const hexKey of this._sectorMap.keys()) {
  adjacencyMutable.set(hexKey, new Set<string>())
}
```

> **P-5 compliance note:** The pre-initialization loop is O(S) where S ≤ W×H (every sector requires at least one pixel). This is **not** a second bitmap scan — it iterates the sector dictionary, not the pixel buffer — and does not violate P-5. P-5's prohibition targets additional full-bitmap scan passes, not O(S) setup over an already-built data structure.

Inside the scan, for each pixel at `(x, y)`:

1. Derive `thisKey` from the buffer (`toHexKey(r, g, b)`). **`toHexKey` is an existing v0.0.1 utility in `src/utils.ts`**, already exported from `src/index.ts`. It produces 6-character lowercase hex strings without `#` prefix (e.g., `'ff00aa'`). Import it at the top of `SectorRegistry.ts` if not already imported; do not re-implement.
2. If `thisKey` is not in `_sectorMap`, skip adjacency logic for this pixel.
3. Check right neighbor `(x+1, y)` if in bounds:
   - Derive `rightKey`. If v0.0.1's `borderEdges` logic already computes `rightKey` at this position, **reuse that variable** — do not re-decode RGB. If it does not, the adjacency logic introduces the derivation and `borderEdges` logic consumes it.
   - If `rightKey !== thisKey` AND `adjacencyMutable.has(rightKey)`:
     - `adjacencyMutable.get(thisKey)!.add(rightKey)`
     - `adjacencyMutable.get(rightKey)!.add(thisKey)`
4. Check bottom neighbor `(x, y+1)` if in bounds:
   - Same logic as step 3, reusing `bottomKey` from the existing `borderEdges` derivation.

This runs alongside the existing `borderEdges` production logic in the same scan block. No additional scan pass.

Post-scan: `this.adjacency = adjacencyMutable as ReadonlyMap<string, ReadonlySet<string>>`. The explicit cast is required — TypeScript's invariant generic parameters mean `Map<string, Set<string>>` does not implicitly widen to `ReadonlyMap<string, ReadonlySet<string>>` (both the outer container and the inner `Set → ReadonlySet` require the cast).

**P-5 compliance:** This is a single additional operation per pixel within the existing O(W×H) scan. No new scan pass is introduced.

#### 3.2 New `MapEngine` Method

```typescript
getNeighbors(hexKey: string): ReadonlySet<string> | undefined
```

- Returns the result of `this._registry.adjacency.get(hexKey)` **directly**, without wrapping, cloning, or copying. This preserves reference (`===`) equality between `getNeighbors(hexKey)` and `engine.registry.adjacency.get(hexKey)`.
- Returns `undefined` if `hexKey` is not in the definition (not pre-initialized).
- Returns an empty `ReadonlySet` if the sector is defined but has no adjacent definition-registered neighbors.
- **Pre-load guard:** throws `'MapEngine: not loaded — call loadMap() first'` if called before `loadMap()` completes (consistent with the existing guard pattern on all other `MapEngine` methods that require loaded state: `getSector`, `getSectorKeys`, `setSectorColor`, `resetSectorColor`).
- **Destroyed guard:** throws `'MapEngine: destroyed'` if called after `engine.destroy()`.

#### 3.3 `borderEdges` Deprecation

`borderEdges: BorderEdge[]` on `SectorRegistry` is **retained** but marked deprecated:

```typescript
/**
 * @deprecated Use `adjacency` for neighbor queries. `borderEdges` retains richer
 * spatial data (exact pixel coordinates of each edge segment) that `adjacency` does
 * not expose. Retained until Dynamic Perimeter Rendering (CA-6) determines whether
 * a more structured perimeter representation supersedes it.
 * @experimental
 */
readonly borderEdges: BorderEdge[]
```

The `BorderEdge` type in `types.ts` receives the same `@deprecated` annotation, pointing to `adjacency`.

Do **not** remove `borderEdges` or alter its construction logic in this version.

---

## DATA FORMATS

No new data formats or file schemas. New type exports: `FrameCallback` (CA-1) and `ClockTickCallback` (CA-9) — both exported via `src/index.ts`'s `export type * from './types'`. `adjacency` uses existing `string` hex keys from the established sector identity system. No changes to `SectorDefinitionFile`, `SectorData`, `SectorBBox`, or `BorderEdge` structures (beyond `@deprecated` annotations on `BorderEdge`).

---

## ACCEPTANCE CRITERIA

> Each criterion is falsifiable. Tests must exercise the criterion directly.

**Epic dependencies:** Epic 2 (`GameClock`) requires Epic 1 (`onFrame`/`offFrame`) to be merged first — `GameClock` registers an `onFrame` callback at construction. Epic 3 (Adjacency Graph) is independent of both. Recommended implementation order: Epic 1 → Epic 2 → Epic 3, or Epic 3 in parallel with the Epic 1 → Epic 2 sequence.

**Test file convention:** Follow v0.0.1's existing test file layout — see existing files under `test/` for the naming and directory convention. New test files for Epic 1, 2, and 3 follow the same pattern.

### Test Harness Strategy

**Applies to all Epics 1 and 2 ACs that require driving the rAF loop or controlling frame timing.**

**`testUtils` is a deliverable of Epic 1.** Create `test/testUtils.ts` (following the v0.0.1 test directory convention) before writing any Epic 1 or Epic 2 tests. It must export `advanceFrame(renderer: MapRenderer, dtMillis: number): void` that:

1. Advances a mocked `performance.now()` by `dtMillis` milliseconds (using `vi.useFakeTimers()` + `vi.setSystemTime()`, or a bespoke `performance.now` mock — either is acceptable as long as the hook closure reads the advanced value).
2. Directly invokes the pre-render hook closure (i.e., `renderer['_preRenderHook']?.()`) bypassing real `requestAnimationFrame`.

Frame callbacks receive `dt = dtMillis / 1000` (seconds), consistent with the hook's `(now - _lastFrameTime) / 1000` computation. When AC examples say "drive `dt = 1.0s`", the test calls `advanceFrame(renderer, 1000)`.

**Priming convention — required before any non-zero-dt measurement:**

`_lastFrameTime` initializes to `0`. The hook checks `renderer._lastFrameTime === 0 ? 0 : (now - _lastFrameTime) / 1000` — so the **first** `advanceFrame` call always produces `dt === 0` regardless of `dtMillis`. To get a real `dt` on a subsequent call, call `advanceFrame(renderer, 1)` once first:

```typescript
advanceFrame(renderer, 1) // dt = 0 (first-frame sentinel); sets _lastFrameTime to 1ms
advanceFrame(renderer, 1000) // dt = 1.0s ✓
```

Every Epic 2 test setup must include this priming call. Tests that only assert `dt === 0` on the first frame (AC 1.2 bullet 1) do not need priming. Where AC examples say "`advanceFrame(renderer, 1000)` fires 1 tick," they assume one prior priming call unless explicitly stated otherwise.

**Private field access:** Tests access private fields via bracket notation (`renderer['_texture']`, `clock['_accumulator']`, etc.). TypeScript access modifiers are compile-time only; bracket notation bypasses them at runtime. This convention is established once here and used consistently — tests do not add test-only getters or `@internal` decorations for this purpose.

For AC 1.3 specifically: test setup replaces `displayCtx.putImageData` with a spy (`vi.spyOn(renderer['displayCtx'], 'putImageData')`) before advancing the frame, then asserts `spy.mock.calls.length === 1`.

---

### Universal: Example App Coverage

**Applies to every public-facing API surface added in this version — no exceptions.**

Every feature that adds or changes the public API of the library must be accompanied by a working demonstration in `example/src/main.ts` (and any supporting example files). The demonstration:

- Must be visible and interactive (or visibly active) in the browser at `localhost:3000` without any additional setup.
- Must exercise the new API directly and produce an observable result. Minimum concrete elements are specified per epic in the `.7`, `.10`, and `.10` ACs below.
- May be simple. A minimal, clearly labeled demo is preferred over a complex one. The goal is verifiability, not showcase quality.
- Must not be commented out, feature-flagged, or gated behind a build step.

**This criterion is a hard gate on the "done" definition of any task that introduces a new public API.** A task is not complete until the example app reflects and demonstrates the new capability.

> **ACs 1.7, 2.10, and 3.10 are verified by manual inspection at `localhost:3000`.** Automated E2E coverage of the example app is out of scope for v0.0.2. A developer opens the browser, observes the specified elements, and confirms the expected behavior without opening DevTools.

> **Example dev server:** Run `npm run example` from the root (confirmed in v0.0.1's `package.json` scripts). This starts the Vite dev server at `localhost:3000` with HMR. This PRD adds no new npm scripts.

---

### Epic 1: The Frame Hook

**1.1 — Callback registration and firing**

- `engine.onFrame(cb)` registers `cb`; `cb` is called on every subsequent render frame.
- Multiple callbacks registered via `onFrame` fire in registration order within a single frame.
- `engine.offFrame(cb)` removes `cb`; it does not fire on subsequent frames.
- `offFrame` with an unregistered callback is a no-op (no error).

**1.2 — `dt` values**

- On the first rAF frame after `loadMap` completes, `dt === 0`.
- Using `advanceFrame(renderer, dtMillis)` with `dtMillis > 0` on frame N≥2: the callback receives `dt === dtMillis / 1000` (exact equality, because the test harness controls `performance.now()` precisely).
- A callback registered on frame N (after `loadMap` completed) receives the `dt` computed for frame N — not `0`. `dt === 0` applies only to the first frame of the renderer's life, not to the first frame after any given callback's registration.

**1.3 — Batched dirty-rect flushing during frame**

- Given two `setSectorColor` calls to different sectors inside a single frame callback: test harness spies on `displayCtx.putImageData`, advances one frame, and asserts `spy.mock.calls.length === 1` (not two).
- The `putImageData` call passes `(displayImageData, 0, 0, dx, dy, dw, dh)` where `dx = min(bbox1.minX, bbox2.minX)`, `dy = min(bbox1.minY, bbox2.minY)`, `dw = max(bbox1.maxX, bbox2.maxX) - dx + 1`, `dh = max(bbox1.maxY, bbox2.maxY) - dy + 1` — the minimal axis-aligned bounding box union of the two sectors' `SectorBBox` values (inclusive bounds converted to width/height via +1).
- Pixel state is correct after the flush: both sectors show the correct colors.
- `renderer['_texture'].needsUpdate` is set exactly once per frame when dirty state exists from a frame callback.

**1.4 — Immediate flush outside frame callback**

- `setSectorColor` called outside a frame callback (imperative path) flushes immediately — pixel state is correct before the next rAF frame.
- Existing consumer code that does not use `onFrame` is unaffected.

**1.5 — Destroyed-guard**

- Calling `onFrame` or `offFrame` after `engine.destroy()` is a no-op (no error, no registration).

**1.6 — Self-removal during iteration**

- A callback that calls `offFrame(itself)` during execution does not corrupt subsequent callback invocations in the same frame.

**1.7 — Example app demonstration**

- The example app includes a DOM element with `id="frame-counter"` (or equivalent labeled display) that shows a live frame count incrementing on every render frame.
- In addition, the demo must include a sector that visibly pulses color on each frame (e.g., cycles through a palette via `setSectorColor` inside an `onFrame` callback). This exercises the batching path — a developer can confirm both the counter and the pulsing sector are active without opening DevTools.
- Opening `localhost:3000` and observing both the counter and the color pulse is sufficient to confirm the frame hook and batching path are working.

**1.8 — Destroy-during-tick**

- A callback that calls `engine.destroy()` during execution: the remaining callbacks in the snapshot still fire. Any subsequent `setSectorColor` calls in those callbacks throw `'MapEngine: destroyed'`, which is caught by the per-callback try/catch and logged — no uncaught exception. `_flushPendingDirty()` is a no-op (dirty rect was cleared by `destroy()`), and no further rAF frames run.

---

### Epic 2: Game Clock

**2.1 — Tick firing rate**

> All bullets below assume one prior priming call (see Test Harness Strategy priming convention).

- After priming: `advanceFrame(renderer, 1000)` (dt = 1.0s) with speed 1× and `ticksPerSecond: 1`. Assert exactly 1 tick fires.
- After priming: `advanceFrame(renderer, 500)` then `advanceFrame(renderer, 500)` with speed 2× and `ticksPerSecond: 1`. Assert exactly 2 ticks fire total.
- After priming: `advanceFrame(renderer, 2000)` with speed 0.5× and `ticksPerSecond: 1`. Assert exactly 1 tick fires.
- Tick callbacks fire in `onTick` registration order within a single tick.
- When asserting accumulator state, use `expect(clock['_accumulator']).toBeCloseTo(0, 10)` rather than strict `=== 0` to guard against sub-nanosecond IEEE-754 residuals.

**2.2 — Pause / resume**

- `clock.pause()` stops the accumulator; no `onTick` callbacks fire while paused.
- `clock.resume()` restores the clock to its pre-pause speed; ticks resume firing at that speed.
- `clock.pause()` while already paused is a no-op (no error, no state corruption).
- `clock.resume()` while not paused is a no-op.
- **Accumulated-progress deterministic test** (prime first, then all calls use `advanceFrame(renderer, dtMillis)`):
  1. `advanceFrame(renderer, 500)` → accumulator = 0.5, 0 ticks.
  2. `clock.pause()`.
  3. `advanceFrame(renderer, 10000)` → 0 ticks (paused; early return in `internalFrameCallback`).
  4. `clock.resume()`.
  5. `advanceFrame(renderer, 500)` → accumulator reaches 1.0, exactly 1 tick fires.

**2.3 — `setSpeed` semantics**

- `clock.setSpeed(0)` is equivalent to `clock.pause()` in effect (no ticks fire).
- `clock.setSpeed(n)` for `n > 0` updates the speed; ticks begin firing at the new rate immediately.
- Negative values are clamped to 0 (no error thrown).

**2.4 — `elapsed` counter**

- `elapsed` starts at `0` on construction.
- Each tick that fires increments `elapsed` by 1 before the callbacks receive it.
- `elapsed` is the value passed to `ClockTickCallback`; it reflects the count of ticks fired so far.
- `elapsed` never decreases.

**2.5 — Spiral-of-death guard**

> All bullets below assume one prior priming call.

- After priming: `advanceFrame(renderer, 11000 / ticksPerSecond)` — drive a single frame with `dt = 11 / ticksPerSecond` seconds, corresponding to 11 tick intervals. For `ticksPerSecond: 1` this evaluates to `advanceFrame(renderer, 11000)`. Assert exactly 10 ticks fire and `expect(clock['_accumulator']).toBeCloseTo(0, 10)` after the frame.
- A subsequent `advanceFrame(renderer, 100)` (dt = 0.1s, below the 1-second tick threshold at `ticksPerSecond: 1`) asserts zero additional ticks fire, confirming the accumulator was reset to `0` and no residual accumulated time survived the cap.
- **Below-cap companion test:** After priming, `advanceFrame(renderer, 9500)` (9.5 tick intervals at `ticksPerSecond: 1`). Assert exactly 9 ticks fire and `expect(clock['_accumulator']).toBeCloseTo(0.5, 10)` — confirming the cap does not trigger and the residual accumulator is preserved when the cap is not hit.

**2.6 — `offTick` self-removal during iteration**

- A callback that calls `offTick(itself)` during execution does not corrupt subsequent callback invocations in the same tick.

**2.7 — `destroy()` stops the clock**

- After `clock.destroy()`, no further `onTick` callbacks fire.
- `destroy()` called multiple times is a no-op (no error).

**2.8 — Destroyed-guard on registration**

- `onTick` / `offTick` called after `destroy()` are no-ops.

**2.9 — Frame Hook integration**

- `GameClock` registers exactly one callback with `engine.onFrame`. Constructing the clock wires it; `destroy()` unwires it.
- After priming the renderer, construct a `GameClock` with `ticksPerSecond: 1`, speed 1×. Call `advanceFrame(renderer, 500)`. Assert zero ticks fire (accumulator = 0.5). This property emerges from the accumulator starting at `0` — there is no explicit construction-frame suppression mechanism, and the PRD does not require one.

**2.10 — Example app demonstration**

- The example app includes a DOM element with `id="tick-counter"` showing the current `elapsed` tick count, and a DOM element with `id="clock-speed"` showing the current clock speed multiplier.
- Speed controls (buttons or slider) let the developer verify `setSpeed`, `pause`, and `resume` by clicking in the browser without opening DevTools.
- The `tick-counter` readout must update visibly as ticks fire, confirming the clock is running.

**2.11 — Engine destroy while clock running**

- When `engine.destroy()` is called while a `GameClock` is running, no further ticks fire.
- Calling `clock.destroy()` afterward is a no-op (no error).
- `clock.elapsed`, `clock.speed`, and `clock.paused` remain readable and reflect their last values before the engine was destroyed.

**2.12 — Bootstrap pause/resume**

- A clock that is paused before any tick has fired (`setSpeed(0)` immediately after construction) resumes to speed 1× on `resume()`, because `_lastSpeed` initializes to `1` and `setSpeed(0)` does not update it.

---

### Epic 3: Adjacency Graph

> **Precondition for all Epic 3 ACs:** `await engine.loadMap(...)` has completed successfully in test setup before any assertion is made. `getNeighbors` and `engine.registry.adjacency` throw / are inaccessible before `loadMap` completes.

**3.1 — Bidirectionality**

- For any two definition-registered sectors A and B sharing at least one pair of 4-connected (orthogonally adjacent) pixels: B is in `registry.adjacency.get(A)` AND A is in `registry.adjacency.get(B)`.

**3.2 — Deduplication**

- Regardless of how many border pixels A and B share, B appears exactly once in `adjacency.get(A)`.

**3.3 — Pre-initialization**

- Every hex key in the definition has an entry in `adjacency` (even if its value is an empty Set) before the pixel scan begins.
- A definition-registered sector that shares no border with any other definition-registered sector has `adjacency.get(hexKey)` returning an empty `ReadonlySet` (not `undefined`).

**3.4 — Adjacency requires direct pixel contact**

- Adjacency requires at least one pair of 4-connected (orthogonal) pixels belonging to both sectors. Any separation — bitmap-only pixels, another defined sector, or image bounds — means A and B are not adjacent. `adjacency.get(A)` does not contain B.
- A bitmap-only color (present in the pixel buffer but absent from the definition) does not appear as a key in `adjacency` and does not appear as a value in any adjacency Set.

**3.5 — 4-connectivity**

- Adjacency uses 4-connectivity (orthogonal neighbors only). Diagonal-only pixel contact does not constitute adjacency.
- Given a 2×2 bitmap where sector A is at (0,0), bitmap-only color at (1,0) and (0,1), and sector B at (1,1): both A and B are definition-registered, but they share no 4-connected pixel boundary. Assert `adjacency.get(A)` is an empty `ReadonlySet` (does not contain B) and `adjacency.get(B)` is an empty `ReadonlySet` (does not contain A).

**3.6 — `getNeighbors` proxy**

- `engine.getNeighbors(hexKey)` returns the identical `ReadonlySet` reference (`===`) returned by `engine.registry.adjacency.get(hexKey)`. The implementation is a one-liner (`return this._registry.adjacency.get(hexKey)`) with no wrapping, cloning, or copying.
- Returns `undefined` for a hex key not in the definition.
- Returns an empty `ReadonlySet` for a defined but isolated sector.

**3.7 — `borderEdges` retained**

- `registry.borderEdges` continues to produce the same values as in v0.0.1. No behavioral change.
- `BorderEdge` type and `borderEdges` field carry `@deprecated` JSDoc in the source.

**3.8 — No additional scan pass**

- The adjacency construction logic lives entirely inside the existing O(W×H) pixel loop in `SectorRegistry`. **Code review criterion:** the adjacency write logic must reside in the same iteration block as the `borderEdges` write logic — verified by inspection during PR review. As a supporting sanity check, `SectorRegistry.ts` must not contain more than one loop that iterates over pixel rows (e.g., `for (let y`). Reviewers verify by inspection; the grep is a hint, not a proof, since alternative loop constructs would bypass a naive pattern match.

**3.9 — P-1/P-2 compliance**

- `SectorRegistry` source file contains zero imports from Three.js or any DOM API. Verified by grepping for `import.*three` and for `document`, `window`, `HTMLCanvasElement`, `OffscreenCanvas` after any change to the file.
- `SectorRegistry.ts` must not import `./internal/color` (or any file that transitively does). `src/internal/color.ts` is `@main-thread-only` and must not reach `SectorRegistry` or `SectorBitmapParser`.

**3.10 — Example app demonstration**

- The example app calls `engine.getNeighbors(hexKey)` on a clicked sector and logs the neighbor hex keys to a labeled on-page `<div id="neighbor-output">`. Highlight-on-click (calling `setSectorColor` on neighbor sectors) is out of scope for the example to avoid state-management complexity in the demo.
- A developer can click any sector in the browser and immediately see the adjacent hex keys printed in `#neighbor-output` without opening DevTools.

**3.11 — Destroyed-guard on `getNeighbors`**

- After `engine.destroy()`, `engine.getNeighbors(hexKey)` throws with message `'MapEngine: destroyed'`.

---

## WHAT THIS VERSION EXPLICITLY DOES NOT INCLUDE

- `SpatialGraph` class or any pathfinding primitives (CA-4) — blocked on CA-2 shipping first; deferred to a future version.
- GPU palette / sector ID texture rendering strategy (CA-7) — blocked on CA-1 shipping first; deferred.
- Hierarchical aggregation (CA-5), dynamic perimeter rendering (CA-6), spatial anchoring (CA-8).
- Weighted adjacency edges — cost functions are user-land.
- Multi-hop or connected-component queries — user-land until `SpatialGraph` ships.
- Adjacency between bitmap-only (definition-less) sectors.
- Removal or behavioral change to `borderEdges` — retained as-is; deprecated annotation only.
- Render-on-demand / dirty-flag rAF optimization — loop remains always-running.
- No-op detection for `setSectorColor` calls that do not change pixel values — writes are always staged regardless of whether the color differs from the current display value.
- Configurable `MAX_TICKS_PER_FRAME` cap — hardcoded to `10` for this version; not a public parameter.
- Multiple simultaneous `GameClock` instances on the same engine — technically functional but not a documented pattern.
- Networked synchronization or deterministic replay for `GameClock`.
- Calendar / date system inside `GameClock` — `elapsed` is the primitive; date math is user-land.
- **No new top-level named exports from `src/index.ts` beyond:** `GameClock`. New types (`FrameCallback`, `ClockTickCallback`) become top-level exports automatically via `src/index.ts`'s `export type * from './types'`. New methods (`onFrame`, `offFrame`, `getNeighbors`) and the new field (`adjacency`) are additions to existing classes, not new top-level exports. `registry` is an **existing** public getter on `MapEngine` (v0.0.1) — not a new export.
- Changes to the picking pipeline, pan/zoom behavior, or canvas resize strategy.
- Web Worker integration for `SectorBitmapParser` / `SectorRegistry` — architecturally enabled by design but not wired in this version.
- New peer dependencies or changes to the Three.js external constraint.

---

## KNOWN RISKS

| ID      | Risk                                                                                                                            | Severity | Likelihood | Mitigation                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-1** | `setSectorColor` called both inside and outside a frame callback in the same frame causes double-flush                          | Medium   | High       | The `_inTick` flag gates the dispatch path. Only calls made inside the frame callback are batched; calls outside flush immediately as before. Consolidated flush runs after all frame callbacks return.                           |
| **R-2** | `_frameCallbacks` iteration corrupted by self-removal via `offFrame` inside a callback                                          | Medium   | Low        | Iterate over a snapshot (`[...this._frameCallbacks]`) when firing. Mutation of the live array does not affect the snapshot.                                                                                                       |
| **R-3** | Adjacency set-membership check per pixel (`adjacencyMutable.has(neighborKey)`) adds measurable scan time at large bitmap scales | Low      | Low        | O(1) Map lookup; cost is negligible relative to the existing `borderEdges` path which also reads neighbor pixels. No new memory allocation inside the hot loop.                                                                   |
| **R-4** | `_preRenderHook` fires before `MapRenderer` has valid display canvas state                                                      | Low      | Low        | Hook is wired in `MapEngine.loadMap()` after `new MapRenderer(...)` completes and the display canvas is initialized. The renderer's first rAF frame cannot fire before the event loop yields back to the caller of `loadMap()`.   |
| **R-5** | `borderEdges` external consumers not aware of deprecation                                                                       | Low      | Low        | Already `@experimental`. `@deprecated` annotation added; removal deferred until CA-6 determines final fate. No behavioral change.                                                                                                 |
| **R-6** | `GameClock` constructed after `MapEngine.destroy()` silently does nothing                                                       | Low      | Low        | `onFrame` already respects the destroyed-guard and is a no-op post-destroy. `GameClock` constructor inherits this behavior — no special handling needed, but consumers must be aware to avoid silent no-ops.                      |
| **R-7** | Lag spike causes `MAX_TICKS_PER_FRAME` cap to silently discard game time                                                        | Medium   | Low        | Cap is documented behavior, not a bug. Discarding is preferable to a catch-up burst. Consumers who need tick-accurate simulation (e.g., replays) should not rely on `GameClock` alone — that use case is explicitly out of scope. |

---

<!-- RESOLVED DECISIONS — formerly OPEN ITEMS:

1. getNeighbors pre-load guard: RESOLVED — throws 'MapEngine: not loaded — call loadMap() first',
   consistent with the existing guard pattern on all other state-dependent MapEngine methods
   (getSector, getSectorKeys, setSectorColor, resetSectorColor). See §3.2.

2. Epic file structure: RESOLVED — agents implement directly against this PRD.
   Per-epic task files in docs/active/epics/ are populated by the BDFL before handoff.
   If absent, implement sequentially against the §CORE FUNCTIONALITY sections in order:
   Epic 1 (CA-1) → Epic 2 (CA-9) → Epic 3 (CA-2).

3. Test harness for dt timing: RESOLVED — Vitest + @vitest/browser with testUtils.advanceFrame(renderer, dtMillis)
   exported from test/testUtils.ts. Advances a mocked performance.now() by dtMillis milliseconds and
   directly invokes the pre-render hook closure, bypassing real rAF. Frame callbacks receive
   dt = dtMillis / 1000 seconds. testUtils.ts is a deliverable of Epic 1.
   Priming: first advanceFrame call always produces dt=0 (sentinel). Tests needing dt>0 must call
   advanceFrame(renderer, 1) once first to prime _lastFrameTime out of the sentinel state.

4. AC 3.8 scan time: RESOLVED — code review criterion (not brittle grep) verifies adjacency logic
   lives in the same iteration block as borderEdges. Supporting sanity grep looks for more than one
   for (let y) loop. See AC 3.8.

5. GameClock export path: RESOLVED — top-level named export from src/index.ts alongside MapEngine.
   GameClock is imported from 'map-engine' directly, not a sub-path.

-->
