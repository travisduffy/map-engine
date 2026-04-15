# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Versioning era:** The project is in early development (`v0.0.y`). All releases
> increment the patch version only, regardless of change type. No MINOR or MAJOR
> bumps will occur without explicit BDFL instruction.

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
