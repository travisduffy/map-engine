# Epic 2: The Game Clock

**Objective:** Ship `GameClock` as a standalone export — a speed-configurable, pausable clock driven by the Frame Hook accumulator, firing `onTick` callbacks at a consistent rate decoupled from render frame rate.
**Scope:** Incorporates PRD §2 (CA-9) and the Universal Example App Coverage requirement. Depends on Epic 1 (CA-1) being merged first — `GameClock` registers an `onFrame` callback at construction.

**Verifiable & Measurable Success Criteria:**

- **Tick rate accuracy:** At speed 1× and `ticksPerSecond: 1`, driving `dt = 1.0s` (primed) fires exactly 1 tick; the accumulator algorithm matches the fixed-step spec in PRD §2.3 with `MAX_TICKS_PER_FRAME = 10` spiral-of-death cap.
- **Pause / resume / speed:** `pause()` freezes accumulated progress; `resume()` restores the last non-zero speed; `setSpeed(n)` with negative `n` clamps to 0; `_lastSpeed` invariant (`> 0` at all times) holds across all paths.
- **Destroy lifecycle:** `clock.destroy()` calls `engine.offFrame(internalFrameCallback)`, no further ticks fire, subsequent method calls are all no-ops. `engine.destroy()` while clock is running also silences the clock.
- **Import isolation:** `src/GameClock.ts` contains zero imports from `three`, DOM APIs, or `src/internal/color.ts`.
- **Example app:** `localhost:3000` shows `id="tick-counter"` updating on each tick, `id="clock-speed"` reflecting the current multiplier, and interactive speed controls — all without opening DevTools.

---

## Tasks

### Task 2.1 — `GameClock` Implementation

**PRD Reference:** §2.1 (types); §2.2 (class shape and constructor); §2.3 (accumulator algorithm); §2.4 (`setSpeed`/`pause`/`resume`); §2.5 (`onTick`/`offTick`); §2.6 (`destroy()`); §2.7 (constraints)

Creates the complete `GameClock` class, adds the `ClockTickCallback` type, and wires the export. This is a self-contained task — no changes to existing source files beyond `src/types.ts` and `src/index.ts`. Depends on Epic 1 Task 1.3 for `engine.onFrame`/`engine.offFrame`.

**Work:**

- Add `ClockTickCallback` type to `src/types.ts`:
  ```typescript
  // elapsed is the 1-indexed count of ticks fired since this GameClock was constructed,
  // including the current one. The first tick's callback receives elapsed === 1.
  type ClockTickCallback = (elapsed: number) => void
  ```
- Create `src/GameClock.ts`. Class shape:
  ```typescript
  class GameClock {
    constructor(engine: MapEngine, options?: { ticksPerSecond?: number })
    setSpeed(multiplier: number): void
    pause(): void
    resume(): void
    onTick(callback: ClockTickCallback): void
    offTick(callback: ClockTickCallback): void
    get paused(): boolean
    get speed(): number
    get elapsed(): number
    destroy(): void
  }
  ```
- Private fields: `_speed = 1`, `_lastSpeed = 1`, `_elapsed = 0`, `_accumulator = 0`, `_intervalSeconds: number`, `_tickCallbacks: ClockTickCallback[] = []`, `_destroyed = false`. Store `_engine: MapEngine` for `destroy()`.
- **Constructor:** Validate `ticksPerSecond` (defaults to `1`): if `≤ 0`, non-finite, or `NaN`, throw `TypeError('GameClock: ticksPerSecond must be a finite positive number')`. Set `_intervalSeconds = 1 / ticksPerSecond`. Call `engine.onFrame(this._internalFrameCallback)`.
- **`_internalFrameCallback` (arrow function field):** Module-scope constant `const MAX_TICKS_PER_FRAME = 10` (not exported, not a constructor option). Accumulator algorithm per PRD §2.3:
  - If `this._speed === 0`, return early (skip accumulation entirely).
  - `this._accumulator += dt * this._speed`
  - Declare `let ticks = 0` before the while loop. Loop condition: `this._accumulator >= this._intervalSeconds && ticks < MAX_TICKS_PER_FRAME`. Inside each iteration: `this._accumulator -= this._intervalSeconds; this._elapsed++; for (const cb of [...this._tickCallbacks]) { try { cb(this._elapsed) } catch (err) { console.error('[map-engine] ClockTickCallback threw:', err) } } ticks++`.
  - After the loop: if `ticks === MAX_TICKS_PER_FRAME`, set `this._accumulator = 0` (discard remaining accumulated time to avoid a catch-up burst on the next frame).
  - Note: each tick **re-snapshots** `_tickCallbacks` (the `[..._tickCallbacks]` spread is inside the while loop, not outside it). This means `onTick(newCb)` called during tick N causes `newCb` to fire on tick N+1 within the same frame — B-5 distinction from `FrameCallback` snapshot semantics.
- **`get` accessors:** `get paused(): boolean { return this._speed === 0 }`, `get speed(): number { return this._speed }`, `get elapsed(): number { return this._elapsed }`.
- **`setSpeed(n)`:** if `_destroyed`, return. Clamp: `n = Math.max(0, n)`. Update `_speed = n`. If `n > 0`, also update `_lastSpeed = n`.
- **`pause()`:** if `_destroyed` or `_speed === 0`, return. `_lastSpeed = _speed; _speed = 0`.
- **`resume()`:** if `_destroyed` or `_speed > 0`, return. `_speed = _lastSpeed`.
- **`onTick(cb)`:** if `_destroyed`, return. Push to `_tickCallbacks`.
- **`offTick(cb)`:** if `_destroyed`, return. Splice first occurrence by `===`.
- **`destroy()`:** `if (this._destroyed) return` (guard check per PRD §2.6 — `destroy()` participates in the same destroyed-guard pattern as all other public methods; this is the sole mechanism for the no-op guarantee). Set `_destroyed = true`. Call `this._engine.offFrame(this._internalFrameCallback)`. Clear `this._tickCallbacks = []`.
- Export from `src/index.ts`: `export { GameClock } from './GameClock'`. Import `MapEngine` in `GameClock.ts` only for the type annotation — this creates no circular dependency issue since `MapEngine` is imported for its type, not its module-level side effects.

**Done when:** `npm run typecheck` and `npm run build` pass; `GameClock` importable from `'map-engine'`; `grep -n 'three\|document\|window\|HTMLCanvasElement\|OffscreenCanvas\|internal/color' src/GameClock.ts` returns zero matches (AC 2.14).

---

### Task 2.2 — Epic 2 Tests and Example App

**PRD Reference:** §"Acceptance Criteria — Epic 2" (ACs 2.1–2.14); §"Universal: Example App Coverage" (AC 2.10); §"Test Harness Strategy" (priming convention, `vi.useFakeTimers`, `advanceFrame`)

Writes the full test suite for Epic 2 and adds the clock demo to the example app. All tests use `advanceFrame` from `test/testUtils.ts` and the standard preamble from PRD Test Harness Strategy. **Priming is required before any non-zero-dt measurement:** call `advanceFrame(renderer, 1)` once (produces `dt === 0`, sets `_lastFrameTime`), then subsequent calls produce real `dt`.

**Work:**

- Create a new test file following v0.0.1 naming convention. Use `vi.useFakeTimers({ toFake: ['performance'] })` in `beforeEach` (not just `vi.useFakeTimers()` — must explicitly include `'performance'`). Use the standard preamble to load an engine + extract renderer + cancel live rAF loop. Construct `new GameClock(engine, { ticksPerSecond: 1 })` after the engine is loaded. `afterEach` must call `vi.useRealTimers()`.
- **AC 2.1** — Prime first (`advanceFrame(renderer, 1)` → `dt === 0`, sets `_lastFrameTime`). Then: `advanceFrame(renderer, 1000)` → 1 tick. `setSpeed(2)` + `advanceFrame(renderer, 500)` → 1 more tick. `advanceFrame(renderer, 2000)` at speed 0.5× → 1 tick. Registration order within a tick. B-5 test: register a callback via `onTick` that, on its first invocation (`elapsed === 1`), calls `onTick(newCb)` **and also calls `offTick(itself)`** (removes itself). Prime with `advanceFrame(renderer, 1)`. Then `clock.setSpeed(10)` then `advanceFrame(renderer, 1000)` — dt = 1.0s × 10 = 10.0 accumulated → 10 ticks. Assert `newCb` fires 9 times (`elapsed === 2` through `10`). Use `expect(clock['_accumulator']).toBeCloseTo(0, 10)` not strict `=== 0`.
- **AC 2.2** — `pause()` stops accumulator; `resume()` restores pre-pause speed. Accumulated-progress deterministic test (prime first with `advanceFrame(renderer, 1)`): `advanceFrame(renderer, 500)` → accumulator = 0.5, 0 ticks. `clock.pause()`. `advanceFrame(renderer, 10000)` → 0 ticks (paused; accumulator stays at 0.5). `clock.resume()`. `advanceFrame(renderer, 500)` → accumulator reaches 1.0, exactly 1 tick fires. Also assert: calling `clock.pause()` a second time while already paused is a no-op — assert `clock.paused === true`, `clock.speed === 0`, and `clock['_lastSpeed'] > 0` after the redundant pause call (verifies the `_lastSpeed` invariant is not corrupted).
- **AC 2.3** — `setSpeed(0)` pauses; negative values clamped to 0; `setSpeed(n > 0)` takes effect immediately.
- **AC 2.4** — `elapsed` starts at 0; increments before callback receives it; never decreases.
- **AC 2.5** — Prime first. `advanceFrame(renderer, 11000)` → exactly 10 ticks; `clock['_accumulator']` is `toBeCloseTo(0, 10)`. Follow-up `advanceFrame(renderer, 100)` → 0 ticks (accumulator was reset to 0 by the cap). Below-cap: `advanceFrame(renderer, 9500)` → 9 ticks; accumulator `toBeCloseTo(0.5, 10)`.
- **AC 2.6** — `offTick(itself)` during iteration does not corrupt subsequent callbacks.
- **AC 2.7** — After `clock.destroy()`, no ticks fire; second `destroy()` is a no-op.
- **AC 2.8** — `onTick`/`offTick` after `destroy()` are no-ops.
- **AC 2.9** — `GameClock` registers exactly one `onFrame` callback; `destroy()` unwires it. **Write this as a standalone test that does not use the `beforeEach` clock** — having two `GameClock` instances on the same engine would register two `onFrame` callbacks and invalidate the one-callback assertion. Inside the test body: call `vi.useFakeTimers({ toFake: ['performance'] })`, construct a fresh `MapEngine` + `loadMap` using the standard fixtures + cancel the live rAF loop (`cancelAnimationFrame(renderer['_animFrameId'])`), call `advanceFrame(renderer, 1)` to prime (sets `_lastFrameTime`), _then_ construct `new GameClock(engine, { ticksPerSecond: 1 })`. Then `advanceFrame(renderer, 500)` — assert zero ticks fire and `clock['_accumulator']` is `toBeCloseTo(0.5, 10)`. Also assert `clock.destroy()` unwires the callback — after `clock.destroy()`, `advanceFrame(renderer, 1000)` fires zero additional ticks. Tear down with `engine.destroy()`, `canvas.remove()`, `vi.useRealTimers()` — either in `afterEach` or inline `try/finally`.
- **AC 2.11** — `engine.destroy()` while clock running: no further ticks fire; `clock.destroy()` afterward is a no-op; readable properties still return last values.
- **AC 2.12** — Bootstrap pause/resume: `setSpeed(0)` then `resume()` → speed back to 1. `pause()` immediately after construction then `resume()` → speed 1.
- **AC 2.13** — `ticksPerSecond: 0`, `-1`, `Infinity`, `NaN` throw `TypeError` with correct message. `ticksPerSecond: 0.5` does not throw.
- **AC 2.14** — Grep check: zero matches for `three|document|window|HTMLCanvasElement|OffscreenCanvas|internal/color` in `src/GameClock.ts`.
- **AC 2.10 (example app)** — Before modifying `example/src/main.ts`, read the file in full. Add `<div id="tick-counter">` showing the current `elapsed` tick count, `<div id="clock-speed">` showing the current speed multiplier, and interactive speed controls (buttons or slider) for `setSpeed`, `pause`, `resume`. Existing v0.0.1 functionality must be preserved — new elements are additive.

**Done when:** `npm run test` passes (all ACs); `npm run typecheck` and `npm run typecheck:example` pass; `npm run format` applied; tick counter updates visibly and speed controls function at `localhost:3000`.
