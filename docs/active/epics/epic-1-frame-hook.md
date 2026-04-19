# Epic 1: The Frame Hook

**Objective:** Introduce a synchronization hook that fires at the top of every render frame, enabling frame-coherent batching of `setSectorColor`/`resetSectorColor` calls and eliminating redundant dirty-rect flushes.
**Scope:** Incorporates PRD §1 (CA-1), PRD §"Test Harness Strategy", and the Universal Example App Coverage requirement.

**Verifiable & Measurable Success Criteria:**

- **Hook registration:** `engine.onFrame(cb)` registers a callback that fires on every subsequent render frame in registration order; `engine.offFrame(cb)` deregisters it with no error if not present; both are no-ops after `engine.destroy()`.
- **Batched flushing:** Two `setSectorColor` calls to different sectors inside a single frame callback produce exactly one `displayCtx.putImageData` call per frame (spied via `vi.spyOn`), with the minimal axis-aligned bounding-box union of both sectors' bboxes.
- **Immediate path unchanged:** `setSectorColor` / `resetSectorColor` called outside a frame callback continue to flush immediately — no behavioral change for existing consumers.
- **Color utility isolation:** `grep -rn 'internal/color' src/SectorRegistry.ts src/SectorBitmapParser.ts` returns zero matches; `src/internal/color.ts` declares its `OffscreenCanvas` singleton at module scope and `parseColorToRgb` contains no `new OffscreenCanvas` call.
- **Test infrastructure:** `test/testUtils.ts` exports `makeCanvas`, `advanceFrame`, and `buildTestBuffer`; `advanceFrame` priming convention documented; all Epic 1 ACs (1.1–1.12) pass under `npm run test`.
- **Example app:** `localhost:3000` shows a live frame counter (`id="frame-counter"`) and a sector that visibly pulses color on every frame — both observable without opening DevTools.

---

## Tasks

### Task 1.1 — Shared Color Utility and Test Infrastructure

**PRD Reference:** §1.4 (`parseColorToRgb` extraction and singleton); §"Test Harness Strategy" (`test/testUtils.ts`, `makeCanvas`, `advanceFrame`, `buildTestBuffer`, priming convention)

Creates two foundations everything else builds on: the shared `parseColorToRgb` utility (which also removes the per-instance color parser from `MapRenderer`) and the `test/testUtils.ts` helpers required by all Epic 1 and 2 tests. Doing this first isolates the refactor from the new behavior additions. Task 1.2 depends on `parseColorToRgb` being present before updating `MapRenderer.setSectorColor`.

**Work:**

- Add `FrameCallback` type to `src/types.ts`:
  ```typescript
  // dt is elapsed wall-clock seconds since the previous frame (e.g. 0.01667 at 60fps).
  // On the very first rAF frame after loadMap() completes, dt === 0.
  type FrameCallback = (dt: number) => void
  ```
- Create directory `src/internal/` and file `src/internal/color.ts`. Top-of-file JSDoc: `/** @main-thread-only — uses OffscreenCanvas; do not import from SectorRegistry or SectorBitmapParser */`. Declare module-scope singleton `const _canvas = new OffscreenCanvas(1, 1)` and `const _ctx = _canvas.getContext('2d')!`. Export `parseColorToRgb(color: string): { r: number; g: number; b: number }` implementing the `clearRect` / `fillStyle` / `fillRect` / `getImageData` pattern from PRD §1.4. `clearRect` is required before each parse — without it, invalid CSS colors leave `fillStyle` at its previous value.
- Read `src/MapRenderer.ts` before modifying. Remove `_colorParserCanvas: OffscreenCanvas` and `_colorParserCtx: OffscreenCanvasRenderingContext2D` fields and their constructor initialization. Import `parseColorToRgb` from `./internal/color`. Update `MapRenderer.setSectorColor` to call `parseColorToRgb(color)` instead of the removed fields (PRD §"v0.0.1 Source Reference — MapRenderer color parser migration note").
- Create `test/testUtils.ts`. Export:
  - `makeCanvas(width = 800, height = 600): HTMLCanvasElement` — creates, styles, sets `clientWidth`/`clientHeight` via `Object.defineProperty`, appends to `document.body`, returns canvas. Exact body per PRD Test Harness Strategy.
  - `advanceFrame(renderer: MapRenderer, dtMillis: number): void` — calls `vi.advanceTimersByTime(dtMillis)` then `renderer['_preRenderHook']?.()`. Do not manually set `performance.now` directly. Do not call `renderer.render()`. **Note:** `vi.useFakeTimers({ toFake: ['performance'] })` must be active (called in the test's `beforeEach` or individually) before `advanceFrame` produces accurate `dt` values; the helper itself does not call `useFakeTimers`.
  - `buildTestBuffer(width: number, height: number, pixels: Array<[number, number, number]>): Uint8ClampedArray` — each entry is `[r, g, b]`; alpha hardcoded to `255`. Must throw if `pixels.length !== width * height`.
  - Add a comment documenting the import-isolation verification commands from AC 1.10.
- **`makeCanvas` migration:** The PRD notes that `makeCanvas` currently lives in `test/MapEngine.test.ts` (v0.0.1). After creating it in `testUtils.ts`, remove the local definition from `test/MapEngine.test.ts` and replace it with an import from `./testUtils`. This prevents a duplicate and ensures the canonical definition lives in one place.

**Done when:** `npm run typecheck` passes with zero errors; `src/internal/color.ts` exists with module-scope singleton; `src/MapRenderer.ts` has no `_colorParserCanvas` or `_colorParserCtx` fields; `test/testUtils.ts` exports all three helpers; `grep -rn 'internal/color' src/SectorRegistry.ts src/SectorBitmapParser.ts` returns empty.

---

### Task 1.2 — `MapRenderer` Batching Internals

**PRD Reference:** §1.3 (all new `MapRenderer` fields and internal methods); §1.3 B-1 (sync wiring requirement for constructor parameter)

Adds the six `@internal public` members to `MapRenderer` that `MapEngine` will wire in Task 1.3. Doing this as a separate task keeps the surface area small: the constructor gains one new parameter, and three new methods plus two new fields are added — nothing in `MapEngine` changes yet. Task 1.3 depends on the updated `MapRenderer` constructor signature.

**Work:**

- Read `src/MapRenderer.ts` in full before modifying to confirm the exact v0.0.1 constructor signature `(canvas: HTMLCanvasElement, registry: SectorRegistry)`.
- Update the constructor to accept a third required parameter: `_preRenderHook: () => void` (regular parameter — **not** TypeScript parameter property shorthand). Declare the corresponding class field separately: `public _preRenderHook: (() => void) | null`. Assign from the constructor parameter. The nullable type is required so `destroy()` can set it to `null`.
- **Modify the existing rAF animation callback** to invoke `_preRenderHook` as its very first statement — before the resize check and before `renderer.render(scene, camera)`:
  ```typescript
  // At the very top of the rAF callback body — first statement, nothing precedes it:
  if (this._preRenderHook) this._preRenderHook()
  ```
  The null guard handles the edge case where `cancelAnimationFrame` was called but the callback was already dispatched. Per PRD §1.3, `performance.now()` is captured inside the hook closure body (in `MapEngine.loadMap`), not here in the rAF callback.
- Add `public _lastFrameTime: number = -1` (sentinel — never a valid `performance.now()` timestamp). This field is written exclusively by the pre-render hook closure in `MapEngine.loadMap()`.
- Add `public _pendingDirtyRect: SectorBBox | null = null`. Import `SectorBBox` from `./types` if not already imported.
- Implement `public _patchSectorPixels(hexKey: string, r: number, g: number, b: number): void`:
  - If `!this._registry.pixelIndices.has(hexKey)`, return immediately (before any bbox logic).
  - Store the array: `const arr = this._registry.pixelIndices.get(hexKey)!`. Use indexed iteration (`for (let i = 0; i < arr.length; i++)`) — do not use `for...of` over a `Uint32Array` (allocates an iterator per call). For each iteration: `const byteOffset = arr[i] * 4`. Write `r`, `g`, `b` to `displayImageData.data` at `byteOffset`, `byteOffset+1`, `byteOffset+2`. Do not write alpha.
  - Union the sector's bbox (`this._registry.bboxes.get(hexKey)!`) into `_pendingDirtyRect`: if null, spread-copy the bbox; if already set, expand with `Math.min`/`Math.max` on all four fields (`minX`, `minY`, `maxX`, `maxY`).
  - Do not call `putImageData`. Do not set `_texture.needsUpdate`.
- Implement `public _patchSectorPixelsFromSource(hexKey: string): void`:
  - Same early-return guard: `if (!this._registry.pixelIndices.has(hexKey)) return`.
  - `const arr = this._registry.pixelIndices.get(hexKey)!`. Same indexed iteration; for each `byteOffset = arr[i] * 4`, read `r = this._registry.sourceBuffer[byteOffset]`, `g = [byteOffset+1]`, `b = [byteOffset+2]` and write to `displayImageData.data` at the same offsets. Do not write alpha.
  - Same bbox union into `_pendingDirtyRect`.
- Implement `public _flushPendingDirty(): void`:
  - If `this._pendingDirtyRect` is null, no-op.
  - Otherwise: assign to a non-null local — `const r = this._pendingDirtyRect!` (the `!` prevents a spurious TypeScript error since class field types cannot be narrowed as reliably as locals) — then:
    ```typescript
    this.displayCtx.putImageData(
      this.displayImageData,
      0,
      0,
      r.minX,
      r.minY,
      r.maxX - r.minX + 1,
      r.maxY - r.minY + 1
    )
    ```
    Set `this._texture.needsUpdate = true`. Set `this._pendingDirtyRect = null`. (Inclusive bounds → `+1` converts to exclusive width/height.)
- Update `MapRenderer.destroy()`: after `cancelAnimationFrame(this._animFrameId)`, add `this._preRenderHook = null` then `this._pendingDirtyRect = null` (in that order, before any other cleanup).
- Add `@internal` JSDoc to all six new members (`_preRenderHook`, `_lastFrameTime`, `_pendingDirtyRect`, `_patchSectorPixels`, `_patchSectorPixelsFromSource`, `_flushPendingDirty`).

**Done when:** `npm run typecheck` passes; `MapRenderer` constructor signature is `(canvas, registry, _preRenderHook)`; the existing rAF callback body has `if (this._preRenderHook) this._preRenderHook()` as its first statement; all six `@internal public` members exist; `_flushPendingDirty` with a non-null rect calls `putImageData` once and nulls the rect; `MapRenderer.destroy()` nulls both `_preRenderHook` and `_pendingDirtyRect` after `cancelAnimationFrame`.

---

### Task 1.3 — `MapEngine` Hook Wiring, Dispatch, and Destroy

**PRD Reference:** §1.2 (`onFrame`/`offFrame` behavior); §1.4 (batching coordination, closure pattern, destroy sequence); §1.5 (constraints)

Wires the pre-render hook closure into `loadMap()`, adds `onFrame`/`offFrame` to the public API, and updates `setSectorColor`/`resetSectorColor` to dispatch to the batched path inside a frame tick. Also updates `MapEngine.destroy()` with the two new prepended steps. Depends on Task 1.2's updated `MapRenderer` constructor.

**Work:**

- Read `src/MapEngine.ts` in full before modifying. Confirm the existing `_destroyed`/`_loaded` guard pattern and `destroy()` body.
- Add `private _frameCallbacks: FrameCallback[] = []` and `private _inTick: boolean = false`.
- Implement `onFrame(callback: FrameCallback): void`: if `this._destroyed`, return immediately (no error, no registration). Otherwise, `this._frameCallbacks.push(callback)`.
- Implement `offFrame(callback: FrameCallback): void`: if `this._destroyed`, return immediately. Otherwise, splice first occurrence by `===` reference: `const idx = this._frameCallbacks.indexOf(callback); if (idx !== -1) this._frameCallbacks.splice(idx, 1)`.
- In `loadMap()`, after the existing `Promise.all` async operations and `SectorRegistry` construction, build the hook closure **before** calling `new MapRenderer(...)`. No `await` may appear between the `hook` declaration and `new MapRenderer(...)`. Use `let renderer: MapRenderer` (not `const`) because the closure captures the binding before the constructor completes:
  ```typescript
  let renderer: MapRenderer
  const hook = (): void => {
    const now = performance.now()
    const dt =
      renderer._lastFrameTime === -1
        ? 0
        : (now - renderer._lastFrameTime) / 1000
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
  }
  renderer = new MapRenderer(config.canvas, registry, hook)
  this._renderer = renderer
  this._canvas = config.canvas
  // ... existing listener wiring and this._loaded = true follow unchanged ...
  ```
- Update `MapEngine.setSectorColor`: **the existing `_destroyed`/`_loaded` guard checks must be preserved as-is at the top of the method.** After those guards pass, call `parseColorToRgb(color)` (import from `./internal/color`) to get `{ r, g, b }`. Then dispatch: if `this._inTick`, call `this._renderer!._patchSectorPixels(hexKey, r, g, b)`; else call `this._renderer!.setSectorColor(hexKey, color)`. The double-parse on the immediate path (once here, once inside `MapRenderer.setSectorColor`) is accepted per PRD §1.4.
- Update `MapEngine.resetSectorColor`: **preserve the existing `_destroyed`/`_loaded` guards.** After both guards pass: if `this._inTick`, call `this._renderer!._patchSectorPixelsFromSource(hexKey)`; else call `this._renderer!.resetSectorColor(hexKey)`.
- Update `MapEngine.destroy()`: the existing `if (!this._loaded) return` guard **stays at the top of the method unchanged**. Inside the guard block (i.e., only when `_loaded === true`), prepend these two new steps before the existing step (2):
  - **(0) NEW:** `this._frameCallbacks = []`
  - **(1) NEW:** `this._renderer!._pendingDirtyRect = null` — must precede step (2) so the dirty rect is cleared before `renderer.destroy()` disposes the canvas context
    Then the existing steps follow in order: **(2)** `this._renderer!.destroy()`, **(3)** `this._registry = null; this._renderer = null; this._canvas = null`, **(4)** `this._destroyed = true`.

**Done when:** `npm run typecheck` and `npm run build` pass; `onFrame`/`offFrame` present on `MapEngine`; `loadMap` builds the hook closure and calls `new MapRenderer(..., hook)` with no `await` between those two lines (the `Promise.all` await that fetches bitmap and definition data correctly precedes the hook declaration and is unaffected); `setSectorColor` routes through `_patchSectorPixels` when `_inTick`; `destroy()` clears `_frameCallbacks` and nulls `_pendingDirtyRect` as steps 0 and 1.

---

### Task 1.4 — Epic 1 Tests and Example App

**PRD Reference:** §"Acceptance Criteria — Epic 1" (ACs 1.1–1.12); §"Universal: Example App Coverage" (AC 1.7); §"Test Harness Strategy" (standard preamble, priming convention, rAF suppression, fake timers)

Writes the full test suite for Epic 1 and adds the required example app demonstration. All tests use `test/testUtils.ts` helpers from Task 1.1 and the standard `beforeEach`/`afterEach` preamble from PRD Test Harness Strategy.

**Work:**

- Create a new test file (follow v0.0.1 naming convention — see existing files under `test/`). Use the standard preamble in `beforeEach`: call `vi.useFakeTimers({ toFake: ['performance'] })` (must use this form — default `vi.useFakeTimers()` may not fake `performance.now()` in all Vitest versions), then `canvas = makeCanvas()`, load engine with existing fixtures (`'/test/fixtures/test-4x4.png'`, `'/test/fixtures/test-4x4.json'`), extract `renderer = engine['_renderer'] as MapRenderer`, call `cancelAnimationFrame(renderer['_animFrameId'])` to suppress the live rAF loop. `afterEach` calls `engine?.destroy()`, `canvas?.remove()`, `vi.useRealTimers()`.
- **AC 1.1** — Register multiple callbacks; assert they fire in registration order; `offFrame` removes the callback; `offFrame` with unregistered callback is a no-op.
- **AC 1.2** — First `advanceFrame(renderer, 1)` produces `dt === 0` (first-frame sentinel). Second `advanceFrame(renderer, 1000)` produces `dt === 1.0` (exact equality, because fake timers control `performance.now()` precisely). Third bullet from PRD: a callback registered on frame N ≥ 1 (i.e., after `loadMap` has already started) receives the `dt` computed for that same frame N — not `0`. `dt === 0` applies only to the very first frame of the renderer's lifetime, not to the first frame after any given callback's registration. Verify: register a callback after one `advanceFrame(renderer, 1)` has already fired; on the next `advanceFrame(renderer, 1000)`, that callback should receive `dt === 1.0`, not `0`.
- **AC 1.3** — Before implementing, assert `registry.bboxes.get('ff0000').maxX === 1` (confirms inclusive bounds). Then: spy on `renderer['displayCtx'].putImageData`; inside `onFrame` callback call `setSectorColor('ff0000', 'blue')` and `setSectorColor('00ff00', 'red')`; advance one frame; assert spy called exactly once. Assert `putImageData` args produce dirty rect spanning both sectors (`{0,0,4,2}`). Assert correct pixel bytes: for each sector, compute `const byteOffset = registry.pixelIndices.get(hexKey)![0] * 4` and assert `renderer['displayImageData'].data[byteOffset]`, `[byteOffset+1]`, `[byteOffset+2]` match the `r`, `g`, `b` values from `parseColorToRgb(color)`. Assert `renderer['_texture'].needsUpdate` was set to `true` exactly once during the frame (spy or direct read after advancing).
- **AC 1.4** — `setSectorColor` outside a frame callback flushes immediately (pixel state correct before next rAF frame).
- **AC 1.5** — After `engine.destroy()`, `onFrame(cb)` and `offFrame(cb)` are no-ops (no error).
- **AC 1.6** — Callback calling `offFrame(itself)` during execution does not corrupt subsequent callbacks in the same frame.
- **AC 1.8** — A callback that calls `engine.destroy()` during execution: remaining snapshot callbacks still fire; any `setSectorColor` calls in those callbacks throw `'MapEngine: destroyed'` (caught by per-callback try/catch); `_flushPendingDirty()` is a no-op; no further rAF frames run.
- **AC 1.9** — `setSectorColor(hexKey, '###not-valid###')` fills with `{r:0,g:0,b:0}` without throwing (both `_inTick` paths). Sequential test: `setSectorColor('red')` then `setSectorColor('###invalid###')` → pixels are black (confirms `clearRect` resets singleton state).
- **AC 1.11** — Three callbacks; second throws; assert third fires and flush completes.
- **AC 1.12** — `setSectorColor(hexKey, 'red')` outside frame (immediate), then inside frame callback `resetSectorColor(hexKey)`: after frame, pixels match `sourceBuffer`; exactly one `putImageData` call.
- **AC 1.10** — Verify by grep (commands documented in `test/testUtils.ts` comment): `grep -rn 'internal/color' src/SectorRegistry.ts src/SectorBitmapParser.ts` returns empty; `grep -rn 'SectorRegistry\|SectorBitmapParser' src/internal/color.ts` returns empty.
- **AC 1.7 (example app)** — Before modifying `example/src/main.ts`, read the file in full. Check for **all four** upcoming IDs at once: `frame-counter`, `tick-counter`, `clock-speed`, and `neighbor-output`. If any already exist in v0.0.1, apply one of these conventions consistently: rename each existing element with a `-legacy` suffix, or prefix all new IDs with `v2-`. Document the chosen convention in a comment in `example/src/main.ts` so Tasks 2.2 and 3.3 follow the same convention. Add a DOM element `<div id="frame-counter">` showing a live frame count (incremented via `onFrame`). Add a sector that visibly pulses color on each frame (e.g., cycles through a palette via `setSectorColor` inside an `onFrame` callback). New elements are additive — do not remove or alter existing v0.0.1 functionality.

**Done when:** `npm run test` passes (all ACs); `npm run typecheck` and `npm run typecheck:example` pass; `npm run format` applied; frame counter and pulsing sector visible at `localhost:3000` without opening DevTools.
