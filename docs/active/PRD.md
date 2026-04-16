# PRD: map-engine v0.0.2

> **Status:** DRAFT — In Development. This document is not finalized. Content is subject to change before the development cycle begins.
> **Audience:** Implementation engineers, AI coding agents
> **Source CAs:** CA-1 (The Tick), CA-2 (Adjacency Graph) — see `docs/ROADMAP.md` for full capability sketches

---

> **DRAFT NOTICE:** This PRD is a working draft. Sections marked `<!-- TODO -->` are
> incomplete and must be resolved before implementation begins. Do not treat this document
> as an implementation authority until the Status above reads "Active." If you are an AI
> agent reading this: stop and inform the user that the PRD is not yet finalized.

---

## PROJECT OVERVIEW

### What This Is

v0.0.2 extends the v0.0.1 engine with two orthogonal primitives:

1. **The Tick (CA-1):** A synchronization hook that fires at the top of every render frame, giving consumers a guaranteed pre-render callback boundary. Enables frame-coherent batching of `setSectorColor` calls and eliminates redundant dirty-rect flushes.

2. **The Adjacency Graph (CA-2):** A queryable, bidirectional, deduplicated neighbor map (`SectorRegistry.adjacency`) built during the existing O(W×H) constructor scan. Closes the gap between raw `borderEdges` data and a usable topology API for consumer game logic.

Neither feature adds visual complexity, breaks existing API surfaces, or introduces new dependencies. Both are clean additions to existing module boundaries.

### Goals

- Ship `onTick` / `offTick` on `MapEngine` with the frame-coherent batching path for `setSectorColor`.
- Ship `SectorRegistry.adjacency` and `MapEngine.getNeighbors` with the correct bidirectionality and deduplication semantics.
- Deprecate `SectorRegistry.borderEdges` (retain; add `@deprecated` JSDoc).
- Maintain the post-task checklist: zero type errors, clean build, full test suite passing.

### Non-Goals

- `SpatialGraph` pathfinding (CA-4) — requires CA-2 first; scoped to a future version.
- GPU palette / map modes (CA-7) — requires CA-1 first; scoped to a future version.
- Hierarchical aggregation (CA-5), perimeter rendering (CA-6), spatial anchoring (CA-8) — all icebox.
- Web Worker offloading of `SectorBitmapParser` / `SectorRegistry`.
- Any changes to the picking pipeline, pan/zoom, or canvas resize strategy.
- Render-on-demand (rAF loop remains always-running).
- Touch, keyboard, or gamepad input.

---

## ARCHITECTURE

### Module Ownership

| Feature               | Module(s) Modified                                                                |
| --------------------- | --------------------------------------------------------------------------------- |
| CA-1: The Tick        | `MapEngine` (hook surface), `MapRenderer` (hook execution point)                  |
| CA-2: Adjacency Graph | `SectorRegistry` (new `adjacency` field), `MapEngine` (new `getNeighbors` method) |

### Architectural Principles — No Violations

All changes must comply with the principles in `docs/ROADMAP.md §Architectural Principles`:

- **P-1 / P-2:** `SectorRegistry` continues to have zero Three.js imports and zero DOM dependencies.
- **P-5:** The adjacency map is built during the existing O(W×H) scan. No second pass.
- **P-6:** Two new public exports (`onTick`, `offTick`, `getNeighbors`, `adjacency`). One new type (`TickCallback`). No speculative additions.
- **P-7:** `three` remains external. No new peer dependencies.
- **P-8:** Composable additions — no invasive changes to existing module responsibilities.

---

## CORE FUNCTIONALITY

### 1. CA-1: The Tick (Synchronization Hook)

#### 1.1 New Type

```typescript
// In types.ts — new export
// dt is elapsed wall-clock seconds since the previous frame (e.g. 0.01667 at 60fps).
// On the first frame after registration, dt === 0.
type TickCallback = (dt: number) => void
```

#### 1.2 New `MapEngine` Methods

```typescript
onTick(callback: TickCallback): void
offTick(callback: TickCallback): void
```

**`onTick` behavior:**

- Appends `callback` to `_tickCallbacks: TickCallback[]` — a flat ordered array on `MapEngine`. Not routed through the existing `_handlers` Set system; tick callbacks must fire in registration order, and `Set<Function>` does not guarantee order.
- Respects the destroyed-guard: if `MapEngine` has been destroyed, `onTick` is a no-op (consistent with the existing `on` / `off` guard pattern).

**`offTick` behavior:**

- Splices `callback` from `_tickCallbacks` by reference equality (`===`). If the callback is not registered, no-op.
- Respects the destroyed-guard.

**Callback firing semantics:**

- All registered `TickCallback`s fire **synchronously**, in registration order, at the **top of every rAF frame** — before `renderer.render(this.scene, this.camera)`.
- `dt` is elapsed wall-clock seconds since the previous frame. Computed as `(timestamp - _lastFrameTime) / 1000`. On the very first frame, `dt === 0` (`_lastFrameTime` initializes to `0`).
- The tick fires every frame regardless of whether any callbacks are registered (the pre-render hook is always wired).

#### 1.3 `MapRenderer` Changes

**New field:** `_preRenderHook: (() => void) | null`

- Initialized to `null` in the constructor.
- Called at the top of every rAF frame before `this.renderer.render(...)`, if non-null.
- Wired by `MapEngine.loadMap()` immediately after `new MapRenderer(...)` — before the renderer's first frame fires.
- Set back to `null` in `MapRenderer.destroy()`.

**New field:** `_lastFrameTime: number`

- Initialized to `0`.
- Updated to the current rAF `DOMHighResTimeStamp` after the pre-render hook fires and before `renderer.render()`.

**New field:** `_pendingDirtyRect: SectorBBox | null`

- Initialized to `null`.
- Accumulates the union of all dirty bounding boxes written during a tick via `_patchSectorPixels`.
- Cleared to `null` by `_flushPendingDirty()` after each consolidated flush.

**New internal method:** `_patchSectorPixels(hexKey: string, r: number, g: number, b: number): void`

- Writes `r`, `g`, `b` values directly into `displayImageData.data` for every flat pixel index in `pixelIndices.get(hexKey)`.
- Unions the sector's bbox into `_pendingDirtyRect` (initialize to the sector's bbox if null; expand via `Math.min`/`Math.max` if already set).
- Does **not** call `putImageData`. Does **not** set `texture.needsUpdate`. Pixel data is staged; flush is deferred.
- If `hexKey` is not in `pixelIndices`, no-op.

**New internal method:** `_flushPendingDirty(): void`

- If `_pendingDirtyRect` is null, no-op (nothing staged).
- Otherwise: calls the dirty-rect overload of `putImageData` scoped to `_pendingDirtyRect`, sets `texture.needsUpdate = true`, then sets `_pendingDirtyRect = null`.

#### 1.4 Batching Coordination (`MapEngine`)

**New field:** `_inTick: boolean`

- Set to `true` immediately before firing tick callbacks.
- Set to `false` immediately after all callbacks return.
- Used by `MapEngine.setSectorColor` / `MapEngine.resetSectorColor` to select the dispatch path.

**`MapEngine.setSectorColor` dispatch logic (updated):**

```
if (_inTick):
    call _renderer._patchSectorPixels(hexKey, r, g, b)   // staged write, no flush
else:
    call _renderer.setSectorColor(hexKey, color)           // immediate flush (unchanged)
```

**`MapEngine.resetSectorColor` dispatch logic (updated):**

- Same pattern: if `_inTick`, stage via `_patchSectorPixels` using the source buffer's original RGB at that sector's pixels; otherwise call `_renderer.resetSectorColor` immediately.

**Pre-render hook closure (wired in `loadMap`):**

```typescript
renderer._preRenderHook = () => {
  const now = performance.now()
  const dt = _lastFrameTime === 0 ? 0 : (now - _lastFrameTime) / 1000
  _lastFrameTime = now // stored on MapRenderer

  _inTick = true
  for (const cb of [..._tickCallbacks]) cb(dt) // snapshot to allow self-removal
  _inTick = false

  renderer._flushPendingDirty()
  // renderer.render(...) follows immediately in the rAF loop
}
```

> **Note:** `_lastFrameTime` lives on `MapRenderer`; the closure captures `_renderer`. The pre-render hook is a closure defined in `MapEngine.loadMap()` — it has access to `MapEngine`'s private state via closure.

#### 1.5 Constraints

- Callbacks are never re-ordered. `offTick` splices in place; `onTick` appends.
- A callback may call `offTick(itself)` during execution — the splice must not corrupt the in-progress iteration. Iterate over a snapshot (`[...this._tickCallbacks]`) when firing.
- The tick is not a message queue. It fires on every frame, even with zero registered callbacks and zero pending dirty state.
- `setSectorColor` / `resetSectorColor` called **outside** a tick callback continue to flush immediately — no behavioral change for existing consumers who do not use `onTick`.

---

### 2. CA-2: Adjacency Graph

#### 2.1 New `SectorRegistry` Field

```typescript
// In SectorRegistry — new read-only public field
readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>
```

**Behavior contract:**

- Every hex key present in `_sectorMap` (definition-registered sectors) gets an entry — pre-initialized to an empty `Set` before the scan begins.
- Bitmap-only colors (no definition entry) are **excluded** on both sides. Exclusion is purely definition-membership based — the engine does not special-case `"000000"` or any other specific value.
- **Bidirectional:** if B is in `adjacency.get(A)`, then A is in `adjacency.get(B)`.
- **Deduplicated:** regardless of how many shared border pixels exist between A and B, B appears exactly once in `adjacency.get(A)`.
- A defined sector surrounded entirely by void/bitmap-only pixels will have an **empty `ReadonlySet`** — its entry exists (was pre-initialized), but is empty.

**Algorithm (built inside the existing O(W×H) scan, alongside `borderEdges`):**

Pre-scan step — before the pixel loop, initialize the mutable adjacency map:

```typescript
const adjacencyMutable = new Map<string, Set<string>>()
for (const hexKey of /* definition sector keys */) {
  adjacencyMutable.set(hexKey, new Set<string>())
}
```

Inside the scan, for each pixel at `(x, y)`:

1. Derive `thisKey` from the buffer (`toHexKey(r, g, b)`).
2. If `thisKey` is not in `_sectorMap`, skip adjacency logic for this pixel.
3. Check right neighbor `(x+1, y)` if in bounds:
   - Derive `rightKey`. If `rightKey !== thisKey` AND `adjacencyMutable.has(rightKey)`:
     - `adjacencyMutable.get(thisKey)!.add(rightKey)`
     - `adjacencyMutable.get(rightKey)!.add(thisKey)`
4. Check bottom neighbor `(x, y+1)` if in bounds:
   - Same logic as step 3 for `bottomKey`.

This runs alongside the existing `borderEdges` production logic in the same scan block. No additional scan pass.

Post-scan: `this.adjacency = adjacencyMutable` (cast to `ReadonlyMap`).

**P-5 compliance:** This is a single additional operation per pixel within the existing O(W×H) scan. No new scan pass is introduced.

#### 2.2 New `MapEngine` Method

```typescript
getNeighbors(hexKey: string): ReadonlySet<string> | undefined
```

- Returns `this._registry.adjacency.get(hexKey)`.
- Returns `undefined` if `hexKey` is not in the definition (not pre-initialized).
- Returns an empty `ReadonlySet` if the sector is defined but has no adjacent definition-registered neighbors.
- One-liner proxy — no caching, no additional logic.
- Respects the pre-load guard consistent with other `MapEngine` methods that require loaded state. <!-- TODO: confirm exact guard behavior — throw or return undefined? -->

#### 2.3 `borderEdges` Deprecation

`borderEdges: BorderEdge[]` on `SectorRegistry` is **retained** but marked deprecated:

```typescript
/**
 * @deprecated Use `adjacency` for neighbor queries. `borderEdges` retains richer
 * spatial data (exact pixel coordinates of each edge segment) that `adjacency` does
 * not expose. Retained until Dynamic Perimeter Rendering (CA-6) determines whether
 * a more structured perimeter representation supersedes it.
 * @experimental
 */
readonly borderEdges: BorderEdge[]
```

The `BorderEdge` type in `types.ts` receives the same `@deprecated` annotation, pointing to `adjacency`.

Do **not** remove `borderEdges` or alter its construction logic in this version.

---

## DATA FORMATS

No new data formats. `TickCallback` is the sole new type export. `adjacency` uses existing `string` hex keys from the established sector identity system. No changes to `SectorDefinitionFile`, `SectorData`, `SectorBBox`, or `BorderEdge` structures (beyond `@deprecated` annotations on `BorderEdge`).

---

## ACCEPTANCE CRITERIA

> Each criterion is falsifiable. Tests must exercise the criterion directly.

### Epic 1: The Tick

**1.1 — Callback registration and firing**

- `engine.onTick(cb)` registers `cb`; `cb` is called on every subsequent render frame.
- Multiple callbacks registered via `onTick` fire in registration order within a single frame.
- `engine.offTick(cb)` removes `cb`; it does not fire on subsequent frames.
- `offTick` with an unregistered callback is a no-op (no error).

**1.2 — `dt` values**

- On the first rAF frame after `loadMap` completes, `dt === 0`.
- On subsequent frames, `dt` is a positive number representing elapsed seconds since the previous frame.

**1.3 — Batched dirty-rect flushing during tick**

- Given two `setSectorColor` calls to different sectors inside a single tick callback: only one `putImageData` flush occurs per frame (not two), and the dirty rect encompasses both sectors' bounding boxes.
- Pixel state is correct after the flush: both sectors show the correct colors.
- `texture.needsUpdate` is set exactly once per frame when dirty state exists from a tick.

**1.4 — Immediate flush outside tick**

- `setSectorColor` called outside a tick callback (imperative path) flushes immediately — pixel state is correct before the next rAF frame.
- Existing consumer code that does not use `onTick` is unaffected.

**1.5 — Destroyed-guard**

- Calling `onTick` or `offTick` after `engine.destroy()` is a no-op (no error, no registration).

**1.6 — Self-removal during iteration**

- A callback that calls `offTick(itself)` during execution does not corrupt subsequent callback invocations in the same frame.

---

### Epic 2: Adjacency Graph

**2.1 — Bidirectionality**

- For any two sectors A and B sharing at least one pixel border: B is in `registry.adjacency.get(A)` AND A is in `registry.adjacency.get(B)`.

**2.2 — Deduplication**

- Regardless of how many border pixels A and B share, B appears exactly once in `adjacency.get(A)`.

**2.3 — Pre-initialization**

- Every hex key in the definition has an entry in `adjacency` (even if its value is an empty Set).
- A definition-registered sector that shares no border with any other definition-registered sector has `adjacency.get(hexKey)` returning an empty `ReadonlySet` (not `undefined`).

**2.4 — Bitmap-only exclusion**

- A bitmap-only color (present in the pixel buffer but absent from the definition) does not appear as a key in `adjacency` and does not appear as a value in any adjacency Set.

**2.5 — `getNeighbors` proxy**

- `engine.getNeighbors(hexKey)` returns the same value as `engine.registry.adjacency.get(hexKey)`.
- Returns `undefined` for a hex key not in the definition.
- Returns an empty `ReadonlySet` for a defined but isolated sector.

**2.6 — `borderEdges` retained**

- `registry.borderEdges` continues to produce the same values as in v0.0.1. No behavioral change.
- `BorderEdge` type and `borderEdges` field carry `@deprecated` JSDoc in the source.

**2.7 — No additional scan pass**

- `SectorRegistry` construction time does not meaningfully increase relative to v0.0.1 for equivalent bitmap inputs (the adjacency logic runs inside the existing O(W×H) loop).

**2.8 — P-1/P-2 compliance**

- `SectorRegistry` source file contains zero imports from Three.js or any DOM API. Verified by grepping for `import.*three` and for `document`, `window`, `HTMLCanvasElement`, `OffscreenCanvas` after any change to the file.

---

## WHAT THIS VERSION EXPLICITLY DOES NOT INCLUDE

- `SpatialGraph` class or any pathfinding primitives (CA-4) — blocked on CA-2 shipping first; deferred to a future version.
- GPU palette / sector ID texture rendering strategy (CA-7) — blocked on CA-1 shipping first; deferred.
- Hierarchical aggregation (CA-5), dynamic perimeter rendering (CA-6), spatial anchoring (CA-8).
- Weighted adjacency edges — cost functions are user-land.
- Multi-hop or connected-component queries — user-land until `SpatialGraph` ships.
- Adjacency between bitmap-only (definition-less) sectors.
- Removal or behavioral change to `borderEdges` — retained as-is; deprecated annotation only.
- Render-on-demand / dirty-flag rAF optimization — loop remains always-running.
- Fixed-timestep accumulator — `dt` is raw wall-clock delta; consumer's responsibility.
- Any new public API surface beyond: `onTick`, `offTick`, `TickCallback`, `adjacency`, `getNeighbors`.
- Changes to the picking pipeline, pan/zoom behavior, or canvas resize strategy.
- Web Worker integration for `SectorBitmapParser` / `SectorRegistry` — architecturally enabled by design but not wired in this version.
- New peer dependencies or changes to the Three.js external constraint.

---

## KNOWN RISKS

| ID      | Risk                                                                                                                            | Severity | Likelihood | Mitigation                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-1** | `setSectorColor` called both inside and outside a tick callback in the same frame causes double-flush                           | Medium   | High       | The `_inTick` flag gates the dispatch path. Only calls made inside the tick are batched; calls outside flush immediately as before. Consolidated flush runs after all tick callbacks return.                                    |
| **R-2** | `_tickCallbacks` iteration corrupted by self-removal via `offTick` inside a callback                                            | Medium   | Low        | Iterate over a snapshot (`[...this._tickCallbacks]`) when firing. Mutation of the live array does not affect the snapshot.                                                                                                      |
| **R-3** | Adjacency set-membership check per pixel (`adjacencyMutable.has(neighborKey)`) adds measurable scan time at large bitmap scales | Low      | Low        | O(1) Map lookup; cost is negligible relative to the existing `borderEdges` path which also reads neighbor pixels. No new memory allocation inside the hot loop.                                                                 |
| **R-4** | `_preRenderHook` fires before `MapRenderer` has valid display canvas state                                                      | Low      | Low        | Hook is wired in `MapEngine.loadMap()` after `new MapRenderer(...)` completes and the display canvas is initialized. The renderer's first rAF frame cannot fire before the event loop yields back to the caller of `loadMap()`. |
| **R-5** | `borderEdges` external consumers not aware of deprecation                                                                       | Low      | Low        | Already `@experimental`. `@deprecated` annotation added; removal deferred until CA-6 determines final fate. No behavioral change.                                                                                               |

---

<!-- OPEN ITEMS — resolve before marking this PRD Active:

1. Resolve the pre-load guard behavior for `getNeighbors` (see §2.2 note): align with
   the pattern used by other MapEngine methods called before loadMap() completes.
   Decision: throw or return undefined?

2. Confirm epic file structure and task breakdown for Epic 1 and Epic 2 with BDFL
   before populating docs/epics/.

3. Confirm test approach for dt timing assertions in Epic 1 — rAF timestamp injection
   or mock clock? The browser-mode test environment may require a specific strategy.

4. Review acceptance criterion 2.7 (no additional scan time) — decide whether a
   benchmark assertion is warranted or whether code review is sufficient.

-->
