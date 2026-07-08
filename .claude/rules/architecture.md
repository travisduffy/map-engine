---
paths:
  - 'src/**/*.ts'
  - 'example/**/*.ts'
  - 'test/**/*.ts'
---

## Module layout

| Module                | Path                                | Role                                                                                                                                                          |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser`  | `src/SectorBitmapParser.ts`         | Loads PNG URL or Blob → raw RGBA pixel buffer + dimensions. Worker-safe (zero DOM deps).                                                                      |
| `SectorRegistry`      | `src/SectorRegistry.ts`             | Single O(W×H) scan over pixel buffer + JSON definition → SoA spatial data (bboxes, centroids, CSR adjacency/contours, `pixelIndices`). Zero Three.js imports. |
| `InputController`     | `src/input/InputController.ts`      | Owns all pointer/wheel event listeners (pan, zoom, pick dispatch). Main-thread only (DOM consumer).                                                           |
| `IThreeRenderBackend` | `src/render/IThreeRenderBackend.ts` | Interface isolating `MapRenderer` from Three.js internals (palette LUT writes, GPU border VBO upload, resize).                                                |
| `ThreeRenderBackend`  | `src/render/ThreeRenderBackend.ts`  | Real WebGL2 implementation: `RawShaderMaterial` fragment-LUT shader, R32UI index texture, context-loss recovery.                                              |
| `NullRenderBackend`   | `src/render/NullRenderBackend.ts`   | No-op test double for logic tests that don't need a real GPU context.                                                                                         |
| `MapRenderer`         | `src/MapRenderer.ts`                | Three.js scene orchestration: camera, mesh, dirty-flag render gating, resize. Delegates GPU work to the injected backend. Main-thread only.                   |
| `RenderClock`         | `src/RenderClock.ts`                | Main-thread rAF dt dispatch to registered frame callbacks.                                                                                                    |
| `SimulationClock`     | `src/worker/SimulationClock.ts`     | Worker-side fixed-tick accumulator clock, decoupled from render frame rate.                                                                                   |
| `SharedRegistryProxy` | `src/worker/SharedRegistryProxy.ts` | Main-thread proxy correlating `CALL`/`RESULT`/`ERROR` messages with the Worker; serves sync snapshot reads.                                                   |
| Worker entry          | `src/worker/index.ts`               | Dispatches `BOOTSTRAP`/`CALL`/`RESULT`/`ERROR` messages; hosts the registry state store on the Worker side.                                                   |
| `MapEngine`           | `src/MapEngine.ts`                  | Public facade wiring all of the above. Zero-arg constructor; spins up the Worker at construction time.                                                        |

## Key data flow

1. `SectorBitmapParser.parse(source)` → `{ buffer, width, height }` — parsed on Main.
2. `new SectorRegistry(buffer, width, height, definition)` — one O(W×H) scan on Main produces all SoA spatial buffers.
3. `MapEngine.loadMap()` uploads `pixelIndices` as a GPU texture, then transfers all 9 bootstrap buffers to the Worker via a single `BOOTSTRAP` `postMessage` (Transferable, not `SharedArrayBuffer` — see Worker boundary below). The Worker replies `BOOTSTRAP_ACK`.
4. Post-bootstrap, `MapEngine` exposes synchronous reads (`getBBox`/`getCentroid`/`getNeighbors`, hex-string and numeric-ID overloads) served from `SharedRegistryProxy` snapshots, and async Worker round-trips (`pick`, future pathfinding/aggregation/anchor calls) via `CALL`/`RESULT`.

## Sector identity system

Every pixel's RGB value encodes a sector identity. The hex key (`"ff0000"` lowercase, no `#`) is the universal identifier connecting bitmap pixels to JSON definition entries. `toHexKey(r, g, b)` is the single conversion utility used throughout. `#000000` is the conventional void/non-interactive color. Internally, each sector also has a dense numeric ID (`0..sectorCount-1`); `idToHex: string[]` (Main-resident, never transferred) resolves numeric ID → hex key in O(1) for the picking pipeline.

## GPU palette LUT strategy

`setSectorColor`/`resetSectorColor`/`setPalette` write directly into a GPU-resident RGBA8 palette texture via `IThreeRenderBackend.writePaletteEntry`/`updateUniforms` — an O(1) LUT write, not a CPU pixel iteration. The fragment shader (`ThreeRenderBackend`, GLSL3 `RawShaderMaterial`) samples a `usampler2D` index texture and looks up the palette entry with `texelFetch`. A full-map recolor (map-mode swap) only replaces the palette uniform; the index texture is never re-uploaded. There is no `CanvasTexture`/`putImageData` path in the current architecture — color mutation never touches the CPU-side pixel buffer.

## Picking pipeline

`pointermove`/`click`/`MapEngine.pick(point)` all share `_resolvePixelCoords`: NDC conversion via `getBoundingClientRect()` → `raycaster.intersectObject(mesh)` → UV → pixel (mandatory Y-inversion: `pixelY = Math.floor((1 - uv.y) * height)`). The resulting pixel feeds `IThreeRenderBackend.readSectorIdAt(x, y)` (GPU index-texture readback), which returns a numeric ID resolved to a hex key via `idToHex`. `MapEngine.pick()` is async (`Promise<PickResult | null>`) — the one sanctioned public API signature break from the pre-Worker synchronous model — because GPU readback and Worker IPC cannot be answered synchronously. The hover/click event pipeline wraps the same resolution path and stays synchronous from the consumer's perspective (events fire when ready).

## Worker boundary and Transferable discipline

`MapEngine`/`MapRenderer` are Main-thread only (they own `HTMLCanvasElement`/WebGL). `SectorRegistry`/`SectorBitmapParser` stay zero-DOM and zero-Three.js so they remain constructible inside the Worker. Cross-thread data moves via `postMessage` with Transferable `ArrayBuffer`s, never `SharedArrayBuffer` — this keeps the engine deployable on zero-config static hosts with no COOP/COEP headers. After the one-time `BOOTSTRAP` transfer, a Main-resident `pixelIndicesMirror` (`Uint16Array` downcast of `pixelIndices`) is retained solely for `webglcontextrestored` index-texture recovery; reading it for anything else risks staleness against the Worker's live state.

## Resize / responsiveness strategy

`MapRenderer` handles canvas resize inside the rAF render loop — not via `ResizeObserver`. At the top of every frame, `canvas.clientWidth/clientHeight` is compared to the last-known size. If changed, `renderer.setSize()` and the camera frustum are updated immediately before `renderer.render()` in the same callback. This is the canonical webgl2fundamentals.org resizing pattern.

**Why not ResizeObserver:** per the HTML spec rendering order (rAF → layout → ResizeObserver → paint), any ResizeObserver approach that defers work to the next rAF frame is exactly one frame late — the CSS-scaled old buffer gets composited first. Checking size inside rAF avoids all timing ambiguity.

**Proportional frustum scaling:** a `_worldUnitsPerPixel` constant is computed once at construction from the initial "contain" framing. On resize, frustum half-dimensions are set to `(newCSSPx * _worldUnitsPerPixel) / 2`. This keeps the world-to-pixel ratio constant — the map appears the same physical size and the viewport boundary simply grows or shrinks. Do not rerun the "contain" strategy on resize; that changes scale.

## Build configuration

`vite.config.ts` serves dual purpose: library build (`rollupOptions.external: ['three']` is mandatory — omitting it bundles Three.js and silently blows the 15 KB gzipped size budget) and Vitest browser-mode testing. See PRD "Dev Dependencies" for the exact config block.

## Test fixtures

Located at `test/fixtures/`. The `test-4x4.png` (4×4 pixel, 4 sectors) is generated programmatically via `test/fixtures/generate-fixtures.js` using `sharp`. Use absolute paths in browser-mode tests (e.g., `'/test/fixtures/test-4x4.png'`), not relative paths.

## Perf and timing test design

This dev session has no dedicated GPU and runs `*.gl.spec.ts` perf gates alongside other real-GPU tests and, per the CLAUDE.md post-task checklist, concurrently with `npm run build`. Design any perf/timing gate around that contention from the first draft, not as a reaction to an observed failure.

Apply the same environment-aware tolerance already established for render perf (5.0× on a detected software renderer, via `WEBGL_debug_renderer_info`) to every hardware-relative assertion in the gate — a drift or cadence bound is exactly as hardware-relative as a render-time bound. Sample latency across repeated passes and keep the minimum per measurement, since contention only makes a run slower, never faster. Run any extra latency passes after a drift/cadence snapshot, not overlapping it — lengthening a same-thread measurement window can itself starve a co-resident timer.

A same-thread sequence of many fast calls chained via `await` can starve a co-resident `setInterval`-driven clock (e.g. `SimulationClock`) even though each call is individually async: `yieldIfNeeded` only yields past its interval threshold, so a sequence where every call resolves under that threshold runs entirely on microtasks with no macrotask yield in between. Don't pad between calls with `setTimeout(0)` to fix this — browsers clamp zero-delay timeouts to a floor around 4ms, which aliases against a 60Hz tick period and produces a different, still-wrong reading. Sample a real ≥1 second wall-clock window instead (`test/SimulationClock.test.ts` is the precedent), so a transient disruption's catch-up burst dilutes into an acceptable overall mean rather than needing every inter-tick delta to individually pass.

Compare a computed tolerance with `toBeLessThanOrEqual`, not `toBeLessThan` — an exact tie at the boundary is a reachable value, not an edge case to ignore.

Stop once best-of-N sampling and environment-aware tolerance are in place and a few stress-test runs — including one concurrent with `npm run build` — look reasonable. ROADMAP §12.2 already treats a slow or contended box as non-authoritative for a perf gate; chasing zero residual flakiness past that point costs far more than the policy asks for.

## Example app assets

The example app's map bitmap and sector definition are committed static assets. Do not generate or replace them programmatically.
