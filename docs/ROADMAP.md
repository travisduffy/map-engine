# map-engine: Product & Architecture Roadmap

> **Document type:** PARD — Product & Architecture Roadmap Document
> **Maintained by:** BDFL
> **Status:** Living document. Version-agnostic. Not tied to any single release.
>
> This document captures the engine's full capability trajectory, organized by dependency order
> and strategic horizon — not by release. When a development cycle begins, the BDFL selects
> one or more capability areas from the **Immediate** tier and uses them as input to write a
> sprint PRD (`docs/PRD.md`). The sprint PRD is the _implementation spec_ — it translates a
> CA's sketched API contract and architectural implications into falsifiable acceptance criteria,
> exact type signatures, and task-level work specs. CAs in this document are product-requirements
> sketches, not implementation specs; do not write code directly from them.
>
> This document is updated when capability definitions change, not when tasks are completed
> (that goes in `docs/PROGRESS.md`).

---

## Vision Statement

`map-engine` is a **minimal, browser-native Grand Strategy Game (GSG) spatial runtime**
built on WebGL (Three.js) and typed ESM. It provides the Pareto-optimal set of spatial
and temporal primitives that every GSG requires — sector identity, spatial topology,
visual synchronization, and eventually traversal — without ever owning game state,
simulation logic, or UI.

The engine handles **Space** (the map) and the synchronization of **Time** (the game
loop). Everything else is user-land.

Growth is intentional and unhurried. Each capability must be nailed down cleanly,
efficiently, and scalably before the next is begun. Premature complexity is treated as
a defect.

---

## Architectural Principles

These are non-negotiable constraints. Every capability must be compatible with all of
them. If a proposed design violates one, the design changes — not the principle.

| #       | Principle                                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-1** | `SectorRegistry` has zero Three.js imports.                                                                              | It must be Worker-safe.                                                                                                                                                                                                                                                                                                    |
| **P-2** | `SectorBitmapParser` and `SectorRegistry` have zero DOM dependencies.                                                    | Worker-safe contract.                                                                                                                                                                                                                                                                                                      |
| **P-3** | `MapRenderer` and `MapEngine` are main-thread only.                                                                      | They touch WebGL and the DOM.                                                                                                                                                                                                                                                                                              |
| **P-4** | The engine never owns game state.                                                                                        | It synchronizes visuals; it does not simulate.                                                                                                                                                                                                                                                                             |
| **P-5** | New spatial data structures built inside `SectorRegistry` are computed during the existing O(W×H) constructor scan pass. | A second full-bitmap scan is never acceptable. This principle applies specifically to `SectorRegistry`'s constructor — standalone modules like `SpatialGraph` or `HierarchyRegistry` build their own structures from already-derived data in their own constructors, which is correct and does not violate this principle. |
| **P-6** | The public API surface grows conservatively.                                                                             | Every export is a maintenance contract.                                                                                                                                                                                                                                                                                    |
| **P-7** | `three` is always an external peer dependency.                                                                           | Size budget: <15 KB gzipped.                                                                                                                                                                                                                                                                                               |
| **P-8** | New modules are composable, not invasive.                                                                                | Prefer a new class that takes an existing one as input over modifying existing classes.                                                                                                                                                                                                                                    |

---

## Capability Map

Dependency order, read top-to-bottom. An arrow means "requires."

```
CA-3: Input Pipeline Hardening        ✓ shipped v0.0.2 (no deps — structural refactor)

CA-1: The Frame Hook                  ✓ shipped v0.0.2 (no deps — foundational)
  ├── CA-7: GPU Map Modes             (Frame Hook must ship first for frame-coherent palette swaps)
  └── CA-9: Game Clock                ✓ shipped v0.0.2 (Frame Hook is the time source; onFrame drives the accumulator)

CA-2: Adjacency Graph                 ✓ shipped v0.0.2 (no deps — pure SectorRegistry addition)
  └── CA-4: Pathfinding Primitives    (Adjacency must ship first)
        └── CA-5: Hierarchical Aggregation   (Pathfinding context informs group-graph design)
              └── CA-6: Dynamic Perimeter Rendering  (requires Aggregation)
                    └── CA-8: Spatial Anchoring      (requires stable perimeter geometry)
```

---

## Capability Areas

---

### CA-1 (Completed): The Frame Hook (Pre-Render Callback)

**Horizon:** Immediate — **Shipped 2026-04-20**
**Module ownership:** `MapEngine` (hook surface) + `MapRenderer` (hook execution point)

#### What Shipped

`onFrame(callback: FrameCallback): void` and `offFrame(callback: FrameCallback): void` added to `MapEngine`. `_preRenderHook: (() => void) | null` wired into `MapRenderer`'s rAF loop as the first call each frame. `_inTick: boolean` on `MapEngine` gates frame-callback dispatch; `_pendingDirtyRect: SectorBBox | null` on `MapRenderer` accumulates dirty rects during the tick and flushes them in a single `putImageData` + `texture.needsUpdate = true` call after all callbacks return. `setSectorColor`/`resetSectorColor` called outside a frame callback continue to flush immediately. `_lastFrameTime` tracks the previous rAF timestamp for `dt` computation; `dt === 0` on the first frame. `parseColorToRgb` extracted to `src/internal/color.ts` as a shared module-scope OffscreenCanvas singleton. `_frameCallbacks: FrameCallback[]` is a flat ordered array (not a Set) to preserve registration order. 11 tests added; total 159 at ship.

#### Job Story

> When my game loop has state changes to apply (province captured, army moved, economy
> tick processed), I want to push those visual diffs to the engine immediately before the
> next frame is rendered, so the map display is always coherent with game state and I
> never have to think about render timing.

#### Problem Statement

`MapRenderer`'s `requestAnimationFrame` loop is opaque to `MapEngine` and to all
consumers. There is no pre-render hook. A consumer calling `setSectorColor()` at
arbitrary points in their game loop gets correct results eventually, but:

1. Multiple `setSectorColor` calls within a single rAF frame each trigger their own
   dirty-rect `putImageData` flush and set `texture.needsUpdate = true` independently —
   no batching.
2. There is no guaranteed "all diffs for this frame" boundary — a consumer processing
   a game tick may be spread across multiple rAF frames by timing accident.
3. The engine has no temporal heartbeat the consumer can anchor to.

#### Proposed API Contract

```typescript
// Callback type — dt is elapsed seconds since the previous frame (float, e.g. 0.01667)
type FrameCallback = (dt: number) => void

// On MapEngine:
onFrame(callback: FrameCallback): void
offFrame(callback: FrameCallback): void
```

**Behavior contract:**

- All registered `FrameCallback`s fire synchronously at the **top of every rAF frame**,
  before `renderer.render(this.scene, this.camera)`.
- `dt` is elapsed wall-clock seconds since the previous frame. On the first frame,
  `dt === 0`.
- Callbacks fire in registration order.
- `setSectorColor` / `resetSectorColor` calls made from within a frame callback are
  **batched**: pixel writes to `displayImageData.data` happen immediately as called, but
  the `putImageData` flush and `texture.needsUpdate = true` are deferred until all frame
  callbacks have returned. A single consolidated dirty-rect flush is then performed
  before `renderer.render()`. This is the frame-coherent synchronization path.
- `setSectorColor` / `resetSectorColor` called _outside_ a frame callback (imperative
  path) continue to flush immediately — semantics unchanged for existing usage.
- The `onFrame` / `offFrame` methods respect the destroyed-guard pattern already used
  by `on` / `off`.

#### Architectural Implications

1. **`MapRenderer` pre-render hook:** The rAF loop in `MapRenderer`'s constructor must
   expose a single pre-render execution point. The mechanism: a
   `_preRenderHook: (() => void) | null` field on `MapRenderer`, called at the top of
   every rAF frame before `this.renderer.render(...)`. `MapEngine` wires this field
   in `loadMap()`, **immediately after** `const renderer = new MapRenderer(config.canvas, registry)` —
   before the renderer's first frame fires. This avoids exposing `MapRenderer`'s
   render internals and keeps `MapEngine` as the sole coordinator.

2. **Dirty-rect batching during frame:** The `_inTick` flag lives on `MapEngine` (set
   `true` before firing frame callbacks, `false` after). The deferred-flush state lives
   on `MapRenderer` as `_pendingDirtyRect: SectorBBox | null` (null = nothing pending).

   The coordination works as follows: `MapEngine.setSectorColor` is the interception
   point. When `_inTick === true`, instead of calling `MapRenderer.setSectorColor`
   (which flushes immediately), `MapEngine` calls a new internal
   `MapRenderer._patchSectorPixels(hexKey, r, g, b)` method that writes the pixel data
   to `displayImageData.data` and unions the sector's bbox into `_pendingDirtyRect`
   (initialize if null; expand if already set), but does NOT call `putImageData` or
   set `texture.needsUpdate`. After all frame callbacks return, the `_preRenderHook`
   closure calls `MapRenderer._flushPendingDirty()`, which performs a single
   `putImageData` over the accumulated dirty rect and sets `texture.needsUpdate = true`.
   Outside the frame callback, `MapEngine.setSectorColor` calls `MapRenderer.setSectorColor`
   as before — immediate flush, no change.

3. **`_lastFrameTime` field:** `MapRenderer` needs to track the previous rAF timestamp
   (a `DOMHighResTimeStamp`) to compute `dt`. One additional `number` field, initialized
   to `0` and updated each frame after the hook fires.

4. **`MapEngine._frameCallbacks: FrameCallback[]`:** A flat ordered array, not a `Set`.
   Frame callbacks **must** fire in registration order — this is a correctness
   requirement, not a style preference. The existing event system (`_handlers`) uses
   `Set<Function>`, which is unordered; routing the frame hook through `on('frame', cb)` would
   silently lose ordering guarantees. `offFrame` splices by reference equality.

#### Prerequisites

None. This is a foundational primitive.

#### Explicit Out-of-Scope

- The engine does not manage a game clock, accumulator, or fixed timestep. `dt` is
  raw wall-clock delta — the consumer is responsible for fixed-step accumulation if
  their simulation requires it.
- Render-on-demand (stopping the rAF loop when nothing has changed) is a future
  optimization — deliberately deferred. The rAF loop remains always-running.
- The frame hook is not a message queue. It fires even when the consumer has nothing to push.

---

### CA-2 (Completed): Adjacency Graph — Phase 1 of the Spatial Runtime

**Horizon:** Immediate — **Shipped 2026-04-20**
**Module ownership:** `SectorRegistry` (data) → future `SpatialGraph` class (traversal)

#### What Shipped

`readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>` added to `SectorRegistry`. Built during the existing O(W×H) constructor scan alongside `borderEdges` — zero additional passes. Each definition-registered key is pre-initialized to an empty `Set` before the scan; bidirectional entries are added for any two adjacent pixels where both keys are in `_sectorMap`. `getNeighbors(hexKey: string): ReadonlySet<string> | undefined` added to `MapEngine` as a one-liner convenience proxy. `@deprecated` JSDoc added to `borderEdges` on `SectorRegistry` and `BorderEdge` type in `types.ts`. 14 tests added; total 188 at ship.

#### Job Story

> When I need to determine which provinces are reachable, adjacent to a selected sector,
> or connected through a path, I want to ask the engine for the topology directly, so I
> don't have to reverse-engineer adjacency from the raw pixel buffer or `borderEdges`
> array myself.

#### Problem Statement

`SectorRegistry.borderEdges` is a flat array of pixel-boundary edge 4-tuples. It
encodes raw spatial proximity correctly but is not queryable. Deriving "what sectors
are adjacent to X?" from it requires O(E) linear scan for each lookup. There is no
deduplication (multiple `BorderEdge` entries exist for each shared border segment).
There is no bidirectionality. This is the right raw material but the wrong abstraction
for consumers.

#### Proposed API Contract — Phase 1

```typescript
// On SectorRegistry (new read-only field):
readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>

// On MapEngine (convenience sugar — identical to engine.registry.adjacency.get(hexKey)):
getNeighbors(hexKey: string): ReadonlySet<string> | undefined
```

> **Note on access paths:** `registry` is already a public getter on `MapEngine`, so
> `engine.registry.adjacency` is the primary way to access the full adjacency map.
> `getNeighbors` is added as a one-liner convenience proxy — it does not make
> `adjacency` the less accessible path. Both must be available.

**Behavior contract:**

- `adjacency` is a `Map<string, Set<string>>` (exposed as `ReadonlyMap`) built during
  the existing O(W×H) constructor scan. Zero additional passes.
- Every hex key present in `_sectorMap` (definition-registered sectors) gets an entry.
  Bitmap-only keys do **not** get entries.
- Adjacency is **bidirectional**: if A is in `adjacency.get(B)`, then B is in
  `adjacency.get(A)`.
- Adjacency is **deduplicated**: regardless of how many shared border pixels A and B
  have, B appears exactly once in `adjacency.get(A)`.
- Sectors not registered in the definition (bitmap-only colors) are excluded from
  adjacency on both sides. The engine does **not** special-case any specific hex value —
  exclusion is purely definition-membership based. The void/background color (`000000`)
  is excluded only because by convention it is never registered in `sectors.json`; if a
  consumer registers it, it would participate in adjacency normally.
- `getNeighbors` on `MapEngine` returns `undefined` for a hex key not in the definition.
  A defined sector that is surrounded entirely by void/bitmap-only pixels will have an
  **empty `ReadonlySet`** (not `undefined`) — it was pre-initialized before the scan.
  The distinction matters: `undefined` = key not in definition; empty set = defined but
  spatially isolated from all other defined sectors.

**Algorithm (built inside the O(W×H) scan, alongside existing structures):**

For each pixel at `(x, y)`:

1. Derive `hexKey` from the buffer.
2. If `hexKey` is in `_sectorMap`:
   - Check right neighbor (`x+1, y`) and bottom neighbor (`x, y+1`) as already done
     for `borderEdges`.
   - If the neighbor's key differs AND the neighbor key is in `_sectorMap`:
     - `adjacencyMutable.get(hexKey)!.add(neighborKey)`
     - `adjacencyMutable.get(neighborKey)!.add(hexKey)` ← bidirectionality
3. Pre-initialize each `_sectorMap` key with an empty `Set` before the scan.

This runs **alongside** the existing `borderEdges`-producing code path in the same scan
block. `borderEdges` is deprecated but retained per the Deprecation Path below — do not
remove it as part of the CA-2 implementation.

#### `borderEdges` Deprecation Path

`borderEdges: BorderEdge[]` is already marked `@experimental` in `types.ts`. With
`adjacency` shipping, it becomes redundant for all standard use cases. However,
`borderEdges` carries richer spatial data (exact pixel coordinates of each edge
segment) that `adjacency` does not expose. The deprecation path:

1. **CA-2 ships:** Add `@deprecated` JSDoc to `BorderEdge` and `borderEdges`. Add a
   deprecation warning to the type comment pointing to `adjacency`.
2. **Retained until Dynamic Perimeter Rendering (CA-6):** The perimeter rendering
   capability will need exact edge coordinates. At that point, `borderEdges` is either
   superseded by a more structured perimeter structure, or retained as the backing
   data for CA-6's rendering pass. Decision deferred to CA-6 planning.
3. **Remove in a future release** once CA-6 has determined whether it needs the
   raw edge data in a different form.

#### Proposed API Contract — Phase 2 (Pathfinding, `SpatialGraph` module)

This is future work (CA-4), but the Phase 1 design must not foreclose it. The
`SpatialGraph` class will have the following shape:

```typescript
// New top-level export — Worker-safe (zero DOM / Three.js deps)
class SpatialGraph {
  constructor(
    adjacency: ReadonlyMap<string, ReadonlySet<string>>,
    centroids?: ReadonlyMap<string, { x: number; y: number }>
  )

  // A* (with centroids) or Dijkstra (without). Returns ordered hex key path, or null.
  findPath(
    from: string,
    to: string,
    cost: (from: string, to: string) => number,
    heuristic?: (a: string, b: string) => number
  ): string[] | null

  // Flood-fill reachability within a cost budget. Returns hexKey → accumulated cost.
  floodFill(
    origin: string,
    maxCost: number,
    cost: (from: string, to: string) => number
  ): Map<string, number>
}
```

`SpatialGraph` is instantiated by the consumer with `registry.adjacency` (and
optionally `registry.centroids`). It is stateless between calls — methods take a cost
function and run to completion. No `SectorRegistry` import (P-1 / P-2 compliance).

#### Prerequisites

None. Pure `SectorRegistry` spatial data. No Three.js, no DOM.

#### Explicit Out-of-Scope (Phase 1)

- Weighted edges (cost is user-land, not stored in the registry).
- Multi-hop queries, connected-component analysis, or shortest path — those are
  Phase 2 (`SpatialGraph`).
- Adjacency between bitmap-only (definition-less) sectors.

---

### CA-3 (Completed): Input Pipeline Hardening & Game Feel

**Horizon:** Immediate (ongoing maintenance track) — **Shipped 2026-04-13**
**Module ownership:** `MapEngine` + `MapRenderer` — input ownership is the core issue.

#### What Shipped

Button concerns fully separated: **middle-click = canonical pan trigger**, **left-click = hover/select/drag**. Pan gated behind a 4 CSS px dead zone; `setPointerCapture` on middle-button prevents stuck-drag when releasing outside the canvas. Scroll-wheel zooms toward the cursor (world point under cursor stays fixed). `isPanning` getter on `MapRenderer` (returns true as soon as middle button is held, before the dead zone is crossed) lets `MapEngine` suppress `sectorHover` noise during pan.

Left-click drag tracked via an independent state machine (`_leftPressed`, `_leftDragActive`, `_leftHasDragged`, `_leftDragOrigin`) — completely decoupled from middle-button pan state. No `setPointerCapture` for left button (would interfere with middle-button capture on Linux); outside-release handled via `(e.buttons & 1) === 0` in `_onPointerMove`. `isLeftDragging` suppresses `sectorHover` during a left drag; `leftHasDragged` (sticky until next `pointerdown`) swallows the synthesized `click` that the browser fires after `pointerup`. `isLeftDragging` is the future hook for marquee-select rendering.

Known limitation: Linux trackpads with middle-button scroll emulation (e.g. ThinkPad X220 with `EmulateWheelButton`) buffer the middle press until release, making real-time pan impossible without OS-level reconfiguration. This is a user-land concern — library code is correct per spec. 148 tests total; 14 added for this work.

#### Job Story

> When a player drags the map, clicks a province, or scrolls to zoom, I want those
> interactions to behave predictably and without artifacts, so the input layer is
> invisible and the game logic is what the player perceives.

#### Problem Statement

The input pipeline is currently split across two owners:

| Handler             | Lives in                  | Canvas events it registers                         |
| ------------------- | ------------------------- | -------------------------------------------------- |
| Pan/zoom            | `MapRenderer` constructor | `pointerdown`, `pointermove`, `pointerup`, `wheel` |
| Hover/click picking | `MapEngine.loadMap()`     | `pointermove`, `click`                             |

Both owners register independently on the same `HTMLCanvasElement`. This creates a
structural conflict: a pointer sequence of `pointerdown → pointermove → pointerup`
followed by a browser-synthesized `click` event can cause `MapEngine`'s click handler
to fire even though the pointer action was a drag, not a tap.

Known bugs will be filed against this track as they are identified. Each bug is an
implementation task within this capability area — the capability area itself does not
need to be re-scoped or re-defined when new bugs are added.

#### Architectural Fix: Unified Input Dispatch

The correct long-term architecture consolidates all canvas pointer-event registration
in `MapEngine`. `MapRenderer` becomes a consumer of processed input, not a direct
listener. The ownership model:

```
HTMLCanvasElement
       │
       │ all pointer / wheel events
       ▼
  MapEngine._inputDispatcher
       │                    │
       │ pan/zoom deltas     │ pick results
       ▼                    ▼
  MapRenderer           sectorHover / sectorClick events
```

**Drag-click disambiguation (immediate fix):**

Before the full unification refactor, the drag-click conflict can be resolved with
minimal surgery:

1. Add `_hasDragged: boolean` to `MapRenderer`, initialized `false` on `pointerdown`,
   set `true` on the first `pointermove` where the cumulative distance from
   `_pointerDownPos` exceeds the dead-zone threshold (see Dead-Zone section below).
   `_hasDragged` is a **sticky flag** — it persists until the next `pointerdown`.
   This is intentional: the browser fires the synthetic `click` event _after_
   `pointerup`, at which point `_isDragging` has already been reset to `false`.
   Checking `_isDragging` at click time would always return false and silently do
   nothing. `_hasDragged` captures "did the most recent press-release sequence include
   a drag?" and remains accessible when click fires.
2. Expose `get hasDragged(): boolean` on `MapRenderer` (reflects `_hasDragged`, not
   `_isDragging`).
3. In `MapEngine._handlePointerEvent` (the `click` branch): check
   `this._renderer.hasDragged` before emitting `sectorClick`. If `true`, swallow the
   click event.

This is the **immediate fix**. The full unification is the **eventual target** —
scheduled as a dedicated epic when the input ownership debt becomes blocking.

#### Dead-Zone Threshold

4 CSS pixels is the conventional click-vs-drag dead zone (matches browser drag
initiation heuristics). Configurable as a private constant `_DRAG_DEAD_ZONE_PX = 4`
in `MapRenderer`.

**Implementation note:** The dead-zone check requires a `_pointerDownPos: { x: number; y: number }`
stored on `pointerdown`. The comparison in `_onPointerMove` must be cumulative distance
from that stored position — NOT from `_lastPointerPos`, which is updated every frame and
would yield tiny per-frame deltas that never exceed the threshold:

```
Math.hypot(e.clientX - this._pointerDownPos.x, e.clientY - this._pointerDownPos.y) > _DRAG_DEAD_ZONE_PX
```

#### Bug Tracking Conventions

When a new input bug is identified:

1. Add a task to the active sprint's epic file under the "Input Pipeline" epic.
2. Reference this capability area (CA-3) in the task description.
3. The fix must not widen the input ownership split — patches must move toward
   the unified dispatch architecture, not entrench the current split.

#### Prerequisites

None structurally. Benefits from CA-1 (Frame Hook) being in place for frame-coherent
input processing, but CA-3 fixes are unblocked.

#### Explicit Out-of-Scope

- Touch / multi-touch support.
- Keyboard input.
- Gamepad input.
- Any input abstraction layer exposed to consumers (input handling remains internal).

---

### CA-4: Pathfinding Primitives (`SpatialGraph` — Phase 2)

**Horizon:** Icebox
**Module ownership:** New `SpatialGraph` class (new top-level export).

#### Job Story

> When I need to calculate movement routes, supply lines, or diplomatic reachability,
> I want to ask the engine for a path between two sectors with my game's traversal
> costs, so I can implement strategic movement without writing graph traversal myself.

#### Problem Statement

Once the Adjacency Graph (CA-2) exists, the raw topology is available but the
traversal runtime is not. Consumer game code that needs pathfinding must either
implement A\*/Dijkstra themselves (boilerplate that every GSG requires) or pull in a
third-party graph library (dependency bloat for a well-scoped operation).

`SpatialGraph` closes this gap: it is the traversal runtime that consumes the engine's
spatial topology with user-supplied cost semantics.

#### Proposed API Contract

See CA-2 § _Proposed API Contract — Phase 2_ for the full interface sketch. Summary:

- `new SpatialGraph(adjacency, centroids?)` — constructed once, reused for all queries.
- `findPath(from, to, cost, heuristic?)` → `string[] | null`
- `floodFill(origin, maxCost, cost)` → `Map<string, number>`
- A\* when heuristic is provided; Dijkstra when not.
- Default heuristic (when centroids provided but no heuristic given): Euclidean
  distance between sector centroids.
- Worker-safe (zero DOM / Three.js).

#### Architectural Implications

- `SpatialGraph` is a new export in `src/index.ts`. It is not part of `SectorRegistry`
  or `MapEngine` — it is a standalone utility class.
- The cost function contract is `(from: string, to: string) => number`. Returning
  `Infinity` marks an impassable edge (allows selective blocking without modifying
  the adjacency graph).
- Internal state (open/closed sets) is local to each `findPath`/`floodFill` call.
  `SpatialGraph` instances are effectively stateless between queries — safe to reuse
  across frames.
- The `adjacency` input is `ReadonlyMap<string, ReadonlySet<string>>` — directly
  compatible with `SectorRegistry.adjacency` without copying.

#### Prerequisites

**CA-2 (Adjacency Graph) must ship first.** `SpatialGraph` takes `registry.adjacency`
as its constructor argument.

#### Explicit Out-of-Scope

- Flow networks, capacitated graphs, or multi-commodity routing.
- Caching path results across frames (consumer responsibility).
- Path smoothing or waypoint simplification.
- Hierarchical pathfinding (HPA\*) — that belongs to CA-5 territory.

---

### CA-5: Hierarchical Aggregation

**Horizon:** Far Future
**Module ownership:** New `HierarchyRegistry` class.

#### Job Story

> When my game has provinces grouped into states and states grouped into countries, I
> want to query aggregate spatial data (combined bounding boxes, centers of mass,
> group-level adjacency) at each level of the hierarchy, so I can render borders, place
> labels, and run macro-level game logic without duplicating spatial math in userland.

#### Problem Statement

`SectorRegistry` is a flat sector store. All hierarchy is currently user-land
responsibility. For a GSG that operates at multiple geographic scales (province, state,
country), this means re-implementing bounding box union, centroid calculation, and
adjacency inference for each level. These are deterministic spatial operations that
belong in the engine layer.

#### Architecture Sketch

```typescript
type GroupDefinition = Record<
  string,
  {
    members: string[] // hex keys of constituent sectors
    [key: string]: unknown // consumer-defined group metadata
  }
>

class HierarchyRegistry {
  constructor(registry: SectorRegistry, definition: GroupDefinition)

  readonly bboxes: ReadonlyMap<string, SectorBBox> // unioned from member bboxes
  readonly centroids: ReadonlyMap<string, { x: number; y: number }> // centroid of member centroids weighted by pixel count
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>> // group-level topology
  readonly members: ReadonlyMap<string, ReadonlySet<string>> // groupId → member hex keys

  getGroup(groupId: string): GroupData | undefined
  getGroupKeys(): string[]
  getGroupAt(hexKey: string): string | undefined // which group does this sector belong to?
}
```

`HierarchyRegistry` composes over `SectorRegistry` (P-8 — no invasive changes).
It does not contain Three.js imports (Worker-safe).

Multiple levels of hierarchy can be stacked:
`SectorRegistry → HierarchyRegistry(provinces) → HierarchyRegistry(countries)`

**Stacking requires a shared input interface.** As sketched, the constructor accepts
`SectorRegistry` — but the second level of the stack would receive a `HierarchyRegistry`
as input, not a `SectorRegistry`. For stacking to work, either the parameter type must
be broadened to `SectorRegistry | HierarchyRegistry`, or a shared interface (e.g.,
`ISpatialRegistry` exposing `adjacency`, `bboxes`, `centroids`, `getSectorKeys()`) must
be defined and implemented by both. Designing this interface is deferred to CA-5
planning, but it must be resolved before implementation begins. Do not assume the
single-`SectorRegistry` constructor signature shown above is final.

#### Prerequisites

**CA-2 (Adjacency Graph) must ship first** — group-level adjacency is derived by
collapsing the sector-level adjacency graph.

#### Explicit Out-of-Scope

- Dynamic re-grouping at runtime (groups are defined at construction time).
- Cross-hierarchy queries ("which country does sector X belong to?" requires the
  consumer to chain two registries).

---

### CA-6: Dynamic Perimeter Rendering

**Horizon:** Far Future
**Module ownership:** New rendering module (tentatively `PerimeterRenderer`), wired
into `MapEngine`.

#### Job Story

> When sectors are grouped into a country, I want the engine to draw a thick, clean
> border around the country's full perimeter — ignoring internal province lines — so
> the political map reads clearly without me manually specifying border coordinates.

#### Problem Statement

There is currently no rendering primitive for derived borders. `MapRenderer` renders
the source bitmap as a flat texture. Sovereign borders — the hallmark visual element
of Paradox-style maps — require a separate rendering pass that:

1. Knows which sectors form a contiguous group (requires CA-5).
2. Computes the outer perimeter of that group (requires `borderEdges` or a derived
   structure).
3. Renders that perimeter as a thick, styled line overlay (requires a new Three.js
   geometry, likely `THREE.LineSegments` or a custom screen-space shader).

#### Architecture Sketch

The perimeter rendering pass runs on top of the existing `PlaneGeometry` texture pass.
A `THREE.LineSegments` geometry is constructed from the outer perimeter edges of each
group and rendered in the same scene. Alternatively, a post-process shader (screen-
space edge detection on the group ID) avoids CPU perimeter walking but is harder to
style precisely — the line geometry approach is preferred for v0.0.1 of this feature.

**Critical dependency on `borderEdges`:** The outer perimeter of a group is the subset
of `borderEdges` where one side is a member sector and the other is not. Whether
`borderEdges` is retained as-is or replaced by a more structured perimeter structure
will be decided during CA-6 planning. See CA-2 § _`borderEdges` Deprecation Path_.

#### Prerequisites

**CA-5 (Hierarchical Aggregation) must ship first** — perimeter computation requires
knowing which sectors are in the same group.

---

### CA-7: GPU Map Modes (Bulk Visual State Projection)

**Horizon:** Far Future
**Module ownership:** `MapRenderer` (new shader architecture). Breaking change to
rendering internals.

#### Job Story

> When I want to switch between map modes (Political, Terrain, Religious, Economic),
> I want the entire map to re-color instantly at 60fps, so mode switching feels
> instantaneous and doesn't stall when the map has thousands of sectors.

#### Problem Statement

The v0.0.1 color overlay strategy (CPU iteration over `pixelIndices`, dirty-rect
`putImageData`, `texture.needsUpdate = true` triggering full `texImage2D` re-upload)
is O(pixels) per sector mutation and O(total pixels) for a full map-mode swap. For
maps with millions of pixels and thousands of sectors, a full mode swap causes a
visible stall.

The GPU palette approach replaces the CPU iteration with a fragment shader:

- A **sector ID texture** (one pixel per map pixel, value = sector index) is created
  once at load time.
- A **palette texture** (one pixel per sector, value = display color) is updated
  per-frame by the consumer.
- The fragment shader samples the sector ID texture, looks up the corresponding palette
  entry, and outputs the display color — all on the GPU.

Swapping the entire map mode becomes a single palette texture upload, not an O(pixels)
CPU operation.

#### Architectural Implications

This is a **planned breaking change** to `MapRenderer`'s rendering internals:

- `displayImageData` and the dirty-rect CPU path are replaced.
- `setSectorColor` / `resetSectorColor` semantics change internally (they update palette
  entries, not CPU pixel buffers), but their **method signatures are preserved** — this
  is required by P-6. The implementation changes; the contract does not.

**CA-1 (The Frame Hook) is a prerequisite** — frame-coherent palette batching (all mode
changes committed in a single frame before the render) is essential for correctness.
Without the Frame Hook, palette writes from multiple `setSectorColor` calls could result
in partially-updated frames being rendered.

This capability requires a dedicated migration plan when it is promoted to the
Immediate tier. No existing code should be designed in a way that deepens coupling
to the CPU dirty-rect path.

#### Prerequisites

**CA-1 (The Frame Hook) must ship first.**

---

### CA-8: Spatial Anchoring & Skeletonization

**Horizon:** Far Future
**Module ownership:** New `SpatialAnchor` utility (Worker-safe).

#### Job Story

> When I want to place a country label, a 3D army sprite, or a curved text spline
> inside a sector or country territory, I want the engine to give me a guaranteed
> interior anchor point so my UI element never renders in the ocean or outside its
> territory, even for non-convex or island territories.

#### Problem Statement

`SectorRegistry.centroids` provides a pixel-average centroid, which is guaranteed
inside a convex sector but **not** inside a non-convex sector (a narrow peninsula,
an L-shaped territory, or an island sector can have a centroid that lies outside the
sector's actual pixels). UI anchoring to raw centroids is therefore unreliable for
real-world GSG maps with irregular province shapes.

The Pole of Inaccessibility (Chebyshev center — the point inside a polygon furthest
from any border) guarantees an interior point for any connected region. For sectors
where the raw centroid is inside, the Chebyshev center provides a stability bonus:
it is maximally inset from borders, making it a better anchor for labels that must
not overlap neighboring territory.

#### Architecture Sketch

```typescript
// New Worker-safe utility — no DOM, no Three.js
class SpatialAnchor {
  constructor(registry: SectorRegistry)

  // Returns the pole of inaccessibility for the given sector.
  // Falls back to centroid if sector is too small for meaningful computation.
  getPole(hexKey: string): { x: number; y: number; radius: number }

  // Precomputes poles for all sectors — expensive, intended as a one-time
  // initialization pass, not per-frame.
  precompute(): void
}
```

Skeletonization (medial axis transform) is computationally heavier and is deferred
further. The Pole of Inaccessibility via the `polylabel` algorithm (or a raster
approximation from `pixelIndices`) is the first deliverable.

#### Prerequisites

**CA-6 (Dynamic Perimeter Rendering) for group-level anchoring.** Sector-level poles
can be computed from `pixelIndices` with no other prerequisites.

---

### CA-9 (Completed): Game Clock (Temporal Primitive)

**Horizon:** Near Future — **Shipped 2026-04-20**
**Module ownership:** New `GameClock` class (standalone export, main-thread).

#### What Shipped

`GameClock` class added as a new top-level export. `ClockTickCallback` type added to `src/types.ts`. Fixed-step accumulator driven by `engine.onFrame`: each frame `accumulator += dt * speed`; when `accumulator >= (1 / ticksPerSecond)` one or more `onTick` callbacks fire and the accumulator is decremented. `MAX_TICKS_PER_FRAME = 10` cap prevents spiral-of-death on lag spikes. `setSpeed(multiplier)`, `pause()`, `resume()` (restores last non-zero speed), `onTick`/`offTick`, `paused`/`speed`/`elapsed` getters, and `destroy()` (unregisters from `onFrame`). Callbacks wrapped in try/catch to prevent a failing subscriber from halting the clock. 15 tests added; total 174 at ship.

#### Job Story

> When I'm building a grand strategy game, I need a game clock that advances at a
> configurable real-time rate, can be paused and resumed, and fires a callback on
> each discrete unit of game time — a day, an hour, a turn — so I can run my
> simulation logic at a consistent cadence that is decoupled from the render frame rate.

#### Problem Statement

In Paradox-style grand strategy games (EU4, CK3, HOI4, Stellaris), time is not
continuous — it advances in discrete units (days, hours) at a configurable rate.
"Speed 1" might mean one game-day per second; "Speed 5" might mean thirty per second.
The game can be paused entirely. All simulation logic — province income, army
movement, event firing — runs on each clock tick. This cadence is independent of
the render frame rate.

`onFrame` provides a per-render-frame hook, but it is the wrong primitive for game
logic: at 60fps, attaching simulation to every frame creates 60 logic evaluations
per second at all speed settings, couples performance to monitor refresh rate, and
muddies the semantic distinction between "visual update" and "simulation step."
Consumer code that implements the clock pattern themselves must either:

1. Write a manual accumulator inside `onFrame` (boilerplate every GSG needs), or
2. Use `setInterval` (decoupled from the engine, no `onFrame` integration, drift-prone).

A `GameClock` primitive in the engine provides the correct abstraction: a
fixed-interval, speed-configurable, pausable clock that is driven by `onFrame` so its
ticks stay coherent with the render pipeline.

#### Proposed API Contract (MVP)

```typescript
// New export — main-thread only (wires into onFrame internally)
type ClockTickCallback = (elapsed: number) => void

class GameClock {
  constructor(engine: MapEngine, options?: { ticksPerSecond?: number })
  // Default: 1 tick/second (speed 1x). ticksPerSecond is the base rate at speed 1.

  setSpeed(multiplier: number): void // 0 = paused, 0.5 = half, 1 = normal, 5 = fast
  pause(): void // sugar for setSpeed(0)
  resume(): void // restores last non-zero speed

  onTick(callback: ClockTickCallback): void // fires once per discrete clock tick
  offTick(callback: ClockTickCallback): void

  readonly paused: boolean
  readonly speed: number // current multiplier
  readonly elapsed: number // total ticks fired since construction

  destroy(): void // unregisters from engine's onFrame
}
```

**Behavior contract:**

- `GameClock` registers one callback with `engine.onFrame(...)` internally. It owns
  its own accumulator. `dt` from the frame hook is the sole time source.
- Each frame, `accumulator += dt * speed`. When `accumulator >= (1 / ticksPerSecond)`,
  one (or more, for large dt spikes) `onTick` callbacks fire and the accumulator is
  decremented. This is the standard fixed-step accumulator — no drift, no missed ticks.
- Multiple ticks can fire in a single frame if `dt` is large (e.g., tab was backgrounded).
  Maximum ticks per frame should be capped (e.g., 10) to prevent spiral-of-death on lag
  spikes. Cap value is an implementation detail, not a public parameter in the MVP.
- `ClockTickCallback` receives `elapsed` — the total count of ticks fired so far
  (monotonically increasing integer). The consumer derives "current game date" from
  `elapsed` using their own calendar logic. The engine does not own a calendar.
- `destroy()` must be called when the consumer no longer needs the clock; it
  unregisters the internal `onFrame` listener to stop the accumulator.

#### Architectural Implications

- `GameClock` is a **standalone export** — not wired into `MapEngine` by default.
  Consumer instantiates it explicitly. This respects P-4 (the engine never owns game
  state) and P-8 (composable, not invasive).
- `GameClock` is **main-thread only**: it wires into `onFrame`, which is main-thread.
  It does not need to be Worker-safe.
- The `ClockTickCallback` name intentionally uses "tick" — inside the `GameClock`
  context, a "tick" is the canonical GSG term for a discrete unit of game time. This is
  semantically distinct from `FrameCallback` (render-frame hook on `MapEngine`).

#### Prerequisites

**CA-1 (The Frame Hook) must ship first.** `GameClock` is built on top of `onFrame`.

#### Explicit Out-of-Scope (MVP)

- Calendar / date system — elapsed tick count is the primitive; date math is user-land.
- Multiple simultaneous clocks at different rates — one `GameClock` per engine for MVP.
- Networked synchronization or deterministic replay — deferred.
- Fixed-timestep physics accumulator concerns — this is a game logic clock, not physics.

---

## Risk Register

| ID      | Risk                                                                                            | Severity | Likelihood            | Mitigation                                                                                                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-1** | `setSectorColor` called both inside and outside frame callbacks creates double-flush            | Medium   | High                  | Batch dirty rects within frame via `_inTick` flag; document `onFrame` as canonical path.                                                                                                                                                                                                                                              |
| **R-2** | `borderEdges` has external consumers when deprecation lands                                     | Low      | Low                   | Already marked `@experimental`. Deprecation notice added in CA-2; removal in a future major. CA-6 determines final fate.                                                                                                                                                                                                              |
| **R-3** | Input pipeline split (MapRenderer + MapEngine) accrues bug debt faster than fixes are scheduled | Medium   | Medium                | CA-3 establishes the unified dispatch target architecture. All fixes must trend toward consolidation, not deepen the split.                                                                                                                                                                                                           |
| **R-4** | GPU map modes (CA-7) require a planned breaking change to rendering internals                   | High     | Certain (intentional) | No new code should deepen coupling to the CPU dirty-rect path. Deprecation plan written when CA-7 is promoted to Immediate.                                                                                                                                                                                                           |
| **R-5** | `SectorRegistry` design forecloses Worker-offloading                                            | High     | Low                   | P-1 and P-2 are verified manually — there is no automated lint rule for this (ESLint and CI are deferred). After any change to `src/SectorRegistry.ts` or `src/SectorBitmapParser.ts`, grep the file for `import.*three` and for DOM APIs (`document`, `window`, `HTMLCanvasElement`, `OffscreenCanvas`, etc.) to confirm compliance. |
| **R-6** | Hierarchical aggregation attempted via `SectorRegistry` mutation rather than composition        | Medium   | Low                   | P-8 (composable over invasive) governs this explicitly. `HierarchyRegistry` takes a `SectorRegistry` as constructor input.                                                                                                                                                                                                            |
| **R-7** | Pathfinding `SpatialGraph` instantiated per-query rather than once, causing GC pressure         | Medium   | Medium                | Document that `SpatialGraph` is intended to be constructed once (or once per game session) and reused for all queries.                                                                                                                                                                                                                |
