# Project Progress: Phase 4 — GSG Logic

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

**Phase:** Phase 3 (The Concurrent Kernel) — COMPLETE, audited `[PASS]`, archived as v0.0.5 (`docs/archive/v0.0.5/`) | Phase 4 (GSG Logic) — READY, not yet activated.
**Active version:** targets v0.0.6 (named by BDFL 2026-07-07)
**Next task:** Epic 5, Task 5.1 (`docs/active/epics/epic-5-pathfinding.md`) — blocked until v0.0.5 is merged to `main` (BDFL handling that merge out-of-band of this document).
**Blocking issues:** Hard phase gate (ROADMAP §3, `.claude/rules/roadmap-governance.md`): Epic 5 Task 5.1 must not begin until `docs/audits/phase-3-audit.md`'s `[PASS]` verdict is merged to `main`. Not yet merged as of this entry.

---

## Task Registry

### Epic 5: Pathfinding Primitives (CA-4) — gated on v0.0.5 merge to `main`

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

### 2026-07-07 — v0.0.5 archived; Phase 4 (GSG Logic) sprint docs split out

**Tasks touched:** none (documentation split only)
**Outcome:** completed

**What happened:**
BDFL instructed wrapping Phase 3 (Epics 1–4, exit-audited to `[PASS]`) into the v0.0.5 release and archiving it, leaving only Phase 4 (Epics 5–8) plus post-sprint cleanup in the active sprint scope, and named the upcoming release v0.0.6. Split the combined "Concurrent Kernel & GSG Logic" PRD and PROGRESS into: `docs/archive/v0.0.5/` (`PRD.md`, `PROGRESS.md`, `epics/epic-1..4-*.md`) — a frozen, self-contained historical record of Phase 3 exactly as it shipped — and this file plus `docs/active/PRD.md`, retaining only Phase 4 scope. `docs/active/epics/epic-1..4-*.md` moved to the archive via `git mv`; `epic-5..8-*.md` remain in place unchanged.

**Decisions made:**

- Each archive event locks in a version — a version bump is not optional when a phase is split out and archived. Initially mirrored a mis-remembered precedent (`docs/archive/v0.0.3-phase-2`, treating it as a same-version secondary archive); BDFL caught this: that folder should always have been `docs/archive/v0.0.4` (its work was in fact released as "V0.0.4" per git history), not a `-phase-2` suffix on `v0.0.3`. Corrected in this session: `git mv docs/archive/v0.0.3-phase-2 → docs/archive/v0.0.4`, updated its internal `Active Version`/`Active version` fields and two stale `docs/active/epics/...` path references (should have pointed at the archive location even at the time it was originally archived). This archive-locks-a-version rule is now the standing convention: v0.0.5 = Phase 3 (this split), v0.0.6 = Phase 4 (this sprint), each future phase/version split gets its own clean version number, never a `-phase-N` suffix on a shared number.
- Active `PROGRESS.md`'s Session Log and Lessons Learned reset to a clean slate for Phase 4; the small set of Phase 3 lessons with explicit forward relevance to Epics 5–8 were carried forward rather than dropped (see Lessons Learned below). The full historical set of 12 lessons remains preserved verbatim in `docs/archive/v0.0.5/PROGRESS.md`.
- `docs/audits/phase-3-audit.md` and `docs/ROADMAP.md` were **not** touched — audits are permanent and never archived/moved (`phase-0/1/2-audit.md` all still live in `docs/audits/`), and a ROADMAP revision pass is separate, user-gated work this session was not asked to run.
- `package.json` version left untouched at `0.0.5` — it already reflects the release being finalized; bumping it to `0.0.6` is a separate BDFL-only action at whatever point they judge appropriate.

**Left off at:**
Docs fully split and consistent, including the `v0.0.3-phase-2 → v0.0.4` correction. Awaiting BDFL to commit and merge v0.0.5 (Phase 3) to `main`. Once merged, Epic 5 Task 5.1 is unblocked.

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones. The following were carried forward from Phase 3 (`docs/archive/v0.0.5/PROGRESS.md`, which holds the full set of 12) for their explicit relevance to Epics 5–8; new Phase 4 lessons go below them.

- Any Main-resident code that reads a bootstrap-transferred buffer (`pixelIndices`, `bboxes`, `centroids`, `adjacencyPointers`, `adjacencyNeighbors`, `contourPointers`, `contourPoints`, `borderEdges`, `borderEdgeCount`) directly off the live `SectorRegistry` instance will silently read zero-length/garbage data post-transfer. When implementing Epics 5–8, audit any new code path that reads these nine fields directly (vs. via a pre-transfer `.slice()` snapshot or the Worker-side state) before assuming it works post-`loadMap()`.
- B1.e "ordered polygon rings" in the ROADMAP is aspirational — the shipped `SectorRegistry` emits an unordered flat CSR segment list with no ring grouping and no neighbor identity stored per segment. Epic 7 (anchoring) and Epic 8 (border extraction) must both work segment-wise or rederive pairing from `pixelIndices`.
- `test/fixtures/anchor-shapes.json` contains continuous-coordinate polygon fixtures (non-integer vertices), not bitmaps — they exercise the polylabel algorithm directly (Epic 7) and cannot be pushed through `SectorRegistry`.
- This dev environment has no dedicated GPU — all `*.gl.spec.ts`/perf-gate tests run against SwiftShader (software rendering) via ANGLE/Vulkan; `gl.getParameter(gl.RENDERER)` is masked by default and needs `gl.getExtension('WEBGL_debug_renderer_info')` + `UNMASKED_RENDERER_WEBGL` to detect this for perf-gate tolerance decisions. Relevant again for Epic 8's GPU/VBO soak test and any Phase 4 perf gate.
- An Engineer's self-report claiming a capability is "integration-tested" or "verified via a real browser session" is not evidence — independently `grep` for the actual assertion or artifact before accepting a PASS claim at the Phase 4 exit audit, regardless of how specific the narrative sounds.
- Standalone Playwright scripts under `bench/` (real Node `http`/`child_process`, not Vitest browser mode) that build once and bind real ports are not safe under Playwright's default multi-worker scheduling. `bench/playwright.config.ts` pins `workers: 1`; any new Phase 4 bench/verification script added to that directory inherits and should stay compatible with that constraint.
- `MapEngine.destroy()`/`dispose()` permanently disable the instance; only `loadMap()`-triggered reload tears down and re-bootstraps. Relevant to Epic 8's `GameClock` deletion task — verify consumer migration against this lifecycle, not an assumed reload-via-destroy pattern.
