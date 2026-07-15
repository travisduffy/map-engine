---
paths:
  - 'src/input/**/*.ts'
  - 'src/core/PointerPickResolver.ts'
  - 'src/core/MapEngine.ts'
---

## Picking pipeline

`pointermove`/`click`/`MapEngine.pick(point)` all share `_resolvePixelCoords`: NDC conversion via `getBoundingClientRect()` → `raycaster.intersectObject(mesh)` → UV → pixel (mandatory Y-inversion: `pixelY = Math.floor((1 - uv.y) * height)`). The resulting pixel feeds `IThreeRenderBackend.readSectorIdAt(x, y)` (GPU index-texture readback), which returns a numeric ID resolved to a hex key via `idToHex`. `MapEngine.pick()` is async (`Promise<PickResult | null>`) — the one sanctioned public API signature break from the pre-Worker synchronous model — because GPU readback and Worker IPC cannot be answered synchronously. The hover/click event pipeline wraps the same resolution path and stays synchronous from the consumer's perspective (events fire when ready).

See rendering.md for the GPU index-texture backend (readSectorIdAt) and the project() inverse.
