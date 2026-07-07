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

**Phase:** NO ACTIVE SPRINT — sprint fully prepared (PRD final, epics 1–8 written and hardened), **awaiting explicit BDFL activation**
**Active version:** None (targets "the next patch release"; BDFL names the version at release time)
**Next task:** On activation: Task 1.1 of Epic 1 (`docs/active/epics/epic-1-worker-bootstrap.md`)
**Blocking issues:** None. All five hardening-pass design questions were ruled by the BDFL on 2026-07-07 and are encoded in ROADMAP/PRD/epics (see the Hardening Sync session log entry).
**Hard sprint constraint:** Epics 5–8 (Phase 4) must not begin until `docs/audits/phase-3-audit.md` is `[PASS]` and merged to `main` (ROADMAP §3). Epic 4 Task 4.5 ends the Phase 3 session with `PHASE_EXIT_AWAITING_AUDIT`.

---

## Task Registry

### Epic 1: Worker Bootstrap (B3.a + Phase 3 Setup)

> Full spec: `docs/active/epics/epic-1-worker-bootstrap.md`

| Status | Task    | Description                                                                                |
| ------ | ------- | ------------------------------------------------------------------------------------------ |
| `[ ]`  | **1.1** | Phase 3 setup: GameClock drift verification vs fixture (F-3.2, ≤ ±1 ms)                    |
| `[ ]`  | **1.2** | Canonical errors module `src/errors.ts` (6 new + relocate `SectorLimitExceededError`)      |
| `[ ]`  | **1.3** | R32UI index texture upload + WebGL2 check + context-loss re-upload (F-3.3)                 |
| `[ ]`  | **1.4** | `MapEngine.setTickRate(hz)` (1–240, NaN-guarded, pre-`loadMap` only, default 60)           |
| `[ ]`  | **1.5** | Worker entry `src/worker/index.ts` + BOOTSTRAP transfer + ACK (9 buffers detached on Main) |

### Epic 2: Clock Split — SimulationClock & RenderClock (B3.b)

> Full spec: `docs/active/epics/epic-2-clock-split.md`

| Status | Task    | Description                                                          |
| ------ | ------- | -------------------------------------------------------------------- |
| `[ ]`  | **2.1** | `RenderClock` (Main) extraction; `GameClock` marked `@deprecated`    |
| `[ ]`  | **2.2** | `yieldIfNeeded` helper (`src/worker/yield.ts`, MessageChannel, 8 ms) |
| `[ ]`  | **2.3** | `SimulationClock` in Worker at `tickHz` with tick telemetry          |
| `[ ]`  | **2.4** | Drift re-verification (≤ ±1 ms) + 100 ms Main-block jank isolation   |

### Epic 3: SharedRegistryProxy (B3.c)

> Full spec: `docs/active/epics/epic-3-registry-proxy.md`

| Status | Task    | Description                                                                                  |
| ------ | ------- | -------------------------------------------------------------------------------------------- |
| `[ ]`  | **3.1** | Proxy skeleton: CALL/RESULT/ERROR correlation + snapshot refresh                             |
| `[ ]`  | **3.2** | Sync snapshot reads: `getBBox`/`getNeighbors`/`getCentroid` (hex + numeric)                  |
| `[ ]`  | **3.3** | `dispose()` + `MapInvalidatedError` rejection on `loadMap`/`dispose`                         |
| `[ ]`  | **3.4** | New async `pick()` (§12.4-sanctioned) + `readSectorIdAt` completion + example/test migration |

### Epic 4: GPU Palette Pipeline & Map Modes (B2 + CA-7) — Phase 3 Exit

> Full spec: `docs/active/epics/epic-4-palette-pipeline.md`

| Status | Task    | Description                                                                            |
| ------ | ------- | -------------------------------------------------------------------------------------- |
| `[ ]`  | **4.1** | Fragment LUT shader + `_writePaletteUniform` + `_setPaletteUniformDirect`              |
| `[ ]`  | **4.2** | B2 perf gate: full recolor < 1 ms (Playwright, real Chromium)                          |
| `[ ]`  | **4.3** | CA-7 `registerMapMode`/`setMapMode` state machine (F-3.6) + example map modes          |
| `[ ]`  | **4.4** | Hobbyist Quickstart verification (static host incl. subpath, no headers)               |
| `[ ]`  | **4.5** | Phase 3 exit: checks + `phase-3-audit.md` summary + `PHASE_EXIT_AWAITING_AUDIT` + halt |

### Epic 5: Pathfinding Primitives (CA-4) — gated on phase-3 audit PASS

> Full spec: `docs/active/epics/epic-5-pathfinding.md`

| Status | Task    | Description                                                                        |
| ------ | ------- | ---------------------------------------------------------------------------------- |
| `[ ]`  | **5.1** | Fixture `test/fixtures/pathfinding/grid-10k.json` (seed 42, 50 pairs)              |
| `[ ]`  | **5.2** | `SpatialGraph` A\* in Worker (typed-array heap, yield ≤ 8 ms, `PathNotFoundError`) |
| `[ ]`  | **5.3** | Public `setTraversalCosts` + `findPath` + example path demo                        |
| `[ ]`  | **5.4** | Perf gate (< 2 ms, P95) + drift assertion (≤ ±2 ms) (F-4.7)                        |

### Epic 6: Hierarchical Aggregation (CA-5)

> Full spec: `docs/active/epics/epic-6-aggregation.md`

| Status | Task    | Description                                                                     |
| ------ | ------- | ------------------------------------------------------------------------------- |
| `[ ]`  | **6.1** | Shared infra: `_postRenderHook` + 4-buffer Transferable ring pool (F-C.7/F-C.8) |
| `[ ]`  | **6.2** | Fixtures `test/fixtures/mappings/regions.json` + maps (≥ 5 cases)               |
| `[ ]`  | **6.3** | Worker aggregation + `setParentMapping`/`aggregateGroups`/`getGroupBBox`        |
| `[ ]`  | **6.4** | Drift assertion during aggregation (≤ ±2 ms)                                    |

### Epic 7: Spatial Anchoring (CA-8)

> Full spec: `docs/active/epics/epic-7-anchors.md`

| Status | Task    | Description                                                            |
| ------ | ------- | ---------------------------------------------------------------------- |
| `[ ]`  | **7.1** | Polylabel (Pole of Inaccessibility) over contour segments, Worker-safe |
| `[ ]`  | **7.2** | `computeAnchors`/`getAnchor` wiring + example anchor markers           |
| `[ ]`  | **7.3** | 100% `anchor-shapes.json` pass + interiority + drift assertion         |

### Epic 8: Dynamic Perimeter Rendering (CA-6) + Sprint Finality

> Full spec: `docs/active/epics/epic-8-borders-finality.md`

| Status | Task    | Description                                                                            |
| ------ | ------- | -------------------------------------------------------------------------------------- |
| `[ ]`  | **8.1** | Fixture `test/fixtures/borders/perimeter-cases.json` + generator                       |
| `[ ]`  | **8.2** | Worker perimeter extraction (dedup via `pixelIndices` resample) + coalescing (F-4.9)   |
| `[ ]`  | **8.3** | `BorderRenderer` + `uploadBorderEdges` GPU VBO (F-C.9) + `getBorderSegments`           |
| `[ ]`  | **8.4** | 1,000-frame soak + drift + F-4.10 context-loss recovery (< 100 ms)                     |
| `[ ]`  | **8.5** | Delete `src/GameClock.ts`; migrate all imports (Finality Audit item)                   |
| `[ ]`  | **8.6** | Phase 4 exit: checks + `phase-4-audit.md` summary + `PHASE_EXIT_AWAITING_AUDIT` + halt |

---

## Session Log

> Entries are prepended (newest first). Each entry records the date, what was attempted, what was completed, and any decisions made that aren't captured elsewhere.

### 2026-07-07 — BDFL rulings + Hardening Sync (ROADMAP revision pass)

**Tasks touched:** none (documentation only)
**Outcome:** completed

**What happened:**
BDFL authorized best-judgment resolution of the five open rulings and a roadmap revision pass syncing all deferred defects. `docs/ROADMAP.md` revised (revision-history entry `2026-07-07-hardening-sync`); `docs/ROADMAP_TRACEABILITY_MATRIX.md` rows 327–333 added and the Phase-1/2 freeze footer lifted (Phase 2 audit merged). PRD and epics 1/3/4/5/6 updated; all hedge/open-question text replaced with decided behavior.

**Decisions made (BDFL rulings, now normative):**

1. `CostsRequiredError` added (ROADMAP §9 CA-4, §12.5): `findPath` before `setTraversalCosts` rejects — explicit failure over silently plausible hop-count paths; the engine never invents game state (P-4). Errors module is now 6 new + 1 relocated.
2. `engine.registry` getter: `@deprecated`, throws `MapInvalidatedError` post-transfer (ROADMAP §12.4); Epic 1 retains pre-transfer `.slice()` snapshots of `bboxes`/`centroids`/`adjacency*` (≤ ~1 MB at the sector cap) so the shipped sync `getNeighbors` keeps working from the moment of transfer; Epic 3 builds the proxy on that same store.
3. `pick()` resolves hex keys via the O(1) Main-resident `idToHex` table — the binary-search mandate is removed; `hexColors`/`sectorIds` remain Main-resident for packed-RGB→ID lookups only (PR-3).
4. F-3.6 rewritten as Registration Atomicity: `registerMapMode` is fully synchronous, so `pendingMapMode` buffering and the `'mapModeRegistrationFailed'` event are removed as unreachable states (PR-4).
5. `MappingRequiredError` trigger widened (§12.5) to also cover group accessors (`getGroupBBox`) before the first `aggregateGroups` resolution.

**ROADMAP defects fixed (formerly deferred):** §4 `contourPoints` row corrected to `totalContourSegments * 4` `[x1,y1,x2,y2]` segments; B1.e/CA-8 corrected to the shipped unordered segment list (Code-Truth); `yieldIfNeeded(state: { lastYield: number }): Promise<void>` signature specified in B3.b; A0.3 tolerance documented as a test constant, not a fixture field; CA-5 fixture schema gained the `definition` field fixing the numeric-ID space; F-3.1 `BOOTSTRAP_ACK` reduced to verification scalars and §4 `hexColors`/`sectorIds` rows made Main-resident — former PRD Documented Deviation 1 is retired, folded into the roadmap.

**Left off at:**
`docs/` fully synced (ROADMAP ↔ matrix ↔ PRD ↔ epics ↔ code truth); all four consistency scripts pass. Sprint still NOT activated — awaiting explicit BDFL "start the sprint"; first task remains Epic 1, Task 1.1 with no open questions.

### 2026-07-07 — Sprint hardening pass (per-epic subagent fan-out)

**Tasks touched:** none (documentation hardening only — no implementation)
**Outcome:** completed

**What happened:**
Ran the `sprint-hardening` skill: 8 parallel subagents, one per epic file, each verifying traceability, code truth, executability, contradictions, and gotchas against `src/`, `test/`, `bench/`, `package.json`, and ROADMAP. All four `bin/check-*.sh` scripts passed before and after. ~40 findings; every epic file received fixes. Highest-impact corrections: (1) Epic 1's "second `loadMap` re-bootstraps" done-when was unexecutable — `destroy()` permanently disables the instance — now tests a fresh instance; (2) Epic 2 had misattributed the raw per-frame dt dispatch to `GameClock` — it lives in `MapEngine.loadMap`'s `hook` closure with a load-bearing `_flushPendingDirty()` call; (3) Epic 3's `pick()` framed as a signature change but no `MapEngine.pick()` exists — it is a new method — and `readSectorIdAt` needed bitmap-pixel coordinate-space + Y-inversion specification; (4) Epic 5's synthetic CSR fixture cannot pass through `loadMap()` (no bitmap) — perf gate now drives `SpatialGraph` directly in a Worker; unreachability is graph disconnection, not "cost walls"; costs restricted 1–255; (5) Epic 7's fixtures are continuous-coordinate polygons (`{id, type, points, expectedAnchor}`, no `tolerancePx` field, no bitmaps) — acceptance test redefined as direct polylabel calls; B1.e contours verified to be unordered segment lists, not rings (PRD updated to match); (6) Epic 8's perimeter extraction needed neighbor-resampling via `pixelIndices` + edge dedup (naive walk double-emits into a fixed-capacity buffer that silently drops OOB writes) and the pixel→world transform for `BorderRenderer`; (7) Epic 4 added `MAX_TEXTURE_SIZE` LUT wrap guard, the `MapRenderer` `_inTick` migration span, `ModeNotReadyError` semantics (pre-`loadMap` guard), and a non-reference-hardware perf fallback; (8) Epic 6 pinned the ring pool to 4 buffers total (not 4 per side), added mapping-value bounds validation and sharp `dither: 0` fixture mandate, and mandated companion definition files fixing the numeric-ID space.

**Decisions made:**

- PRD updated (5 edits): `pick()` documented as a new method (not a signature change); `setTickRate` NaN guard made explicit; `tolerancePx` phantom field removed from Epic 7 acceptance; "contour rings" corrected to "contour segments" (×2, matching code truth).
- Epic 1 Task 1.5 cross-reference corrected: the CALL skeleton is first consumed by Epic 2 (tick telemetry), then 3, 5–8.
- **NEEDS BDFL RULING (5 items, recorded here; docs left non-committal at each site):** (1) `findPath` before `setTraversalCosts`: add a `CostsRequiredError` canonical error vs. default all costs to 1 (Epic 5); (2) public `engine.registry` getter exposes detached buffers post-transfer — deprecate, guard, or leave (Epic 3 Task 3.2 open-question bullet); (3) ROADMAP-mandated binary search over `hexColors`/`sectorIds` for `pick()` is redundant next to O(1) Main-resident `idToHex` (Epic 3); (4) ROADMAP F-3.6 describes in-flight buffering for a `registerMapMode` that is elsewhere fully synchronous — incoherent as written; implementers must not invent async semantics (Epic 4 Task 4.3 callout); (5) `getGroupBBox` pre-aggregation reuses `MappingRequiredError`, slightly widening its documented trigger (Epic 6 Task 6.3 note).
- **Deferred ROADMAP defects (user-gated review pass required; not fixed):** §4 `contourPoints` row says `[x,y]` pairs but code stores `[x1,y1,x2,y2]` segments (`src/SectorRegistry.ts:41`); pass-8.1 changelog claims a `yieldIfNeeded` signature that appears nowhere in the body; A0.3's `tolerancePx ≤ 1.0` implies a per-fixture field that does not exist in `anchor-shapes.json`; CA-5 fixture schema lacks the definition-file field that fixes the numeric-ID space; F-3.6 incoherence above.

**Left off at:**
Sprint docs hardened and consistent; still awaiting explicit BDFL "start the sprint" instruction. First implementation step remains Epic 1, Task 1.1. The five BDFL rulings can be given at activation time or when their epics are reached.

### 2026-07-07 — Sprint preparation: PRD + epics for all remaining roadmap work

**Tasks touched:** none (preparation only — no implementation)
**Outcome:** completed

**What happened:**
Analyzed `docs/ROADMAP.md` against code and audit state. Confirmed Phases 0–2 closed (`phase-0/1/2-audit.md` all `[PASS]`); outstanding work is exactly Phase 3 (B3.a, B3.b, B3.c, B2, CA-7) and Phase 4 (CA-4, CA-5, CA-8, CA-6, F-4.10, GameClock deletion). Phase 5 is human-gated and excluded. Verified code truth: no `src/worker/`, `src/RenderClock.ts`, `src/errors.ts`, or `src/render/BorderRenderer.ts` exist; `SectorRegistry` already ships all bootstrap buffers including `pixelIndicesMirror` and `hexColors`/`sectorIds`; `MapRenderer` has `_preRenderHook` but no `_postRenderHook`; CA-4/5/6 fixtures missing while `anchor-shapes.json` and the drift fixture exist. Wrote `docs/active/PRD.md` (final) and eight epic files covering the full remaining scope.

**Decisions made:**

- **Documented Deviation 1 (PRD §Documented Deviations):** `hexColors`/`sectorIds` remain Main-resident and are never routed through the Worker, deviating from the literal F-3.1 `BOOTSTRAP_ACK` text (which presumed Worker-side registry construction). Rationale: PR-3 — avoids up to ~384 KB of pointless round trips; intent (no structured-clone `hexMap`, Main-side binary search) preserved. Must be restated in `phase-3-audit.md` for explicit auditor ruling.
- **Documented Deviation 2:** `SectorLimitExceededError` relocates `src/types.ts` → `src/errors.ts` (aligns code with ROADMAP §12.5; public export unchanged).
- Epic structure maps 1:1 to milestones: 1=B3.a, 2=B3.b, 3=B3.c, 4=B2+CA-7+Phase 3 exit, 5=CA-4, 6=CA-5, 7=CA-8, 8=CA-6+finality. Shared ring-pool/`_postRenderHook` infra lands in Epic 6 Task 6.1 (first consumer), reused by Epics 7–8. Fixture authoring is embedded in its consuming epic rather than a single setup epic.
- Palette LUT is a `DataTexture`, not a uniform array (65,535-sector palettes exceed uniform limits) — PRD §GPU pipeline / Epic 4 Task 4.1.
- Task Registry populated as a preparation artifact on explicit user instruction; **sprint is NOT activated** — Current Status stays `NO ACTIVE SPRINT` per the BDFL-only Sprint Activation rule.

**Left off at:**
Sprint fully prepared. Awaiting explicit BDFL "start the sprint" instruction; first implementation step will be Epic 1, Task 1.1.

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

- Phase 2 pre-built more of Phase 3's substrate than the roadmap's phase labels suggest: `pixelIndicesMirror`, `hexColors`/`sectorIds`, and `borderEdges` allocation already exist on `SectorRegistry`. Epic 1 is mostly Worker/messaging/GPU work, not registry work.
- 2026-07-07 hardening: B1.e "ordered polygon rings" in the ROADMAP is aspirational — the shipped `SectorRegistry` emits an unordered flat CSR segment list with no ring grouping and no neighbor identity stored per segment. Anything consuming contours (polylabel, border extraction) must work segment-wise or rederive pairing from `pixelIndices`.
- 2026-07-07 hardening: `MapEngine.destroy()` permanently disables the instance (`_destroyed = true`) once loaded — "reload" scenarios in tests and docs must use a fresh instance until/unless a re-load lifecycle is explicitly built.
- 2026-07-07 hardening: `test/fixtures/anchor-shapes.json` contains continuous-coordinate polygon fixtures (non-integer vertices), not bitmaps — they exercise the polylabel algorithm directly and cannot be pushed through `SectorRegistry`.
