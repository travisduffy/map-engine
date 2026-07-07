---
paths:
  - 'src/**/*.ts'
  - 'example/**/*.ts'
  - 'test/**/*.ts'
---

## The four modules (v0.0.1 — implemented)

| Module               | Role                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser` | Loads PNG URL or Blob → raw RGBA pixel buffer + dimensions. Worker-safe (zero DOM deps).                                                                                                    |
| `SectorRegistry`     | Single O(W×H) scan over pixel buffer + JSON definition → all spatial data (hex-key map, bboxes, centroids, pixelIndices, borderEdges). Immutable after construction. Zero Three.js imports. |
| `MapRenderer`        | Three.js scene: OrthographicCamera, PlaneGeometry + CanvasTexture, pan/zoom, `setSectorColor`/`resetSectorColor`. Main-thread only.                                                         |
| `MapEngine`          | Public facade wiring all modules. Zero-arg constructor; consumer calls `loadMap(bitmapUrl, definitionUrl, canvas)`.                                                                         |

## Key data flow

1. `SectorBitmapParser.parse(source)` → `{ buffer: Uint8ClampedArray, width, height }`
2. `SectorRegistry(buffer, width, height, definition)` → spatial lookup structure
3. `MapRenderer(canvas, registry)` → Three.js scene with CanvasTexture initialized from `registry.sourceBuffer`
4. `MapEngine.loadMap()` orchestrates 1–3; exposes `on('sectorHover'|'sectorClick', cb)` events

## Sector identity system

Every pixel's RGB value encodes a sector identity. The hex key (`"ff0000"` lowercase, no `#`) is the universal identifier connecting bitmap pixels to JSON definition entries. `toHexKey(r, g, b)` is the single conversion utility used throughout. `#000000` is the conventional void/non-interactive color.

## Color overlay strategy (v0.0.1)

`setSectorColor` patches only a sector's pixels in a persistent `displayImageData` (separate from `sourceBuffer`), flushes via dirty-rect `putImageData` using the sector's bbox, then sets `texture.needsUpdate = true`. This triggers a full `texImage2D` re-upload — accepted for the current version; the GPU palette approach is documented in the ROADMAP (CA-7).

## Picking pipeline

`pointermove`/`click` → NDC conversion via `getBoundingClientRect()` → `raycaster.intersectObject(mesh)` → UV → pixel (with mandatory Y-inversion: `pixelY = Math.floor((1 - uv.y) * height)`) → `getSectorAt` → `getSector`. Emits `sectorHover` (on change only) or `sectorClick`.

## Resize / responsiveness strategy

`MapRenderer` handles canvas resize inside the rAF render loop — not via `ResizeObserver`. At the top of every frame, `canvas.clientWidth/clientHeight` is compared to the last-known size. If changed, `renderer.setSize()` and the camera frustum are updated immediately before `renderer.render()` in the same callback. This is the canonical webgl2fundamentals.org resizing pattern (https://webgl2fundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html).

**Why not ResizeObserver:** Per the HTML spec rendering order (rAF → layout → ResizeObserver → paint), any ResizeObserver approach that defers work to the next rAF frame is exactly one frame late — the CSS-scaled old buffer gets composited first. Checking size inside rAF avoids all timing ambiguity.

**Proportional frustum scaling:** A `_worldUnitsPerPixel` constant is computed once at construction from the initial "contain" framing. On resize, frustum half-dimensions are set to `(newCSSPx * _worldUnitsPerPixel) / 2`. This keeps the world-to-pixel ratio constant — the map appears the same physical size and the viewport boundary simply grows or shrinks. Do not rerun the "contain" strategy on resize; that changes scale.

## Build configuration

`vite.config.ts` serves dual purpose: library build (`rollupOptions.external: ['three']` is mandatory — omitting it bundles Three.js and silently blows the 15 KB gzipped size target) and Vitest browser-mode testing. See PRD §"Dev Dependencies" for the exact config block.

## Test fixtures

Located at `test/fixtures/`. The `test-4x4.png` (4×4 pixel, 4 sectors) is generated programmatically via `test/fixtures/generate-fixtures.js` using `sharp`. Use absolute paths in browser-mode tests (e.g., `'/test/fixtures/test-4x4.png'`), not relative paths.

## Example app assets

The example app's map bitmap and sector definition are committed static assets. Do not generate or replace them programmatically.
