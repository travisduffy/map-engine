# map-engine — Vision & Design Charter

> **Status:** Living reference. This is the take-forward distillation of the project's
> design intent, extracted from the now-retired roadmap. It captures _what the engine is,
> the principles that hold veto power over any change, what it deliberately is not, and the
> directions that remain open_ — without the sprint/phase/audit machinery that has been
> archived. Full historical detail lives in `docs/archive/ROADMAP.md`.
>
> Use this to keep new work on-track. When a proposed change conflicts with a First-Class
> Principle below, the change is wrong by default until an explicit, recorded justification
> says otherwise.

## North Star

`map-engine` is a **minimal, browser-native Grand Strategy Game (GSG) spatial runtime**
built on WebGL (Three.js) and typed ESM. It provides the Pareto-optimal set of spatial and
temporal primitives every GSG needs — sector identity, spatial topology, visual
synchronization, and traversal — **without ever owning game state, simulation logic, or
UI.**

The guiding posture is the **"Hobbyist GSG Portfolio" North Star**: prioritize ergonomics,
deployability, and performance ROI over theoretical maximums. The engine synchronizes
visuals against a map; it does not simulate a game.

## First-Class Principles (veto-bearers)

These define the engine's ethos — _balance performance with pragmatism_. Any change that
violates one is rejected unless it carries an explicit, written justification.

| #        | Principle                         | Mandate                                                                                                                                                                               |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR-1** | **Hobbyist Deployability**        | Must run on zero-config static hosts (GitHub Pages, Netlify, itch.io). Requirements for special headers (COOP/COEP) or non-standard hosting are rejected by default.                  |
| **PR-2** | **Ergonomic Public API**          | The public surface must be writable by developers comfortable with idiomatic JS/Three.js. SoA layouts, BigInt arithmetic, and WASM memory models must never leak into the public API. |
| **PR-3** | **Performance Where It Earns It** | Optimizations must tie to concrete GSG targets (e.g. "10,000 sectors at 60fps"). Optimizations with no measurable impact on the hobbyist use case are rejected.                       |
| **PR-4** | **Conservative Surface Growth**   | Every public export is a maintenance contract. Prefer internal modules and abstractions over new public exports.                                                                      |
| **PR-5** | **Reversibility**                 | Prefer reversible decisions. Version pins, required headers, and forced async boundaries carry high reversal cost and demand severe scrutiny.                                         |

## Architectural invariants

Hard rules that keep the engine's internal integrity. These are enforced in code (and
mirrored as operative constraints in `CLAUDE.md`); the rationale is here.

- **Worker-safe core.** `SectorRegistry` has zero Three.js imports; `SectorBitmapParser`
  and `SectorRegistry` have zero DOM dependencies. They must stay Transferable-friendly and
  runnable inside a Web Worker.
- **Main-thread boundary.** `MapRenderer` and `MapEngine` are main-thread only (they touch
  WebGL and the DOM).
- **Never owns game state.** The engine synchronizes visuals; it does not simulate. When
  the consumer hasn't supplied data (e.g. traversal costs), fail loudly rather than invent
  it.
- **Single-pass spatial data.** New spatial structures in `SectorRegistry` are computed
  during the existing O(W×H) bitmap scan — a second full-bitmap pass violates PR-3.
- **Composable, not invasive.** New modules wrap; they don't mutate existing classes.
- **Core size budget.** The built library stays lightweight (target < 15 KB gzipped;
  `npm run size`) — lightness is part of PR-1.
- **Transferable discipline, not shared memory.** Main↔Worker communication uses
  Transferable ownership of typed arrays via `postMessage`, not `SharedArrayBuffer`. Hot-path
  buffers use a bounce-back / pooled handoff to keep GC churn near zero. This is what lets
  the engine ship without COOP/COEP headers (PR-1).

## Engineering mandates (the Pillars)

Enduring architectural direction. Some are realized today; others describe the intended
shape of any future work in that area.

- **I. Temporal Accumulation (float-based).** A stable discrete-state accumulator on
  IEEE-754 `performance.now()`. JS-native ergonomics over fixed-point exotica. _(BigInt/
  fixed-point accumulators are explicitly rejected — see Non-goals.)_
- **II–III. State & Worker boundary.** Normalized Structure-of-Arrays for cache coherency;
  a strict UI/render ↔ simulation-kernel boundary crossed only by Transferable buffers.
- **IV. Rendering.** The map is an immutable "RGB index-map" spatial database; the GPU acts
  as translator via fragment-shader palette LUTs. Upload via `gl.texSubImage2D`.
- **VI. User Interface (aspirational).** Any first-party UI layer would run off-main-thread
  (OMT) with Svelte 5-style surgical reactivity — _not yet built, uncommitted._
- **VII. AI & Modding boundary (aspirational).** Utility-scoring AI and modulo-based
  scheduling; an embedded QuickJS boundary for modding — _not yet built, uncommitted._
- **V. [Retired].** Multiplayer & networking, dropped in the pivot to single-player
  hobbyist tooling.

## What the engine is today

Shipped capability surface (see `README.md` for the full public API):

- **Sector identity & topology** — RGB index-map parsing, dense numeric sector IDs,
  adjacency (`getNeighbors`), contours, bounding boxes/centroids.
- **Rendering** — WebGL index-map rendering behind `IThreeRenderBackend`, palette/map-mode
  shaders (`registerMapMode`), picking, resize.
- **Temporal** — a frame hook (`onFrame`) and a split `RenderClock` / `SimulationClock`
  (the older `GameClock` has been removed).
- **Off-main-thread kernel** — registry state and heavy computation relocated to a Worker
  via Transferable ownership.
- **GSG primitives (Worker-side):** pathfinding (`setTraversalCosts` / `findPath`),
  hierarchical aggregation (`setParentMapping` / `aggregateGroups` / `getGroupBBox`),
  dynamic perimeter borders (`recomputeBorders`), and spatial anchoring via pole-of-
  inaccessibility (`computeAnchors` / `getAnchor`).

## Non-goals (settled exclusions)

These were considered and deliberately cut. Re-opening any of them requires revisiting the
principle that killed it — don't reintroduce them casually.

- **BigInt / fixed-point accumulators** — cut per PR-2; float `performance.now()` retained.
- **`SharedArrayBuffer` transport** — cut per PR-1; replaced by Transferable discipline.
- **Multiplayer / lockstep netcode & rollback** — Pillar V retired; single-player focus.
- **Stripping Three.js** — retained behind `IThreeRenderBackend` rather than removed.
- **WASM for core logic** — relegated; the bet is JS-native performance ROI (PR-3).
- Also out of scope for the current release: rivers/heightmaps, CSV formats (JSON only),
  built-in UI/tooltips/legends, SSR/Node, multiple simultaneous instances, touch input,
  UMD/CJS bundles, framework integration layers. (See `README.md` §"What this version does
  not include".)

## Open directions (uncommitted)

Sketched but **not committed** — each is gated on an explicit decision to pursue it, and
each must still satisfy the First-Class Principles above:

- **Svelte 5 OMT bindings** (Pillar VI) — a first-party off-main-thread UI binding.
- **QuickJS modding engine** (Pillar VII) — a sandboxed scripting boundary for game logic.
- **Group-scope palettes** (Pillar IV) — extend `registerMapMode` with
  `{scope: 'sector' | 'group'}`, resolving sector→group via `parentMapping` in the shader.

## References

- `README.md` — public API, requirements, current-release scope.
- `.claude/rules/architecture.md` — module layout, data flow, rendering/resize internals.
- `docs/archive/ROADMAP.md` — full historical roadmap, memory contract, and per-milestone
  detail (frozen; read-only).
- `docs/research/` — supporting architecture/engineering research.
