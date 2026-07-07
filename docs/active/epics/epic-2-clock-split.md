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

Extract the Main-side timing surface from `GameClock` without breaking it. `MapEngine.onFrame`/`offFrame` migrate to `RenderClock` internally; `GameClock` stays exported and functional through the deprecation window.

**Work:**

- Create `src/RenderClock.ts` with the float-accumulator pattern from `GameClock`, driven by the existing rAF loop in `MapRenderer`.
- Point `MapEngine`'s frame-callback plumbing at `RenderClock`; mark `GameClock` `@deprecated` in TSDoc; export `RenderClock` from `src/index.ts`.

**Done when:** `test/FrameHook.test.ts` and `test/GameClock.test.ts` still pass unmodified; new `RenderClock` unit test covers accumulator behavior; typecheck passes.

---

### Task 2.2 — `yieldIfNeeded` helper (Worker)

**PRD Reference:** §"Process constraints"; ROADMAP §8 B3.b "Yield Helper Mandate".

Used by every Phase 4 worker computation (CA-4/5/6/8 all mandate ≤ 8 ms yield intervals).

**Work:**

- Create `src/worker/yield.ts` exporting `yieldIfNeeded(state): Promise<void>` — tracks `lastYield` (`performance.now()`); if < 8 ms elapsed, resolves synchronously (no microtask churn); otherwise awaits one `MessageChannel.postMessage(0)` round-trip and resets `lastYield`.

**Done when:** unit test (Node mode — no DOM deps) asserts: no yield under 8 ms; yield at ≥ 8 ms; a 50 ms busy-loop calling it allows an interleaved queued message to be processed.

---

### Task 2.3 — `SimulationClock` (Worker)

**PRD Reference:** §"Acceptance Criteria — Epic 2".

**Work:**

- Create `src/worker/SimulationClock.ts`: accumulator-driven fixed-tick clock at `tickHz` (from the `BOOTSTRAP` payload, default 60), zero DOM dependencies, driven by a `setInterval`/self-scheduling loop inside the Worker.
- Instantiate it in `src/worker/index.ts` on `BOOTSTRAP`; expose tick telemetry (tick count + timestamps ring) retrievable via a `CALL` method for test assertions.

**Done when:** worker integration test bootstraps a map, samples tick telemetry over ≥ 1 s, and asserts 60 Hz ± drift bound.

---

### Task 2.4 — Drift re-verification & jank isolation

**PRD Reference:** §"Acceptance Criteria — Epic 2"; ROADMAP §8 B3.b "Drift Re-verification".

**Work:**

- Run the drift fixture against `SimulationClock` (fixture expected values transfer directly — both clocks are float-accumulator based); assert ≤ ±1 ms over 100 ticks.
- Browser-mode test: bootstrap engine, busy-block Main for 100 ms (synchronous loop), then fetch tick telemetry and assert no missed/bunched ticks beyond the drift bound.

**Done when:** both tests green in `npm run test`; results recorded in PROGRESS.md session log.
