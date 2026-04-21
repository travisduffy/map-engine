# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Versioning era:** The project is in early development (`v0.0.y`). All releases
> increment the patch version only, regardless of change type. No MINOR or MAJOR
> bumps will occur without explicit BDFL instruction.

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
