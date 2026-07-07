# Epic 3: SharedRegistryProxy (B3.c)

**Objective:** Give Main a synchronous-feeling facade over the Worker-resident registry: snapshot-served sync reads, promise-based async round-trips, async `pick()`, and strict lifecycle invalidation.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 3", §"Public API delta". Normative detail: ROADMAP §8 (B3.c), §12.4 (async `pick()`), F-2.6 (escape hatch).

**Verifiable & Measurable Success Criteria:**

- **Snapshot coherence:** `test/integration/proxy-snapshot.spec.ts` proves sync reads (`getBBox`/`getNeighbors`/`getCentroid`) on Main reflect Worker state immediately after any awaited async mutation.
- **Lifecycle invalidation:** `test/integration/lifecycle-invalidation.spec.ts` proves `loadMap → in-flight async → loadMap` rejects the first call with `MapInvalidatedError`.
- **Pick correctness:** `pick()` resolves `null` pre-bootstrap and on void/invalid IDs, and resolves a correct `PickResult` (hex key via the O(1) Main-resident `idToHex` table — ROADMAP §8 B3.c, Hardening Sync) on valid sectors.
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

- `bboxes`, `centroids`, `adjacencyPointers`, and `adjacencyNeighbors` are themselves 4 of the nine bootstrap buffers transferred to the Worker (ROADMAP §4) — their Main-side references are detached (`byteLength === 0`) by the same `postMessage` call that transfers `pixelIndices`. "Stay small" does **not** mean these four avoid transfer; it means the proxy must **copy** (`.slice()`) their values on Main **before** the `BOOTSTRAP` `postMessage` call executes (while the source arrays are still live) and hold those copies as its snapshot store — retaining the post-transfer references themselves is not an option, since those are detached and unusable. Copy size: `sectorCount·4·2 B` (bboxes) `+ sectorCount·2·2 B` (centroids) `+` the CSR pair (`adjacencyPointers`: `(sectorCount+1)·4 B`, `adjacencyNeighbors`: `totalEdges·2 B`).
- Implement `getBBox(id)`, `getNeighbors(id)`, `getCentroid(id)` on the proxy with the same string/number overloads `SectorRegistry` exposes, translated via the Main-resident `idToHex`/`_hexToId` tables.
- `MapEngine` does not currently expose `getBBox`/`getCentroid` at all (`src/MapEngine.ts` has neither), and its existing `getNeighbors(hexKey: string)` has only the hex-string overload — add `getBBox`/`getCentroid` as **new** public `MapEngine` methods and add the numeric overload to `getNeighbors`, all delegating to the proxy.
- **Resolved (BDFL ruling, ROADMAP §12.4 Hardening Sync):** the public `MapEngine.registry` getter is `@deprecated` and throws `MapInvalidatedError` once the bootstrap transfer has detached the registry's buffers — Epic 1 Task 1.5 implements the gate and retains the pre-transfer `.slice()` snapshots; this task builds the proxy's sync reads on that same snapshot store (do not slice a second copy). Verify here that every former `.registry` consumer (tests included) is on the `MapEngine` surface.

**Done when:** `test/integration/proxy-snapshot.spec.ts` passes: values identical to pre-transfer registry values; reads work synchronously (no `await`) after `loadMap` resolves.

---

### Task 3.3 — Lifecycle: `dispose()` + `MapInvalidatedError` rejection

**PRD Reference:** §"Acceptance Criteria — Epic 3"; ROADMAP §8 B3.c "Harden Lifecycle Rejection".

**Work:**

- `MapEngine.dispose(): Promise<void>`: rejects all in-flight async Promises with `MapInvalidatedError`, discards the registered palette data (map-mode registry; interlocks with Epic 4 — no buffered-call state exists per F-3.6 Registration Atomicity), terminates the Worker, releases GPU resources (backend `dispose()`), then resolves. Keep `destroy()` as the existing sync teardown delegating to `dispose()` fire-and-forget.
- `loadMap()`: before re-bootstrapping, rejects all in-flight async Promises with `MapInvalidatedError` and discards the registered map modes (palette data).

**Done when:** `test/integration/lifecycle-invalidation.spec.ts` passes (rapid `loadMap → in-flight async → loadMap` → first Promise rejects `MapInvalidatedError`); same assertion for `dispose()`; no unhandled-rejection warnings in the test run.

---

### Task 3.4 — Async `pick()` + `readSectorIdAt` escape hatch

**PRD Reference:** §"Public API delta" (breaking change), PRD Known Risk 3; ROADMAP §8 B3.c "pick(point)", F-2.6.

**Work:**

- `ThreeRenderBackendInternalAccess` and stub `readSectorIdAt(x, y): number` methods **already exist** (`src/render/IThreeRenderBackend.ts`, `ThreeRenderBackend.ts`, `NullRenderBackend.ts`) — this task implements the real logic; it does not add the method fresh.
  - `ThreeRenderBackend.readSectorIdAt` currently `return 0xffff` unconditionally. Replace with the R32UI index texture path (framebuffer readback or `pixelIndicesMirror` lookup — mirror lookup is the PR-3-cheap choice since the mirror is authoritative and immutable). `x`/`y` are **bitmap/texture pixel coordinates** (`0..width-1` / `0..height-1`, the same space `pixelIndicesMirror` is indexed in) — not canvas CSS pixels or device pixels. The NDC → raycast → UV → Y-inverted-pixel conversion (the same steps `_handlePointerEvent` already performs — see below) happens in the caller before `readSectorIdAt` is invoked, not inside it.
  - `NullRenderBackend.readSectorIdAt` currently decodes its retained display-texture ImageData (populated by `uploadTexture()`) into a packed-RGB int (`(r<<16)|(g<<8)|b`) — the wrong value space: it returns a 24-bit color, not a numeric sector ID matching `pixelIndicesMirror`/`sectorIds` (`0..sectorCount-1`, sentinel `0xFFFF`). A packed-RGB result can spuriously equal `0xFFFF` (cyan, `#00ffff`) for a legitimately colored sector, and will never match the numeric-ID space `pick()`'s `idToHex` resolution expects. Rework it to source `readSectorIdAt` from a retained `pixelIndicesMirror`-equivalent numeric-ID buffer (still via `.slice()`, per F-2.8), not the recolored display ImageData.
- Add `MapEngine.pick(point): Promise<PickResult | null>` as a **new public method** — no `pick()` exists on `MapEngine` today. The current pipeline is the internal `_handlePointerEvent`, driven directly from pointer events, calling `registry.getSectorAt`/`getSector` synchronously; there is no existing sync `pick()` to "convert." Resolve `null` if no successful `loadMap`/`BOOTSTRAP_ACK`, or if the ID is `0xFFFF`/out of range; otherwise resolve the hex key via the O(1) Main-resident `idToHex` table to build `PickResult` (ROADMAP §8 B3.c, Hardening Sync — `hexColors`/`sectorIds` stay Main-resident for packed-RGB→ID lookups but are not on the pick path).
- Migrate the internal hover/click pipeline (`MapEngine._handlePointerEvent`) off `registry.getSectorAt` — that call indexes `SectorRegistry.pixelIndices`, one of the nine buffers Epic 1's bootstrap transfer detaches (`byteLength === 0`) on Main, so it will break once B3.a lands. Keep the existing raycast/NDC/UV/Y-inversion steps (they establish bitmap-pixel coordinates and mesh-miss detection) but resolve the hex key via `readSectorIdAt` + hex-resolution instead. Also migrate **`example/src/main.ts`** (currently has no `pick`/`PickResult` usage — it only consumes the `sectorHover`/`sectorClick` events) plus all tests that call `pick()` to the new async signature in this same task.

**Done when:** pick unit tests cover null-before-load, void pixel, valid sector (hex key correct via `idToHex`); `npm run typecheck:example` and full suite pass; example app hover/click still works via `npm run example` smoke check.
