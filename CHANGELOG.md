# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Versioning era:** The project is in early development (`v0.0.y`). All releases
> increment the patch version only, regardless of change type. MINOR or MAJOR
> bumps are a deliberate, manually-chosen step, not an automatic consequence of
> any change.

---

## [0.0.7] — 2026-07-22

Map-load cost made measurable, then reduced. The load path had never been benchmarked — the figure the README quoted was prose, and the one benchmark that could have grounded it had not compiled since a module reorganization. Measuring it first showed the suspected cost was not the real one.

### Changed

- `SectorRegistry`'s scan is **4–6× faster**. It now runs as two O(W×H) passes instead of one: pass 1 resolves each pixel's sector identity, pass 2 detects borders by reading the `pixelIndices` pass 1 already wrote. Border detection needs each pixel's right and bottom neighbour, so the single-pass form resolved every pixel's colour three times — once as itself, twice as a neighbour. The hot loop also keys on packed RGB integers rather than hex strings, removing roughly 50M string allocations per 4096×4096 load. Measured back to back at 4096×4096 with total sector coverage: 11,585 ms → 1,857 ms at 1,000 sectors, 13,309 ms → 3,165 ms at 10,000. All scan output buffers are byte-identical to the previous implementation
- `SectorRegistry.getSectorPixels(hexKey)` is replaced by `hasSectorPixels(hexKey): boolean`. The per-sector pixel index arrays it returned were built as JS arrays, converted to `Uint32Array`s with both representations simultaneously live, and retained for the lifetime of the registry — roughly 64 MiB at 4096×4096 — while the only consumer inside the engine was a null check. The recolor precondition is now served by the per-sector pixel tally the scan already maintains for centroids
- `README.md`'s main-thread cost and mobile heap figures are replaced with measured ones. The previous "200–500 ms on an 8192×4096 bitmap" and "~192 MB" figures had no measurement behind them, and the heap figure omitted the per-sector pixel arrays entirely

### Added

- `npm run bench:registry-alloc` measures scan wall-clock, peak allocation during the scan, and allocation retained after it. Peak is sampled as process-wide RSS from a worker thread, since `process.memoryUsage()`'s heap fields are per-V8-isolate and unreadable from another thread; the heap-vs-ArrayBuffer split applies to the retained main-thread sample. Each fixture size runs in its own process because RSS is a high-water mark
- `test/fixtures/generate-registry-fixture.ts` — seeded in-process fixture generator producing a raw RGBA buffer and matching definition at a configurable sector count, with total coverage and a guaranteed minimum of one pixel per declared sector
- `npm run typecheck:bench` and `npm run typecheck:test` — `bench/` and `test/` were outside every typecheck surface. The first `typecheck:test` run found a test helper reconstructing Worker errors from a field absent from the message type, which had been rejecting with `Error: undefined`

### Fixed

- `bench/registry-alloc.spec.ts` imported `../src/SectorRegistry` and `../src/types`; both paths moved during a module reorganization and the spec had not compiled since

---

## [0.0.6] — 2026-07-09

Phase 4 (GSG Logic) — Worker-side grand-strategy spatial primitives built on the v0.0.5 Off-Main-Thread kernel. All computation runs in the Web Worker and returns to Main via the zero-GC Transferable ring-pool handoff.

### Added

- Pathfinding (CA-4): `MapEngine.setTraversalCosts(costs: Uint8Array): Promise<void>` (transfers the caller's buffer to the Worker; sub-views are rejected) and `MapEngine.findPath(startId: number, endId: number): Promise<Uint16Array>` — A\* over the CSR adjacency graph in the Worker, returning the sector-ID sequence
- Hierarchical aggregation (CA-5): `MapEngine.setParentMapping(mapping: Uint16Array, maxGroups: number): Promise<void>`, `MapEngine.aggregateGroups(): Promise<void>`, and the synchronous `MapEngine.getGroupBBox(groupId: number)` accessor served from the ring-pool snapshot — folds member-sector bboxes into one aggregate bbox per group (sectors mapped to `0xFFFF` are excluded)
- Spatial anchoring (CA-8): `MapEngine.computeAnchors(): Promise<void>` and the synchronous `MapEngine.getAnchor(sectorId: number)` accessor — a guaranteed-interior label anchor (Pole of Inaccessibility / `polylabel`) per sector, computed from the B1.e contour segments
- Dynamic perimeter rendering (CA-6): `MapEngine.recomputeBorders(): Promise<void>` (concurrent calls coalesce to ≤2 Worker computations sharing one resolution), the synchronous `MapEngine.getBorderSegments(): Float32Array | null` accessor, and `MapEngine.setBordersVisible(visible: boolean): void`. Group perimeters draw as GPU-VBO-backed `THREE.LineSegments` via the new internal `BorderRenderer`; the managed VBO survives WebGL context loss (re-uploaded and re-bound on `webglcontextrestored`)
- `MapEngine.project(x: number, y: number): [number, number]` — closed-form bitmap-pixel → CSS-screen-space projection honoring live camera pan/zoom (no Three.js type crosses the public boundary)
- Canonical errors now active: `MappingRequiredError` (aggregation/border precondition unmet), `PathNotFoundError` (endpoints unreachable), `CostsRequiredError` (`findPath` before `setTraversalCosts`)

### Removed

- `GameClock` and its `ClockTickCallback` type — deleted per the Phase 4 Finality Audit after the v0.0.5 deprecation window. All consumers now use `RenderClock` (Main) or `SimulationClock` (Worker); the example app migrated to an inline fixed-tick accumulator against `engine.onFrame(dt)`

---

## [0.0.5] — 2026-07-07

### Added

- Off-Main-Thread (OMT) architecture: `MapEngine` spins up a dedicated Web Worker on construction; `loadMap()` performs a one-time `BOOTSTRAP` transfer of all 9 registry buffers (`pixelIndices`, `bboxes`, `centroids`, `adjacencyPointers`, `adjacencyNeighbors`, `contourPointers`, `contourPoints`, `borderEdges`, `borderEdgeCount`) — Main-thread `byteLength === 0` on all nine post-transfer
- `MapEngine.setTickRate(hz: number): void` — configures the Worker-side simulation tick rate (1–240 Hz, default 60); must be called before `loadMap()` resolves
- `RenderClock` (Main thread) / `SimulationClock` (Worker, accumulator-driven fixed tick) replace the single main-thread `GameClock` for the OMT split; `yieldIfNeeded` cooperative yield helper prevents Worker event-loop starvation on heavy tasks
- `SharedRegistryProxy` — Main-thread proxy correlating `CALL`/`RESULT`/`ERROR` messages with the Worker, serving `getBBox`/`getCentroid`/`getNeighbors` from refreshed snapshots (both hex-string and numeric-ID overloads)
- `MapEngine.pick(point): Promise<PickResult | null>` — GPU-readback-based picking; **the sole sanctioned async signature break** from the prior synchronous event-driven model, needed to support OMT and WebGL2 index-texture readback
- GPU fragment-LUT palette shader (GLSL3 `RawShaderMaterial`, `usampler2D` index texture + RGBA8 palette LUT) replaces CPU pixel iteration — `setSectorColor`/`resetSectorColor` are now O(1) LUT-entry writes with zero index-texture re-upload
- `MapEngine.registerMapMode(id, colors)` / `setMapMode(id)` — named full-map palette registry for map-mode swaps (e.g. political/terrain views), each a single render submit with zero-op semantics on redundant re-activation
- `MapEngine.dispose(): Promise<void>` — rejects all in-flight proxy calls with `MapInvalidatedError`, tears down the Worker/renderer/GPU resources; `destroy()` now delegates to it fire-and-forget
- Reload lifecycle: calling `loadMap()` on an already-loaded engine now invalidates and re-bootstraps the session (rather than throwing) — in-flight async calls reject with `MapInvalidatedError`
- WebGL context-loss resilience: a Main-resident `pixelIndicesMirror` (`Uint16Array`) downcast re-uploads the index texture on `webglcontextrestored`; `WebGL2NotSupportedError` thrown if WebGL2 is unavailable
- New canonical errors: `WebGL2NotSupportedError`, `MappingRequiredError`, `PathNotFoundError`, `CostsRequiredError`, `ModeNotReadyError`, `MapInvalidatedError` (`src/errors.ts`), alongside the relocated `SectorLimitExceededError`
- `example/` gained a Map Modes UI panel and relative (`base: './'`) asset URLs so the built example works under both root-path and GH-Pages-style subpath static hosting

### Changed

- `MapEngine.registry` getter is now `@deprecated`: throws `MapInvalidatedError` once the bootstrap transfer has detached the registry's buffers. Use `getSector`/`getSectorKeys`/`getBBox`/`getCentroid`/`getNeighbors` instead — these remain synchronous, served from pre-transfer snapshots
- `IThreeRenderBackend` gained `writePaletteEntry`/`updateUniforms`; the CanvasTexture-era `texture`/`uploadTexture` display path was fully retired now that all color mutation goes through the palette LUT

---

## [0.0.4] — 2026-06-14

### Added

- `SectorRegistry` flattened to a dense Structure-of-Arrays (SoA) layout: `bboxes`/`centroids`/`pixelIndices` as `TypedArray`s over dense `0..N-1` numeric sector IDs (>80% reduction in constructor heap allocation vs. the prior `Map`-based layout)
- CSR (Compressed Sparse Row) adjacency: `adjacencyPointers`/`adjacencyNeighbors` replace the prior `Map<string, Set<string>>` adjacency structure
- Contour extraction folded into the existing O(W×H) construction scan: `contourPointers`/`contourPoints` (unordered per-sector boundary segment CSR list), plus `borderEdges`/`borderEdgeCount` allocation (`SectorRegistry`'s border-edge allocator; population deferred to a future phase)
- `IThreeRenderBackend` interface extracted from `MapRenderer` — decouples core render-state logic from Three.js; `NullRenderBackend` test double added so logic tests no longer require a real WebGL context
- `ISpatialRegistry` contract groundwork for future hierarchical (group/country-level) spatial proxies

### Changed

- `pick()` transition to an asynchronous signature was formally planned (implemented in 0.0.5) to accommodate the upcoming GPU-readback/Worker IPC pipeline

---

## [0.0.3] — 2026-05-13

### Added

- `InputController` (`src/input/InputController.ts`) — consolidated all pan/zoom/pick pointer-event handling out of `MapEngine`/`MapRenderer` into one Main-thread-only, DOM-owning module
- Render gating: `MapRenderer` now tracks a dirty flag and skips `renderer.render()` on no-op frames (no pointer activity, no pending color flush, no `setImmediateColor`, unchanged canvas size) — eliminates ~95% of wasted GPU submits on a static scene
- Phase 0 project infrastructure: benchmark harness (`npm run bench:registry-alloc`), roadmap/finding-code consistency scripts (`bin/check-*.sh`), and the anchor-shape fixture set (`test/fixtures/anchor-shapes.json`) used by later phases

---

## [0.0.2] — 2026-04-20

### Added

- `onFrame` / `offFrame` on `MapEngine` — pre-render callback hook that fires at the top of every rAF frame, enabling frame-coherent batching of `setSectorColor` calls
- `setSectorColor` / `resetSectorColor` calls made inside an `onFrame` callback are batched into a single dirty-rect flush per frame, eliminating redundant `putImageData` / `texImage2D` re-uploads
- `GameClock` — standalone, speed-configurable, pausable clock driven by the frame hook accumulator pattern; fires `onTick` callbacks at a consistent rate decoupled from render frame rate; exported as a top-level named export
- `FrameCallback` and `ClockTickCallback` types exported from the library
- `SectorRegistry.adjacency` — bidirectional, deduplicated neighbor map (`ReadonlyMap<string, ReadonlySet<string>>`) built during the existing O(W×H) constructor scan; no second scan pass
- `MapEngine.getNeighbors(hexKey)` — convenience wrapper returning the adjacency set for a given sector
- `src/internal/color.ts` — shared `parseColorToRgb` utility backed by a module-scope `OffscreenCanvas` singleton; removes per-`MapRenderer`-instance color parser canvas
- `test/testUtils.ts` — shared test utilities (`makeCanvas`, `advanceFrame`, `buildTestBuffer`) used across all browser-mode test files

### Deprecated

- `SectorRegistry.borderEdges` — superseded by `SectorRegistry.adjacency`; retained for backward compatibility with a `@deprecated` JSDoc annotation
- `BorderEdge` type — superseded; annotated `@deprecated`

---

## [0.0.1] — 2026-04-13

### Added

- `SectorBitmapParser` — loads a PNG URL or Blob into a raw RGBA `Uint8ClampedArray`; Worker-safe
- `SectorRegistry` — single O(W×H) scan producing hex-key map, bboxes, centroids, `pixelIndices`, `borderEdges`; zero Three.js imports
- `MapRenderer` — Three.js scene with `OrthographicCamera`, `PlaneGeometry` + `CanvasTexture`, pan (middle-click drag) and zoom (scroll wheel), `setSectorColor` / `resetSectorColor`
- `MapEngine` — public facade: `loadMap()`, `destroy()`, `on` / `off` (`sectorHover`, `sectorClick`), `getSector`, `getSectorKeys`, `setSectorColor`, `resetSectorColor`, `renderer` / `registry` getters
- `toHexKey(r, g, b)` utility
- Canvas resize handled inside the rAF loop (webgl2fundamentals pattern) with proportional frustum scaling
- Middle-click pan with 4 px dead zone and pointer capture; left-click drag suppression to prevent hover/click bleed
- Zoom toward cursor on scroll wheel
- `example/` — permanent canonical example app (vanilla TypeScript + Vite) exercising every public API surface
- Library distributes as ESM only (`dist/index.js` + `.d.ts` declarations); `three` is a peer dependency (not bundled); gzipped size < 15 KB
