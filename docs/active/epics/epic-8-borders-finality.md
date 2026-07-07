# Epic 8: Dynamic Perimeter Rendering (CA-6) + Sprint Finality

**Objective:** Thick, clean group-perimeter borders driven by the Worker (`recomputeBorders` → `BorderRenderer` on a managed GPU VBO), plus the sprint's finality obligations: context-loss recovery acceptance (F-4.10), `GameClock` deletion, and the Phase 4 exit audit.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 8". Normative detail: ROADMAP §9 (CA-6, F-4.8, F-4.9, F-4.10), §4 (F-C.9), §9 Finality Audit.

**Verifiable & Measurable Success Criteria:**

- **Fixture exactness:** edge counts and endpoints match known-good results for every case in `test/fixtures/borders/perimeter-cases.json`.
- **Coalescing contract:** N concurrent `recomputeBorders` calls produce ≤ 2 computations (1 in-flight + 1 queued); all Promises resolve together; all reject together on error; `MapInvalidatedError` on `loadMap`/`dispose`.
- **Detachment safety:** 1,000-frame perimeter-mutation soak test completes with zero `ArrayBuffer is detached` DOMExceptions.
- **Recovery:** engine recovers within 100 ms of a `WEBGL_lose_context`-simulated context loss (F-4.10).
- **Finality:** `src/GameClock.ts` deleted, zero live imports remain, Phase 4 audit summary committed.

---

## Tasks

### Task 8.1 — Fixture: `test/fixtures/borders/perimeter-cases.json`

**PRD Reference:** §"Acceptance Criteria — Epic 8"; ROADMAP §9 CA-6 Fixture (Phase 4 setup task).

**Work:**

- Author cases over small maps (reuse `test/fixtures/mappings/maps/` where possible): single group, two adjacent groups (shared edge appears once per group boundary), group with hole, sentinel-only mapping (zero edges), single-pixel group (4 edges). Schema: `{mapImage, parentMapping, maxGroups, expectedEdgeCount, expectedEdges: [[x1,y1,x2,y2], ...]}` with expected values computed by an independent generator script (committed).

**Done when:** fixtures + deterministic generator committed.

---

### Task 8.2 — Worker perimeter extraction + coalescing

**PRD Reference:** §"Acceptance Criteria — Epic 8"; ROADMAP §9 CA-6 (Coalescing Rule, Worker Statefulness, F-4.9).

**Work:**

- Worker handler `recomputeBorders`: reads the latest `parentMapping` (stored by Epic 6); throws `MappingRequiredError` if none. Walks `contourPointers`/`contourPoints`, emitting segments where the two sides of a contour segment belong to different groups (or map edge/void), into the pooled `borderEdges` buffer; writes count into `borderEdgeCount[0]`; yields every ≤ 8 ms; hands off both buffers in one `postMessage({type: 'borderEdges', edges, count}, [edges.buffer, count.buffer])`.
- Main-side coalescing in `SharedRegistryProxy`/`MapEngine` exactly per ROADMAP CA-6: serialize; coalesce queued calls into one; snapshot mapping at computation start; `setParentMapping` invalidates queued (not in-flight) computations so they re-snapshot; shared resolve/reject; `MapInvalidatedError` on lifecycle events. Does **not** require `aggregateGroups`.

**Done when:** fixture edge counts/endpoints match; error, sentinel (zero edges), coalescing (N calls → ≤ 2 computations, shared resolution), and lifecycle tests green.

---

### Task 8.3 — `BorderRenderer` + GPU VBO sync (F-C.9)

**PRD Reference:** §"Transferable Ownership & the ring pool"; ROADMAP §9 CA-6 Backend Integration.

**Work:**

- Implement `ThreeRenderBackend.uploadBorderEdges(buffer, count)`: copy `4·count` floats into a managed GPU VBO via `gl.bufferSubData` (allocate/grow via `gl.bufferData` on first upload). `NullRenderBackend` retains a `.slice()` (F-2.8).
- Create `src/render/BorderRenderer.ts`: owns a `THREE.LineSegments` whose position attribute is bound to the managed VBO — never to the Transferable's CPU array. Lazily constructed on first non-empty `recomputeBorders` resolution; disposed (with GPU resources) on `loadMap()`/`dispose()`.
- Receipt flow (order is the contract): receive handoff → `uploadBorderEdges` → retain Main-side private copy for `getBorderSegments()` → set dirty flag → bounce buffers back in `_postRenderHook` (Epic 6 pool).
- `MapEngine.getBorderSegments(): Float32Array | null` — sync; `null` before first resolution.
- Update `example/src/main.ts`: toggleable group borders over the example map.

**Done when:** `*.gl.spec.ts` asserts drawn segments after `recomputeBorders` (readPixels along a known border); dirty-flag verification — after resolution, `_dirty === true` and exactly one `renderer.render` on the next rAF; `getBorderSegments` returns the private copy, unaffected by bounce-back.

---

### Task 8.4 — Soak, drift, and context-loss acceptance (F-4.8, F-4.10)

**PRD Reference:** §"Acceptance Criteria — Epic 8", PRD Known Risk 4.

**Work:**

- 1,000-frame soak: alternate `setParentMapping`/`recomputeBorders` mutations across 1,000 rAF frames; assert zero detachment DOMExceptions and stable memory (pool stays at 4 buffers — no growth).
- Drift assertion: `SimulationClock` drift ≤ ±2 ms during continuous perimeter extraction.
- F-4.10 recovery test (Playwright): trigger `WEBGL_lose_context.loseContext()` → `restoreContext()`; assert index texture re-upload (Epic 1 listener), border VBO re-upload, and a successful rendered frame within 100 ms of restoration.

**Done when:** all three specs green; measured recovery time logged in PROGRESS.md.

---

### Task 8.5 — `GameClock` deletion + import migration

**PRD Reference:** §"Acceptance Criteria — Epic 8"; ROADMAP §9 Finality Audit.

**Work:**

- Delete `src/GameClock.ts` and `test/GameClock.test.ts`; remove the export from `src/index.ts`; migrate any remaining consumers (src, test, example) to `RenderClock`/`SimulationClock`.

**Done when:** `git grep -l GameClock src/ test/ example/` returns empty; full suite + both typechecks + build pass; `npm run size` < 15 KB.

---

### Task 8.6 — Phase 4 exit: audit summary + halt

**PRD Reference:** §"Process constraints"; ROADMAP §3, §9 Phase Exit Gate; `.claude/rules/roadmap-governance.md`.

**Work:**

- Run the full parallel verification matrix (tests ∥ build + four `bin/check-*.sh` ∥ typechecks); all must pass.
- Write `docs/audits/phase-4-audit.md`: milestone table (CA-4/5/8/6, F-4.10, GameClock deletion — the Finality Audit item), PR-1..PR-5 compliance notes, measured perf numbers, `Status: [PENDING]`.
- Update PROGRESS.md (all epics `[x]`, final session log), `npm run format`, emit `PHASE_EXIT_AWAITING_AUDIT`, terminate the session. Release/versioning is BDFL-only and out of scope.

**Done when:** audit file committed with `Status: [PENDING]`; signal emitted; session ended.
