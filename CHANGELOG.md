# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Versioning era:** The project is in early development (`v0.0.y`). All releases
> increment the patch version only, regardless of change type. No MINOR or MAJOR
> bumps will occur without explicit BDFL instruction.

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
