# Epic 3: SharedRegistryProxy (B3.c)

**Objective:** Give Main a synchronous-feeling facade over the Worker-resident registry: snapshot-served sync reads, promise-based async round-trips, async `pick()`, and strict lifecycle invalidation.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 3", §"Public API delta". Normative detail: ROADMAP §8 (B3.c), §12.4 (async `pick()`), F-2.6 (escape hatch).

**Verifiable & Measurable Success Criteria:**

- **Snapshot coherence:** `test/integration/proxy-snapshot.spec.ts` proves sync reads (`getBBox`/`getNeighbors`/`getCentroid`) on Main reflect Worker state immediately after any awaited async mutation.
- **Lifecycle invalidation:** `test/integration/lifecycle-invalidation.spec.ts` proves `loadMap → in-flight async → loadMap` rejects the first call with `MapInvalidatedError`.
- **Pick correctness:** `pick()` resolves `null` pre-bootstrap and on void/invalid IDs, and resolves a correct `PickResult` (hex key via binary search over `hexColors`/`sectorIds`) on valid sectors.
- **Zero API break boundary:** `getNeighbors`/`getCentroid`/`getBBox` remain synchronous with hex-string overloads; async `pick()` is the only signature break.

---

## Tasks

### Task 3.1 — Proxy skeleton + CALL/RESULT correlation

**PRD Reference:** §"Worker Message Protocol".

**Work:**

- Create `src/worker/SharedRegistryProxy.ts` (Main-thread module): wraps the Worker handle; `call(method, args, transfer?)` returns a Promise keyed by monotonic `id`; `RESULT.snapshot` (when present) refreshes local snapshot caches before the Promise resolves; `ERROR` rejects with the named error type rehydrated from `src/errors.ts`.
- Maintain a registry of in-flight Promises so lifecycle events (Task 3.3) can reject them all.
- Wire `MapEngine` to route Worker interactions through the proxy (constructed in `loadMap` after `BOOTSTRAP_ACK`).

**Done when:** unit tests cover: correlation under interleaved responses (out-of-order `id`s resolve the right Promises), `ERROR` → typed rejection, snapshot refresh ordering (snapshot applied before resolve).

---

### Task 3.2 — Sync snapshot reads

**PRD Reference:** §"Public API delta" ("Zero API Break Boundary").

`SectorRegistry`'s buffers left Main in Epic 1, but `getBBox`/`getNeighbors`/`getCentroid` must stay synchronous and hex-addressable. The proxy answers them from snapshots.

**Work:**

- At bootstrap, seed the proxy's snapshot caches from the registry values captured on Main pre-transfer (bboxes/centroids/adjacency stay small: `sectorCount·4·2 B + sectorCount·2·2 B + CSR` — retaining Main-side copies of these cold, non-transferred-back arrays is the snapshot store; only the nine transferred buffers left Main).
- Implement `getBBox(id)`, `getNeighbors(id)`, `getCentroid(id)` on the proxy with the same string/number overloads `SectorRegistry` exposes, translated via the Main-resident `idToHex`/`_hexToId` tables.
- `MapEngine.getNeighbors` (and friends) delegate to the proxy once it exists.

**Done when:** `test/integration/proxy-snapshot.spec.ts` passes: values identical to pre-transfer registry values; reads work synchronously (no `await`) after `loadMap` resolves.

---

### Task 3.3 — Lifecycle: `dispose()` + `MapInvalidatedError` rejection

**PRD Reference:** §"Acceptance Criteria — Epic 3"; ROADMAP §8 B3.c "Harden Lifecycle Rejection".

**Work:**

- `MapEngine.dispose(): Promise<void>`: rejects all in-flight async Promises with `MapInvalidatedError`, discards buffered `setMapMode` calls and palette registry (interlocks with Epic 4), terminates the Worker, releases GPU resources (backend `dispose()`), then resolves. Keep `destroy()` as the existing sync teardown delegating to `dispose()` fire-and-forget.
- `loadMap()`: before re-bootstrapping, rejects all in-flight async Promises with `MapInvalidatedError` and discards buffered map-mode state.

**Done when:** `test/integration/lifecycle-invalidation.spec.ts` passes (rapid `loadMap → in-flight async → loadMap` → first Promise rejects `MapInvalidatedError`); same assertion for `dispose()`; no unhandled-rejection warnings in the test run.

---

### Task 3.4 — Async `pick()` + `readSectorIdAt` escape hatch

**PRD Reference:** §"Public API delta" (breaking change), PRD Known Risk 3; ROADMAP §8 B3.c "pick(point)", F-2.6.

**Work:**

- Add `readSectorIdAt(x, y): number` to `ThreeRenderBackend` via the `ThreeRenderBackendInternalAccess` interface (F-2.6): reads the sector ID for a canvas pixel from the R32UI index texture path (framebuffer readback or `pixelIndicesMirror` lookup — mirror lookup is the PR-3-cheap choice since the mirror is authoritative and immutable). `NullRenderBackend` serves it from its retained `.slice()`.
- Change `MapEngine.pick(point)` to `Promise<PickResult | null>`: resolve `null` if no successful `loadMap`/`BOOTSTRAP_ACK`, or if the ID is `0xFFFF`/out of range; otherwise binary-search `hexColors`/`sectorIds` (Main-resident per PRD Documented Deviation 1) to build `PickResult`.
- Migrate the internal hover/click pipeline and **`example/src/main.ts`** plus all tests that call `pick()` to the async signature in this same task.

**Done when:** pick unit tests cover null-before-load, void pixel, valid sector (hex key correct via binary search); `npm run typecheck:example` and full suite pass; example app hover/click still works via `npm run example` smoke check.
