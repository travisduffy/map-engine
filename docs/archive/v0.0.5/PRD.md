# Product Requirements Document: Phase 3 — The Concurrent Kernel

> **Status: FINAL — implemented, tested, and audited to `[PASS]`** (`docs/audits/phase-3-audit.md`)
> **Version:** v0.0.5
> **Roadmap Phase:** Phase 3 (The Concurrent Kernel) of `docs/ROADMAP.md`
>
> This PRD governed Phase 3: moving the spatial kernel into a Web Worker under
> Transferable Ownership discipline (B3.a–c), replacing CPU pixel-iteration
> recoloring with a GPU fragment-LUT palette shader (B2), and exposing the
> public map-mode API (CA-7). Originally drafted as one PRD covering a
> combined Phase 3 + Phase 4 sprint; split out and archived as the v0.0.5
> release scope once Phase 3 passed its exit audit. Phase 4 continues under
> `docs/active/PRD.md`, targeting v0.0.6.

---

## Overview

Phase 3 moved the spatial kernel into a Web Worker under Transferable Ownership discipline (B3.a–c), replaced CPU pixel-iteration recoloring with a GPU fragment-LUT palette shader (B2), and exposed the public map-mode API (CA-7).

Phases 0–2 were already complete and audited (`docs/audits/phase-0/1/2-audit.md`, all `[PASS]`) when this phase began. The `SectorRegistry` already produced every SoA buffer the Worker bootstrap needed (`pixelIndices`, `pixelIndicesMirror`, `bboxes`, `centroids`, CSR adjacency, contours, `borderEdges`, `hexColors`/`sectorIds`), and `MapRenderer` was already decoupled from Three.js behind `IThreeRenderBackend`.

---

## Goals & Non-Goals

### Goals

1. **Worker relocation (B3.a–c):** simulation kernel in a Web Worker; registry buffers handed over via Transferable ownership at bootstrap; `SharedRegistryProxy` on Main with sync snapshot reads and async round-trip methods; `SimulationClock` (Worker) / `RenderClock` (Main) split.
2. **GPU palette pipeline (B2):** full-map recolor < 1 ms via fragment LUT; index texture uploaded once as `R32UI`; palette swaps touch only a uniform/LUT texture, never the index texture.
3. **Public palette API (CA-7):** `registerMapMode` / `setMapMode` with the ROADMAP §8 state machine (synchronous validation, dirty-flag discipline, registration atomicity per F-3.6, no-op semantics, lifecycle cleanup).

### Non-Goals

- Anything in ROADMAP §9 (Phase 4): pathfinding, aggregation, anchoring, dynamic borders, `GameClock` deletion — see `docs/active/PRD.md`.
- Anything in ROADMAP §10 (Phase 5): Svelte bindings (CA-10), QuickJS modding (CA-11), group-scope palettes (CA-12), WASM.
- Anything in ROADMAP §11 (Icebox/cancelled): SharedArrayBuffer, BigInt accumulators, multiplayer, `TEXTURE_2D_ARRAY` chunking, stripping Three.js.
- Version-number decisions of any kind (BDFL-only).

---

## Architecture

### New modules (canonical paths per ROADMAP §12.5)

| Component                       | Path                                | Thread | Epic |
| ------------------------------- | ----------------------------------- | ------ | ---- |
| Canonical errors                | `src/errors.ts`                     | shared | 1    |
| Worker entry (message dispatch) | `src/worker/index.ts`               | Worker | 1    |
| `SimulationClock`               | `src/worker/SimulationClock.ts`     | Worker | 2    |
| `RenderClock`                   | `src/RenderClock.ts`                | Main   | 2    |
| `yieldIfNeeded`                 | `src/worker/yield.ts`               | Worker | 2    |
| `SharedRegistryProxy`           | `src/worker/SharedRegistryProxy.ts` | Main   | 3    |

Existing modules that changed: `MapEngine` (worker lifecycle, new public API), `MapRenderer` (paused/resumed loop across bootstrap), `ThreeRenderBackend` (R32UI index texture, palette LUT, `readSectorIdAt`, context-loss listener), `src/types.ts` (`WorkerMessage`, `BootstrapAckPayload`, `MapModeId`), `src/index.ts` (export updates), `example/` (tracked every public API change).

### Worker Message Protocol (normative: ROADMAP §8 F-3.1)

- **`BOOTSTRAP` (Main → Worker):** payload `{pixelIndices, bboxes, centroids, adjacencyPointers, adjacencyNeighbors, contourPointers, contourPoints, borderEdges, borderEdgeCount, width, height, sectorCount, tickHz}`. The transfer list includes `.buffer` for every typed-array field; post-call, all nine buffers on Main have `byteLength === 0`. Image parsing happens entirely on Main; `sourceBuffer` is never sent to the Worker.
- **`BOOTSTRAP_ACK` (Worker → Main):** `{sectorCount, totalEdges, firstSectorBBox, lastSectorBBox}` verification scalars only — roadmap-normative (F-3.1, 2026-07-07 Hardening Sync); `hexColors`/`sectorIds` are Main-resident and never cross the Worker boundary.
- **`CALL`/`RESULT`/`ERROR`:** monotonic `id` correlation; `RESULT` may carry a `snapshot` refreshing the proxy's sync-read caches. This skeleton is the shared substrate Phase 4 (Epics 5–8) builds its own async methods on top of.

### GPU pipeline

`pixelIndices` is uploaded as an `R32UI` texture before its Transferable leaves Main (F-3.3); Main retains the immutable `Uint16Array` `pixelIndicesMirror` (already produced by `SectorRegistry`). `ThreeRenderBackend` registers a `webglcontextrestored` canvas listener that re-uploads the index texture from the mirror. If the context is not WebGL2, construction throws `WebGL2NotSupportedError`. The fragment shader resolves each fragment's sector ID from the index texture and looks its color up in a palette LUT; `updateUniforms({palette})` (production) and `_setPaletteUniformDirect` (`@internal`, benchmarks) both funnel into a single private `_writePaletteUniform(colors)`.

### Public API delta (all signatures normative in ROADMAP §8, §12.5)

| Method                                                   | Kind                |
| -------------------------------------------------------- | ------------------- |
| `setTickRate(hz: number): void`                          | sync, pre-`loadMap` |
| `pick(point): Promise<PickResult \| null>`               | async — new method  |
| `registerMapMode(id: string, colors: Uint32Array): void` | sync                |
| `setMapMode(id: string): void`                           | sync                |
| `dispose(): Promise<void>`                               | async               |

**Zero API Break Boundary:** `getNeighbors`, `getCentroid`, `getBBox` remained synchronous and hex-string-addressable throughout. The async `pick()` was the sole sanctioned signature break (ROADMAP §12.4) — it landed as a new method, since no `MapEngine.pick()` existed in code before this phase (the prior pipeline was the private `_handlePointerEvent` raycast handler).

**Canonical errors (`src/errors.ts`):** `WebGL2NotSupportedError`, `ModeNotReadyError` (thrown by `registerMapMode`/`setMapMode` before `loadMap()` resolves), `MapInvalidatedError` (thrown by in-flight async calls rejected on `loadMap`/`dispose`) were introduced this phase, alongside `MappingRequiredError`, `PathNotFoundError`, `CostsRequiredError` (pre-wired for Phase 4 consumers). `SectorLimitExceededError` relocated from `src/types.ts` (public export name unchanged). `loadMap()` and `dispose()` reject all in-flight async Promises with `MapInvalidatedError` and discard registered palette data. **`registry` getter gating (ROADMAP §12.4):** `MapEngine.registry` became `@deprecated` and throws `MapInvalidatedError` once the bootstrap transfer has detached the registry's buffers; the replacement surface is `getSector`/`getSectorKeys`/`getBBox`/`getCentroid`/`getNeighbors`, served from the pre-transfer `.slice()` snapshots Epic 1 retains.

### Process constraints

- Phase 3 milestones were strictly serial: B3.a → B3.b → B3.c → B2 → CA-7 (F-3.0).
- Worker code paths that can exceed 8 ms must call `yieldIfNeeded` (`MessageChannel`-based).
- Every epic's completion runs the CLAUDE.md post-task checklist; the phase exit additionally ran the four `bin/check-*.sh` scripts and followed the ROADMAP §3 audit protocol.
- Test split (F-2.7): logic tests in `*.spec.ts`/`*.test.ts` against `NullRenderBackend`; GL/visual/perf tests in `*.gl.spec.ts` under Playwright + real Chromium (F-3.5). Reference hardware: i7-12700K / RTX 3060 / Chrome 124 (F-C.5); CI tolerance 5.0× on software rendering.
- Core size budget: `npm run size` < 15 KB gzipped after every epic (P-9). Final: 9,171 bytes gzipped.

### Documented Deviations (historical record)

1. **`hexColors`/`sectorIds` stay on Main.** The BDFL-approved 2026-07-07 Hardening Sync folded this into `docs/ROADMAP.md` (§4 rows, F-3.1, B3.c) before implementation began: the arrays are Main-resident, never transferred, and `BOOTSTRAP_ACK` carries verification scalars only. The same sync replaced the `pick()` binary-search mandate with the O(1) Main-resident `idToHex` table.
2. **`SectorLimitExceededError` relocation** from `src/types.ts` to `src/errors.ts` aligned code with ROADMAP §12.5; `src/index.ts` re-exports it so the public surface is unchanged.
3. **`SectorRegistry.getSectorAt` reads `pixelIndicesMirror`, not `pixelIndices`.** Not in the original PRD text — required by code-truth once `pixelIndices` became one of the nine transferred/detached buffers. See `docs/audits/phase-3-audit.md` §5 Documented Deviation 2 for full rationale.
4. **`example/vite.config.ts` relative `base` + relative asset URLs.** Quickstart verification (Task 4.4) found built asset references and hardcoded `bitmapUrl`/`definitionUrl` were domain-root-relative, 404ing under GH-Pages-style subpath deployment. Fixed directly: `base: './'`, relative data URLs. See `docs/audits/phase-3-audit.md` §5 Documented Deviation 3.

---

## Acceptance Criteria

Falsifiable, per epic. Epic files (`docs/archive/v0.0.5/epics/`) break these into per-task done-when conditions.

### Epic 1 — Worker Bootstrap (B3.a + Phase 3 setup)

- F-3.2: drift fixture `test/fixtures/game-clock/drift-100tick.json` run against the existing `GameClock` confirms ≤ ±1 ms over 100 ticks before B3.b work starts.
- `src/errors.ts` exists with all seven canonical errors (six new + relocated `SectorLimitExceededError`); `npm run typecheck` passes; public exports unchanged except additions.
- Pre-transfer `.slice()` snapshots of `bboxes`/`centroids`/`adjacencyPointers`/`adjacencyNeighbors` are retained on Main so the shipped sync `getNeighbors` keeps working from the moment of transfer; `engine.registry` throws `MapInvalidatedError` post-transfer (ROADMAP §12.4).
- `setTickRate(hz)`: throws on `Number.isNaN(hz) || hz < 1 || hz > 240` (the explicit NaN clause is required — every bare comparison with `NaN` is `false`) and when called after `loadMap()` has resolved; defaults to 60; the value arrives in the `BOOTSTRAP` payload.
- After `loadMap()`: all nine bootstrap buffers on Main have `byteLength === 0`; `BOOTSTRAP_ACK` values (`sectorCount`, `totalEdges`, first/last bbox) match pre-transfer state. (Verified via `test/integration/bootstrap-transfer.spec.ts`, added during the exit audit remediation — see `docs/audits/phase-3-audit.md` §10.)
- `pixelIndices` is uploaded as an `R32UI` texture before transfer; `!(gl instanceof WebGL2RenderingContext)` throws `WebGL2NotSupportedError`; a `webglcontextrestored` listener re-uploads from `pixelIndicesMirror`.

### Epic 2 — Clock Split (B3.b)

- `SimulationClock` ticks in the Worker at `tickHz` (default 60); drift fixture re-run against `SimulationClock` holds ≤ ±1 ms over 100 ticks.
- Under a synthetic 100 ms Main-thread block, `SimulationClock.tick()` cadence stays steady at 60 Hz.
- `yieldIfNeeded` exists in `src/worker/yield.ts`, implemented via `MessageChannel.postMessage(0)`, and yields only when ≥ 8 ms have elapsed since the last yield.
- `GameClock` remains exported and functional (deprecation window ends in Epic 8, marked `@deprecated` this phase).

### Epic 3 — SharedRegistryProxy (B3.c)

- Sync snapshot reads (`getBBox`, `getNeighbors`, `getCentroid`) return correct values on Main immediately after an awaited async mutation (`test/integration/proxy-snapshot.spec.ts`).
- Rapid `loadMap → in-flight async → loadMap` rejects the first call's Promise with `MapInvalidatedError` (`test/integration/lifecycle-invalidation.spec.ts`).
- `pick()` returns `Promise<PickResult | null>`; resolves `null` before a successful `loadMap`/`BOOTSTRAP_ACK` or when `readSectorIdAt` yields `0xFFFF`/invalid; otherwise resolves the hex key via the O(1) Main-resident `idToHex` table.
- `dispose()` terminates the Worker, releases GPU resources, and rejects in-flight Promises with `MapInvalidatedError`.

### Epic 4 — GPU Palette + CA-7 + Phase 3 exit (B2, CA-7)

- Full-map recolor completes in < 1 ms (Playwright + real Chromium, `performance.now()` bracketing; measured 0.4ms median on SwiftShader software rendering — reference-hardware re-verification recommended but not blocking); palette swaps write only the palette uniform/LUT — zero index-texture uploads.
- `registerMapMode` throws synchronously on duplicate ID and on `colors.length !== sectorCount`; `setMapMode` throws `Error('Unknown map mode: <id>')` on unknown ID.
- `setMapMode(id)` triggers exactly one render submit on the next rAF; a second consecutive `setMapMode(currentId)` triggers zero submits and zero uniform writes.
- Registration atomicity (F-3.6, Hardening Sync): `registerMapMode` and `setMapMode` are fully synchronous — no `pendingMapMode` buffering, no `'mapModeRegistrationFailed'` event; both throw `ModeNotReadyError` before `loadMap()` resolves; registered palette data is discarded on `loadMap()`/`dispose()`.
- Phase 3 exit: multi-threaded integrity tests green in CI ∧ Hobbyist Quickstart (1-hour GH Pages sample using only the public API) verified via a committed, reproducible artifact (`bench/quickstart-verify.spec.ts`) ∧ `docs/audits/phase-3-audit.md` carries a `[PASS]` verdict.

---

## What This Version Explicitly Does Not Include

- **Phase 4 (all of it):** CA-4 Pathfinding, CA-5 Aggregation, CA-8 Anchoring, CA-6 Dynamic Borders, `GameClock` deletion — see `docs/active/PRD.md`.
- **Phase 5 (all of it):** CA-10 Svelte 5 OMT bindings, CA-11 QuickJS modding, CA-12 group-scope palettes, WASM anything.
- **Cancelled milestones (ROADMAP §11.1):** BigInt accumulator, SharedArrayBuffer transport, async texture swap, multi-writer sync, state history buffers, multiplayer netcode, advanced AI.
- **Exclusions (§11.2):** stripping Three.js, `TEXTURE_2D_ARRAY` chunking.
- Version bumps, `package.json` version edits, or any named future version (BDFL-only, per CLAUDE.md Versioning Policy).

---

## Known Risks (as assessed during Phase 3)

| #   | Risk                                                                                                                                                                             | Mitigation                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Vitest browser mode cannot spy across the Worker boundary** — B3 acceptance (drift under Main-thread block, transfer-list assertions) needs real `Worker` + `postMessage`.     | Ran worker integration specs in browser mode with real Workers; asserted observable effects (`byteLength === 0`, message payloads) rather than internal spies.                                                        |
| 2   | **Perf gate (< 1 ms recolor) is hardware-relative** and CI may be software-rendered.                                                                                             | Per ROADMAP §12.2: perf gate detects renderer via `WEBGL_debug_renderer_info` and applies the 5.0× software tolerance only when SwiftShader/llvmpipe is detected; raw median (0.4ms) cleared the strict bound anyway. |
| 3   | **Breaking `pick()` change ripples into the example app and existing tests.**                                                                                                    | Sanctioned (§12.4). Epic 3 migrated `example/src/main.ts` and every test calling `pick()` in the same task.                                                                                                           |
| 4   | **Documented Deviation 1** (`hexColors`/`sectorIds` Main-resident) could be rejected by the phase audit as strategic drift.                                                      | Retired: the 2026-07-07 Hardening Sync folded the deviation into the roadmap itself (§4, F-3.1, B3.c) before implementation, so there was no doc/plan divergence for the auditor to rule on.                          |
| 5   | **Worker + Vite build interplay:** `new Worker(new URL(...))` must survive both dev (alias into `src/`) and library build without bundling Three.js or blowing the 15 KB budget. | Worker entry imports only Worker-safe modules (P-1/P-2); `npm run size` gate after every epic; example app exercises the built worker path.                                                                           |
