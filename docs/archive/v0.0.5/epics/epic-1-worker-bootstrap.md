# Epic 1: Worker Bootstrap (B3.a + Phase 3 Setup)

**Objective:** Stand up the Web Worker kernel and execute the one-time Transferable bootstrap of all registry buffers, with GPU index-texture upload and context-loss resilience in place first.
**Scope:** Incorporates PRD §"Epic 1 — Worker Bootstrap", §"Worker Message Protocol", §"GPU pipeline". Normative detail: ROADMAP §8 (B3.a, F-3.1, F-3.2, F-3.3).

**Verifiable & Measurable Success Criteria:**

- **Transfer discipline:** after `loadMap()` resolves, every one of the nine bootstrap typed arrays on Main has `byteLength === 0`.
- **Round-trip integrity:** `BOOTSTRAP_ACK` reports `sectorCount`, `totalEdges`, `firstSectorBBox`, `lastSectorBBox` equal to values captured on Main before transfer.
- **GPU resilience:** simulated `webglcontextlost`/`webglcontextrestored` results in the index texture being re-uploaded from `pixelIndicesMirror`; non-WebGL2 contexts throw `WebGL2NotSupportedError` at backend construction.
- **Clock baseline:** drift fixture confirms the existing `GameClock` holds ≤ ±1 ms over 100 ticks (F-3.2 gate for Epic 2).

---

## Tasks

### Task 1.1 — Phase 3 setup: GameClock drift verification (F-3.2)

**PRD Reference:** §"Acceptance Criteria — Epic 1" (first bullet).

Run `test/fixtures/game-clock/drift-100tick.json` against the existing `GameClock` and record the result. This is the baseline that Epic 2's `SimulationClock` re-verification compares against; it must precede any B3.b work.

**Work:**

- If a drift test consuming the fixture already exists in `test/GameClock.test.ts`, run it and record the measured drift in PROGRESS.md; if not, add one: drive `GameClock` through the fixture's 100 tick timestamps and assert accumulated drift ≤ ±1 ms.

**Done when:** the drift assertion passes in `npm run test`, and the measured value is recorded in the PROGRESS.md session log.

---

### Task 1.2 — Canonical errors module (`src/errors.ts`)

**PRD Reference:** §"Public API delta — Canonical errors", §"Documented Deviations" (item 2).

Create the error module every later epic depends on. All six new errors extend `Error` with correct `name` fields; `SectorLimitExceededError` moves here from `src/types.ts` with its public export preserved.

**Work:**

- Create `src/errors.ts` exporting: `WebGL2NotSupportedError`, `MappingRequiredError`, `PathNotFoundError`, `CostsRequiredError`, `ModeNotReadyError`, `MapInvalidatedError` (each `class X extends Error` with `this.name = 'X'`). Trigger semantics per ROADMAP §12.5 (Hardening Sync): `CostsRequiredError` — `findPath` before `setTraversalCosts` resolves; `MappingRequiredError` — mapping/aggregation preconditions (incl. `getGroupBBox` before first `aggregateGroups`); `ModeNotReadyError` — `registerMapMode`/`setMapMode` before `loadMap()` resolves.
- Move `SectorLimitExceededError` from `src/types.ts` into `src/errors.ts`; update `src/index.ts` to export it (and the new errors) from `'./errors'`; update all internal imports.

**Done when:** `npm run typecheck` and `npm run test` pass; `import { SectorLimitExceededError } from 'map-engine'` still resolves (example app compiles); `git grep 'class SectorLimitExceededError' src/types.ts` returns empty.

---

### Task 1.3 — GPU index texture + context-loss resilience (F-3.3)

**PRD Reference:** §"GPU pipeline"; ROADMAP §8 B3.a "GPU Synchronization".

Must land **before** Task 1.5's transfer: once `pixelIndices` is transferred, Main can no longer upload it. `SectorRegistry` already produces `pixelIndicesMirror` (`Uint16Array`), so only the backend work remains.

**Work:**

- In `ThreeRenderBackend`'s constructor, obtain the context explicitly via `canvas.getContext('webgl2')` (the constructor currently has no `gl` in scope — it calls `new THREE.WebGLRenderer({ canvas, antialias: false })` and lets Three.js create the context internally, so this call must be added) and pass the result to `THREE.WebGLRenderer` as `{ context: gl }`; if `!(gl instanceof WebGL2RenderingContext)`, throw `WebGL2NotSupportedError` before constructing the renderer.
- Add an index-texture upload path: create an `R32UI` (`gl.R32UI` / format `RED_INTEGER` / type `UNSIGNED_INT`) texture of `width × height` from `pixelIndices` with NEAREST filtering. Expose it to the palette shader work (Epic 4) via the backend's internals; no new public API.
- Register a `webglcontextrestored` listener on the canvas that re-uploads the index texture from `pixelIndicesMirror` (upcast per-pixel to the upload buffer) and marks the render loop dirty. `_dirty` lives on `MapRenderer`, not `ThreeRenderBackend`, and `MapRenderer` holds a one-way reference to `_backend` (no back-reference exists) — so wire this from `MapRenderer`, which already holds both `_registry.pixelIndicesMirror` and `_dirty`: `MapRenderer` registers the listener and invokes a backend re-upload method, then sets `this._dirty = true` itself, rather than having the backend reach back into `MapRenderer`.
- `NullRenderBackend` gains matching no-op members for the new upload/context-loss methods (F-2.8). Separately, retain a `.slice()` of the raw index data (`pixelIndices`) as inert storage for Epic 3's future `pick()`/`readSectorIdAt` rework — this task does **not** change `readSectorIdAt`'s existing packed-RGB return contract or its existing assertions in `test/NullRenderBackend.test.ts`.

**Done when:** a `*.gl.spec.ts` Playwright test creates the backend on a WebGL2 canvas without error and asserts a WebGL1-mocked context throws `WebGL2NotSupportedError` (e.g., pre-bind the test canvas via `canvas.getContext('webgl')` so the backend's own `canvas.getContext('webgl2')` call returns `null`, since a canvas may only ever bind one context type); a browser-mode test dispatches synthetic context-loss/restore events and asserts the re-upload path runs (spy on the upload method) and `MapRenderer._dirty === true`.

---

### Task 1.4 — `MapEngine.setTickRate(hz)`

**PRD Reference:** §"Public API delta"; ROADMAP §8 B3.a "API Addition".

**Work:**

- Add `setTickRate(hz: number): void` to `MapEngine`: throws `RangeError` if `Number.isNaN(hz) || hz < 1 || hz > 240` — a naive `hz < 1 || hz > 240` check silently accepts `NaN`, since every comparison with `NaN` evaluates to `false`, and the done-when below requires `NaN` to throw; throws `Error` if called after `loadMap()` has resolved; stores the value (default 60) for inclusion in the `BOOTSTRAP` payload (Task 1.5).
- Update `example/src/main.ts` to demonstrate the call before `loadMap` (public API change → example must track it).

**Done when:** unit tests cover: default 60, valid set, out-of-range throw (0, 241, NaN), post-`loadMap` throw; `npm run typecheck:example` passes.

---

### Task 1.5 — Worker entry + BOOTSTRAP transfer (B3.a)

**PRD Reference:** §"Worker Message Protocol", §"Documented Deviations" (item 1).

The core of the epic. Worker spins up in the `MapEngine` constructor; `loadMap()` performs the bootstrap after registry construction and after Task 1.3's GPU upload.

**Work:**

- Add `WorkerMessage` and `BootstrapAckPayload` types to `src/types.ts` per PRD §"Worker Message Protocol".
- Create `src/worker/index.ts`: `onmessage` dispatcher handling `BOOTSTRAP` (store buffers in a worker-side registry state object; reply `BOOTSTRAP_ACK` with `{sectorCount, totalEdges, firstSectorBBox, lastSectorBBox}`) and a `CALL`/`RESULT`/`ERROR` skeleton with monotonic `id` correlation (methods filled in by Epics 2, 3, 5–8 — Epic 2 Task 2.3 registers the first one, tick telemetry). Imports only Worker-safe modules (P-1/P-2).
- In `MapEngine`: construct the Worker (`new Worker(new URL('./worker/index.ts', import.meta.url), { type: 'module' })`) in the constructor; in `loadMap()`, after registry construction and index-texture upload, capture verification values, then `postMessage` the `BOOTSTRAP` payload with a transfer list containing `.buffer` of all nine typed arrays; await `BOOTSTRAP_ACK`.
- Keep `hexColors`, `sectorIds`, `pixelIndicesMirror`, `idToHex` Main-resident — they are **not** in the transfer list. Only `hexColors`/`sectorIds` reflect PRD Documented Deviation 1; `pixelIndicesMirror` (Main-resident per the normative memory contract itself, for F-3.3 context recovery) and `idToHex` (a plain `string[]`, never Transferable) were never bootstrap-transfer candidates in the first place.
- Immediately before the transfer, retain Main-side `.slice()` snapshots of `bboxes`, `centroids`, `adjacencyPointers`, `adjacencyNeighbors` (≤ ~1 MB at the 65,534-sector cap) and reroute the existing public `MapEngine.getNeighbors` to the snapshot — the CSR buffers it reads today detach at transfer, and Epic 3 builds `SharedRegistryProxy` on this same snapshot store (ROADMAP §12.4, Hardening Sync).
- Gate the public `engine.registry` getter: mark `@deprecated` and throw `MapInvalidatedError` once the transfer has occurred (ROADMAP §12.4) — post-transfer, buffer-backed registry methods would silently read zero-length arrays. Internal `this._registry` access continues (its non-buffer data — `idToHex`, sector data, `pixelIndicesMirror` — stays valid). Migrate the `test/MapEngine.test.ts` call sites that read `engine.registry` to the surviving `MapEngine` surface.
- `destroy()` terminates the Worker.

**Done when:** integration test asserts all nine buffers report `byteLength === 0` on Main post-`loadMap`, `BOOTSTRAP_ACK` values match pre-transfer captures, and `loadMap()` on a second, freshly constructed `MapEngine` instance re-bootstraps cleanly — note that `MapEngine`'s existing `destroy()` permanently sets `_destroyed = true` once a load has succeeded (`src/MapEngine.ts`), so the same instance cannot call `loadMap()` a second time; this criterion exercises the Worker/bootstrap path's tolerance of repetition via a new instance, not same-instance reuse; `npm run build` succeeds and `npm run size` stays < 15 KB gzipped.
