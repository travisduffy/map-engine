# Epic 2: Clock Split — SimulationClock & RenderClock (B3.b)

**Objective:** Relocate simulation timing into the Worker (`SimulationClock`) while Main keeps a rAF-aligned `RenderClock`, with a cooperative yield helper so heavy Worker tasks never starve the message loop.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 2". Normative detail: ROADMAP §8 (B3.b), §12.5 module layout.

**Verifiable & Measurable Success Criteria:**

- **Drift parity:** the drift fixture (`test/fixtures/game-clock/drift-100tick.json`) passes against `SimulationClock` at ≤ ±1 ms over 100 ticks — same bound Task 1.1 established for `GameClock`.
- **Jank isolation:** with the Main thread synthetically blocked for 100 ms, `SimulationClock.tick()` cadence in the Worker holds steady 60 Hz (tick-interval variance within the drift bound).
- **Cooperative yielding:** `yieldIfNeeded` yields via `MessageChannel` only when ≥ 8 ms elapsed; a queued `postMessage` is observed to interleave a long loop that calls it.
- **No breakage:** `GameClock` remains exported and all existing tests pass (deletion is Epic 8).

---

## Tasks

### Task 2.1 — `RenderClock` (Main)

**PRD Reference:** §"New modules"; ROADMAP §8 B3.b ("Keep `RenderClock` on Main for rAF integration").

Extract the Main-side timing surface that `onFrame`/`offFrame` already use — today it is inlined as a `hook` closure inside `MapEngine.loadMap()` (raw per-frame `dt`, computed from a stored last-frame timestamp, dispatched to `_frameCallbacks` on every rAF tick — no tick-accumulation involved). `GameClock` is a separate, higher-level consumer built _on top of_ that raw dispatch (it calls `engine.onFrame(...)` and layers its own fixed-tick `_accumulator`/`MAX_TICKS_PER_FRAME` conversion). This task moves the raw dispatch into `RenderClock`; it does **not** touch `GameClock`'s own accumulator logic, which stays in `GameClock.ts` unmodified. `GameClock` stays exported and functional through the deprecation window (it keeps working unmodified because `onFrame`'s public contract is unchanged).

**Work:**

- Create `src/RenderClock.ts` that owns the raw per-frame dt-dispatch logic currently inlined in `MapEngine.loadMap`'s `hook` closure: track the last-frame timestamp (first frame `dt === 0`), invoke the registered frame callbacks with `dt` each rAF tick, and preserve the existing `_inTick` guard plus the `renderer._flushPendingDirty()` call in a `finally` block — `_flushPendingDirty()` is currently only ever called from this closure (`src/MapEngine.ts`), so dropping it would silently break dirty-rect flushing for `setSectorColor` calls made from inside a frame callback.
- Point `MapEngine`'s frame-callback plumbing (`onFrame`/`offFrame`, the `hook` passed into `MapRenderer`) at `RenderClock` internally; mark `GameClock` `@deprecated` in TSDoc; export `RenderClock` from `src/index.ts`.

**Done when:** `test/FrameHook.test.ts` and `test/GameClock.test.ts` still pass unmodified; new `RenderClock` unit test covers its dt-tracking behavior (first-frame `dt === 0`, subsequent real `dt`, and the dirty-flush coupling); typecheck passes.

---

### Task 2.2 — `yieldIfNeeded` helper (Worker)

**PRD Reference:** §"Process constraints"; ROADMAP §8 B3.b "Yield Helper Mandate".

Used by every Phase 4 worker computation (CA-4/5/6/8 all mandate ≤ 8 ms yield intervals).

**Work:**

- Create `src/worker/yield.ts` exporting `yieldIfNeeded(state): Promise<void>`, where `state` is a caller-owned `{ lastYield: number }`-shaped object (e.g. the Worker-side registry state object from Task 1.5) so every call site shares one yield clock: checks `state.lastYield` against `performance.now()`; if < 8 ms elapsed, returns without a `MessageChannel` round-trip; otherwise awaits one `MessageChannel.postMessage(0)` round-trip and sets `state.lastYield = performance.now()`.

**Done when:** unit test asserts (no DOM API usage — `MessageChannel` and `performance.now()` are both available under this repo's existing Vitest/Playwright browser-mode config, so no separate Node test environment is required): no yield under 8 ms; yield at ≥ 8 ms; a 50 ms busy-loop calling it allows an interleaved queued message to be processed.

---

### Task 2.3 — `SimulationClock` (Worker)

**PRD Reference:** §"Acceptance Criteria — Epic 2".

**Work:**

- Create `src/worker/SimulationClock.ts`: accumulator-driven fixed-tick clock at `tickHz` (from the `BOOTSTRAP` payload, default 60), zero DOM dependencies, driven by a `setInterval`/self-scheduling loop inside the Worker. The accumulator absorbs scheduling jitter regardless of which timer mechanism drives it, but must still cap per-iteration catch-up ticks the same way `GameClock` does (`MAX_TICKS_PER_FRAME = 10` in `src/GameClock.ts`), resetting the accumulator when the cap is hit — otherwise a long Worker-thread stall (e.g. unyielded heavy computation in a later epic) risks an unbounded tick-catch-up loop.
- Instantiate it in `src/worker/index.ts` on `BOOTSTRAP`; expose tick telemetry (tick count + timestamps ring) retrievable via a `CALL` method for test assertions.

**Done when:** worker integration test bootstraps a map, samples tick telemetry over ≥ 1 s, and asserts 60 Hz ± drift bound.

---

### Task 2.4 — Drift re-verification & jank isolation

**PRD Reference:** §"Acceptance Criteria — Epic 2"; ROADMAP §8 B3.b "Drift Re-verification".

**Work:**

- Run the drift fixture against `SimulationClock` (fixture expected values transfer directly — both clocks are float-accumulator based); assert ≤ ±1 ms over 100 ticks.
- Browser-mode test: bootstrap engine, busy-block Main for 100 ms (synchronous loop), then fetch tick telemetry and assert no missed/bunched ticks beyond the drift bound.

**Done when:** both tests green in `npm run test`; results recorded in PROGRESS.md session log.
