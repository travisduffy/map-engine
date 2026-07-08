# Epic 8: Dynamic Perimeter Rendering (CA-6) + Sprint Finality

**Objective:** Thick, clean group-perimeter borders driven by the Worker (`recomputeBorders` → `BorderRenderer` on a managed GPU VBO), plus the sprint's finality obligations: context-loss recovery acceptance (F-4.10), `GameClock` deletion, and the Phase 4 exit audit.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 8". Normative detail: ROADMAP §9 (CA-6, F-4.8, F-4.9, F-4.10), §4 (F-C.9), §9 Finality Audit.

**Verifiable & Measurable Success Criteria:**

- **Fixture exactness:** edge counts and endpoints match known-good results for every case in `test/fixtures/borders/perimeter-cases.json`.
- **Coalescing contract:** N concurrent `recomputeBorders` calls produce ≤ 2 computations (1 in-flight + 1 queued); all Promises resolve together; all reject together on error; `MapInvalidatedError` on `loadMap`/`dispose`.
- **Detachment safety:** 1,000-frame perimeter-mutation soak test completes with zero `ArrayBuffer is detached` DOMExceptions.
- **Recovery:** engine recovers within 100 ms of context restoration — measured from the `webglcontextrestored` event after a `WEBGL_lose_context`-simulated loss, per Task 8.4 (F-4.10).
- **Finality:** `src/GameClock.ts` deleted, zero live imports remain, Phase 4 audit summary committed.

---

## Tasks

### Task 8.1 — Fixture: `test/fixtures/borders/perimeter-cases.json`

**PRD Reference:** §"Acceptance Criteria — Epic 8"; ROADMAP §9 CA-6 Fixture (Phase 4 setup task).

**Work:**

- Author cases over small maps (reuse `test/fixtures/mappings/maps/` where possible): single group, two adjacent groups (shared edge appears once per group boundary), group with hole (hole interior mapped to `0xFFFF` or to another group — the interior boundary must be emitted), sentinel-only mapping (zero edges), single-pixel group (4 edges). Schema: `{mapImage, parentMapping, maxGroups, expectedEdgeCount, expectedEdges: [[x1,y1,x2,y2], ...]}` with expected values computed by an independent generator script (committed). Place groups whose full perimeter is asserted (e.g. the single-pixel 4-edge case) in the map interior, not touching the bitmap boundary — segments along the bitmap outer edge cannot be emitted by the extraction as specified (see the map-edge gap note in Task 8.2).

**Done when:** fixtures + deterministic generator committed.

---

### Task 8.2 — Worker perimeter extraction + coalescing

**PRD Reference:** §"Acceptance Criteria — Epic 8"; ROADMAP §9 CA-6 (Coalescing Rule, Worker Statefulness, F-4.9).

**Work:**

- Worker handler `recomputeBorders`: reads the latest `parentMapping` (stored by Epic 6); throws `MappingRequiredError` if none. **`contourPoints` (`Int16Array`) stores only `[x1,y1,x2,y2]` coordinates per sector's CSR bucket — it does NOT encode the neighboring sector's identity** (that `idA`/`idB` pairing is transient to `SectorRegistry`'s single-scan construction and is discarded before the buffer is built). To determine the sector on the far side of a contour segment, the Worker must resample `pixelIndices` (which it owns as steady-state consumer per ROADMAP §4) at the pixel pair adjacent to that segment, then compare each side's group via `parentMapping`. **Because a shared geometric edge between two non-void sectors is stored once in EACH sector's CSR bucket**, a naive walk over every sector's `contourPoints` double-visits every group-boundary edge; the Worker must emit each qualifying edge exactly once (e.g. only from the lower-numbered sector-id side) to stay within the pooled `borderEdges` buffer's fixed capacity (`4 * totalGeometricPerimeterSegments`, the deduped geometric-edge count) — writes past a TypedArray's length silently no-op, so an undeduplicated walk would silently drop edges rather than throw. **Map-edge gap (pending BDFL ruling):** the `SectorRegistry` crack scan checks right/bottom neighbors only, behind `x < width - 1` / `y < height - 1` guards (`src/SectorRegistry.ts:149,169`), so no contour segment exists along the bitmap's outer boundary and `totalGeoPerimeterSegs` — hence the pooled `borderEdges` capacity — excludes such segments. A walk over `contourPoints` therefore cannot emit perimeter along the map edge: a group touching the bitmap boundary renders with an open border there. Whether map-edge perimeter is in CA-6 scope (which would require synthesizing those segments, as Epic 7 Task 7.1 does for anchoring, **and** growing the pool capacity by up to `4 · 2 · (width + height)` floats) is a BDFL ruling — do not synthesize without it; ROADMAP §9 CA-6 is silent on the case. Emit qualifying segments (or void; a far side whose sector maps to the `0xFFFF` sentinel in `parentMapping` counts as void — the edge qualifies and is emitted from the grouped side, while sentinel-mapped sectors themselves emit nothing, which is what makes the all-sentinel case resolve with zero edges) into the pooled `borderEdges` buffer (`Float32Array`, matching THREE's float-typed `BufferAttribute` position data); writes count into `borderEdgeCount[0]`; yields every ≤ 8 ms; hands off both buffers in one `postMessage({type: 'borderEdges', edges, count}, [edges.buffer, count.buffer])`.
- Main-side coalescing in `SharedRegistryProxy`/`MapEngine` exactly per ROADMAP CA-6: serialize; coalesce queued calls into one; snapshot mapping at computation start; `setParentMapping` invalidates queued (not in-flight) computations so they re-snapshot; shared resolve/reject; `MapInvalidatedError` on lifecycle events. Does **not** require `aggregateGroups`.

**Done when:** fixture edge counts/endpoints match; error, sentinel (zero edges), coalescing (N calls → ≤ 2 computations, shared resolution), and lifecycle tests green.

---

### Task 8.3 — `BorderRenderer` + GPU VBO sync (F-C.9)

**PRD Reference:** §"Transferable Ownership & the ring pool"; ROADMAP §9 CA-6 Backend Integration.

**Work:**

- Implement `ThreeRenderBackend.uploadBorderEdges(buffer, count)` (the signature is already declared on `IThreeRenderBackend` with no-op stubs in both backends — replace the `ThreeRenderBackend` stub): copy `4·count` floats into a managed GPU VBO via `gl.bufferSubData`. **You must add `getBorderVBO(): WebGLBuffer | null` to the `ThreeRenderBackendInternalAccess` interface** so `BorderRenderer` can retrieve it without changing the public `IThreeRenderBackend`. **The VBO is allocated exactly once, at construction/first upload, sized to the buffer's fixed maximum capacity (`4 * totalGeometricPerimeterSegments` — group-boundary edges are always a subset of all geometric edges, so this capacity is never exceeded);** every subsequent upload — regardless of how `count` changes call to call — uses `gl.bufferSubData` only, never a `gl.bufferData` reallocation. Draw range is `geometry.setDrawRange(0, count * 2)` (2 vertices per segment; the position attribute is `itemSize: 2` — XY only, no Z — WebGL fills the missing Z with its default of 0). `NullRenderBackend.uploadBorderEdges` stays a **no-op** per F-2.8 (`uploadBorderEdges` is explicitly listed among the no-ops) — logic tests assert border data via the Main-side private copy behind `getBorderSegments()`, not via the null backend.
- Create `src/render/BorderRenderer.ts`: owns a `THREE.LineSegments` whose position attribute is bound to the managed VBO — never to the Transferable's CPU array. (In three.js this means a `THREE.GLBufferAttribute` wrapping the backend's `WebGLBuffer`; because it has no CPU-side array, three.js cannot compute a bounding sphere — set `frustumCulled = false` on the `LineSegments`, or assign explicit bounds, or rendering will throw.) Lazily constructed on first non-empty `recomputeBorders` resolution; disposed (with GPU resources) on `loadMap()`/`dispose()`. **Coordinate space:** `borderEdges` segments are raw pixel coordinates (origin top-left, Y-down), but the map mesh is `new THREE.PlaneGeometry(mapWidth, mapHeight)` centered at the origin (world units == pixel units, Y-up) — `BorderRenderer`'s `LineSegments` object must apply the matching pixel→world transform (translate by `(-width/2, +height/2)` and flip Y) so borders align with the sector-color mesh; this mirrors the Y-inversion already used in the picking pipeline (`pixelY = Math.floor((1 - uv.y) * height)`).
- Receipt flow (order is the contract): receive handoff → `uploadBorderEdges` → retain Main-side private copy for `getBorderSegments()` → set dirty flag → bounce buffers back in `_postRenderHook` (Epic 6 pool). **This flow runs on every resolution, including the zero-edge sentinel** — `uploadBorderEdges` and the private-copy retention do not depend on `BorderRenderer`'s (lazy, non-empty-only) construction, since the GPU VBO is backend-owned independent of the `LineSegments` scene object.
- `MapEngine.getBorderSegments(): Float32Array | null` — sync; `null` before first resolution. **After a zero-edge (sentinel) resolution this returns `Float32Array(0)`, not `null`** — it becomes non-null on any resolution, empty or not; only `BorderRenderer`'s scene-graph construction (and thus visible rendering) waits for a non-empty one.
- Update `example/src/main.ts`: toggleable group borders over the example map.

**Done when:** `*.gl.spec.ts` asserts drawn segments after `recomputeBorders` (readPixels along a known border); dirty-flag verification — after resolution, `_dirty === true` and exactly one `renderer.render` on the next rAF (use the mocked-`requestAnimationFrame` pattern from `test/RenderGating.test.ts`; the `advanceFrame` direct-hook harness bypasses the rAF loop and cannot observe render gating); `getBorderSegments` returns the private copy, unaffected by bounce-back.

---

### Task 8.4 — Soak, drift, and context-loss acceptance (F-4.8, F-4.10)

**PRD Reference:** §"Acceptance Criteria — Epic 8", PRD Known Risks 2–3 (Risk 3 names this soak test as the falsifier for the bounce-back deadlock; Risk 2 governs perf-window tolerance on software rendering).

**Work:**

- 1,000-frame soak: alternate `setParentMapping`/`recomputeBorders` mutations across 1,000 frames, driven **synchronously via fake timers** — `vi.advanceTimersByTime` + direct `renderer['_preRenderHook']?.()` **and** `renderer['_postRenderHook']?.()` calls per iteration (the established `advanceFrame`-style pattern in `test/testUtils.ts`/`test/FrameHook.test.ts`; do not drive real `requestAnimationFrame` — 1,000 real rAF frames is ~16.7s wall-clock and unnecessarily slow/flaky in CI). Note `advanceFrame` today only calls `_preRenderHook`; the soak harness must additionally invoke `_postRenderHook` each iteration or the bounce-back path this test exists to exercise never runs. Assert zero detachment DOMExceptions and stable memory (pool stays at 4 buffers — no growth).
- Drift assertion: `SimulationClock` drift ≤ ±2 ms during continuous perimeter extraction.
- F-4.10 recovery test (Playwright): trigger `WEBGL_lose_context.loseContext()` → `restoreContext()`; assert index texture re-upload (Epic 3 listener), border VBO re-upload, and a successful rendered frame within 100 ms of restoration. **The 100 ms window is measured from the `webglcontextrestored` event firing (which `restoreContext()` dispatches asynchronously, not synchronously) — not from the `restoreContext()` call itself** — since that event is what the Epic 3 listener reacts to. On software rendering (this dev environment is SwiftShader — see PROGRESS.md Lessons Learned), apply the standing 5.0× software-rendering tolerance (PRD §Process constraints, ROADMAP §12.2), detecting the renderer via `WEBGL_debug_renderer_info`/`UNMASKED_RENDERER_WEBGL` exactly as `test/PalettePerf.gl.spec.ts` already does; the strict 100 ms gate is authoritative only on reference hardware. Log the raw measured time regardless.

**Done when:** all three specs green; measured recovery time logged in PROGRESS.md.

---

### Task 8.5 — `GameClock` deletion + import migration

**PRD Reference:** §"Acceptance Criteria — Epic 8", PRD Known Risk 4; ROADMAP §9 Finality Audit.

**Work:**

- Delete `src/GameClock.ts` and `test/GameClock.test.ts`; remove the export from `src/index.ts`; migrate any remaining consumers (src, test, example) to `RenderClock`/`SimulationClock`. Beyond `controller.ts`, the only other `GameClock` hits are prose comments — `src/types.ts` (the `ClockTickCallback` doc comment), the `src/worker/SimulationClock.ts` header comment, and a `test/SimulationClock.test.ts` comment — which must be reworded, or the grep-empty done-when below fails on comments alone. Do **not** delete `test/fixtures/game-clock/drift-100tick.json`: `test/SimulationClock.test.ts` also loads it (its lowercase `game-clock` path does not match the case-sensitive grep, so keeping it is fine). **`example/src/controller.ts` is the one real consumer** (`new GameClock(this.engine, {ticksPerSecond: 1})` drives the tick-counter/clock-speed UI via `gameClock.onTick(...)`) — there is no public Main-side subscription API to the Worker's `SimulationClock` in this sprint (Epic 2's tick telemetry is exposed only via a test-only `CALL` method), so this demo cannot be pointed at `SimulationClock` directly. Migrate it by re-implementing `GameClock`'s small fixed-tick accumulator inline in `controller.ts` against `engine.onFrame(dt)` (already `RenderClock`-backed since Epic 2) — no new public API required. The controller's teardown currently calls `gameClock.destroy()`; the inline replacement must unregister its callback via `engine.offFrame` in that same teardown path — do not lean on engine teardown to unhook it, since `MapEngine.destroy()`/`dispose()` permanently disables the instance (PROGRESS.md Lessons Learned).

**Done when:** `git grep -l GameClock src/ test/ example/` returns empty; full suite + both typechecks + build pass; `npm run size` < 15 KB.

---

### Task 8.6 — Phase 4 exit: audit summary + halt

**PRD Reference:** §"Process constraints"; ROADMAP §3, §9 Phase Exit Gate; `.claude/rules/roadmap-governance.md`.

**Work:**

- Run the full parallel verification matrix (tests ∥ build + four `bin/check-*.sh` ∥ typechecks); all must pass.
- Write `docs/audits/phase-4-audit.md`: milestone table (CA-4/5/8/6, F-4.10, GameClock deletion — the Finality Audit item), PR-1..PR-5 compliance notes, measured perf numbers, `Status: [PENDING]`.
- Update PROGRESS.md (all epics `[x]`, final session log), `npm run format`, emit `PHASE_EXIT_AWAITING_AUDIT`, terminate the session. Release/versioning is BDFL-only and out of scope.

**Done when:** audit file committed with `Status: [PENDING]`; signal emitted; session ended.
