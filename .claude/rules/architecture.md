---
paths:
  - 'src/**/*.ts'
  - 'example/**/*.ts'
  - 'test/**/*.ts'
---

## Rule ownership

Folder/module-layout and placement conventions live in this file. In-file conventions (naming, booleans, private members, types, imports, member order, comments) live in `code-style.md`. When adding a rule, pick its home by this split: layout-of-the-tree here, inside-one-file there. See .claude/rules/code-style.md for in-file conventions.

## Folder placement

Place every module in a subsystem directory; keep `src/` root for `index.ts` only. The subsystems are `core/` (MapEngine, MapRenderer, RenderClock), `sector/` (SectorRegistry, SectorBitmapParser), `shared/` (types, errors, utils, color), `render/`, `worker/`, `input/`. A new module goes in the subsystem that owns its concern; a leaf data or util type goes in `shared/`.

The Module-layout table below is reconciled to the final tree during the structural pass — until then its `Path` column shows pre-move locations.

## Module layout

| Module                 | Path                                 | Role                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser`   | `src/sector/SectorBitmapParser.ts`   | Loads PNG URL or Blob → raw RGBA pixel buffer + dimensions. Worker-safe (zero DOM deps).                                                                                                                                                                                                                             |
| `SectorRegistry`       | `src/sector/SectorRegistry.ts`       | Single O(W×H) scan over pixel buffer + JSON definition → SoA spatial data (bboxes, centroids, CSR adjacency/contours, `pixelIndices`). Zero Three.js imports.                                                                                                                                                        |
| `InputController`      | `src/input/InputController.ts`       | Owns all pointer/wheel event listeners (pan, zoom, pick dispatch). Main-thread only (DOM consumer).                                                                                                                                                                                                                  |
| `IThreeRenderBackend`  | `src/render/IThreeRenderBackend.ts`  | Interface isolating `MapRenderer` from Three.js internals (palette LUT writes, GPU border VBO upload, resize).                                                                                                                                                                                                       |
| `ThreeRenderBackend`   | `src/render/ThreeRenderBackend.ts`   | Real WebGL2 implementation: `RawShaderMaterial` fragment-LUT shader, R32UI index texture, context-loss recovery.                                                                                                                                                                                                     |
| `NullRenderBackend`    | `src/render/NullRenderBackend.ts`    | No-op test double for logic tests that don't need a real GPU context.                                                                                                                                                                                                                                                |
| `MapRenderer`          | `src/core/MapRenderer.ts`            | Three.js scene orchestration: camera, mesh, dirty-flag render gating, resize. Delegates GPU work to the injected backend. Main-thread only.                                                                                                                                                                          |
| `RenderClock`          | `src/core/RenderClock.ts`            | Main-thread rAF dt dispatch to registered frame callbacks.                                                                                                                                                                                                                                                           |
| `SimulationClock`      | `src/worker/SimulationClock.ts`      | Worker-side fixed-tick accumulator clock, decoupled from render frame rate.                                                                                                                                                                                                                                          |
| `SharedRegistryProxy`  | `src/worker/SharedRegistryProxy.ts`  | Main-thread proxy correlating `CALL`/`RESULT`/`ERROR` messages with the Worker; serves sync snapshot reads.                                                                                                                                                                                                          |
| Worker entry           | `src/worker/index.ts`                | Dispatches `BOOTSTRAP`/`CALL`/`RESULT`/`ERROR` messages; hosts the registry state store on the Worker side.                                                                                                                                                                                                          |
| `SpatialGraph`         | `src/worker/SpatialGraph.ts`         | Worker-side A\* over a typed-array binary heap; backs `setTraversalCosts`/`findPath`. Zero DOM/Three.js imports.                                                                                                                                                                                                     |
| `pathfinding-handlers` | `src/worker/pathfinding-handlers.ts` | Registers the `setTraversalCosts`/`findPath` Worker `CALL` handlers behind a shared FIFO promise chain (serializes rebuilds against in-flight searches).                                                                                                                                                             |
| `aggregation-handlers` | `src/worker/aggregation-handlers.ts` | Registers `setParentMapping`/`aggregateGroups` Worker `CALL` handlers; owns the Worker-side group-bbox buffer free list.                                                                                                                                                                                             |
| `polylabel`            | `src/worker/polylabel.ts`            | Pole-of-inaccessibility solver (quadtree cell subdivision + `signedDistanceToSegments`) over unordered contour/crack segments; backs `computeAnchors`.                                                                                                                                                               |
| `anchor-handlers`      | `src/worker/anchor-handlers.ts`      | Registers the `computeAnchors` Worker `CALL` handler; synthesizes map-edge cracks (B1.e emits interior cracks only) and owns the Worker-side anchor pool.                                                                                                                                                            |
| `border-handlers`      | `src/worker/border-handlers.ts`      | Registers the `recomputeBorders` Worker `CALL` handler: walks each sector's contour bucket, resolves the far-side sector by resampling `pixelIndices`, dedups by lower-sector-id, applies the sentinel-as-void rule, and owns the Worker-side border-edge buffer free list.                                          |
| `BorderRenderer`       | `src/render/BorderRenderer.ts`       | GPU-VBO-backed `THREE.LineSegments` for group perimeters: a `GLBufferAttribute` bound to the backend's managed `WebGLBuffer`, `frustumCulled = false` with a fixed `boundingSphere`, pixel→world transform mirroring `MapRenderer.project`'s inverse.                                                                |
| `transferable-pool`    | `src/worker/transferable-pool.ts`    | Main-side ring pools for push-based Worker→Main handoffs: `TransferableGroupPool` (group bboxes), `TransferableAnchorPool` (anchors), `TransferableBorderPool` (border edges) — separate concrete classes, not a shared generic, so each narrows `WorkerMessage` on its own literal message-type set without a cast. |
| `MapEngine`            | `src/core/MapEngine.ts`              | Public facade wiring all of the above. Zero-arg constructor; spins up the Worker at construction time. Owns lifecycle, worker/proxy/pool orchestration, and map-mode state; delegates picking, event dispatch, and border-recompute coalescing to the three collaborators below.                                     |
| `PointerPickResolver`  | `src/core/PointerPickResolver.ts`    | Resolves a pointer event to a sector (NDC → raycast → UV → pixel → hex) for the hover/click pipeline and `MapEngine.pick()`; emits `sectorHover`/`sectorClick` via an injected callback. Constructed per loaded map with the live renderer/registry/canvas.                                                          |
| `EventEmitter`         | `src/core/EventEmitter.ts`           | Minimal name-keyed pub-sub backing `MapEngine.on`/`off`; a pure dispatch primitive with no engine/DOM coupling.                                                                                                                                                                                                      |
| `BorderCoalescer`      | `src/core/BorderCoalescer.ts`        | Coalesces concurrent `recomputeBorders()` requests (≤ 2 Worker computations regardless of caller count) behind a dispatch thunk + session-validity predicate, preserving shared-Promise identity for coalesced callers.                                                                                              |

## Key data flow

1. `SectorBitmapParser.parse(source)` → `{ buffer, width, height }` — parsed on Main.
2. `new SectorRegistry(buffer, width, height, definition)` — one O(W×H) scan on Main produces all SoA spatial buffers.
3. `MapEngine.loadMap()` uploads `pixelIndices` as a GPU texture, then transfers all 9 bootstrap buffers to the Worker via a single `BOOTSTRAP` `postMessage` (Transferable, not `SharedArrayBuffer` — see Worker boundary below). The Worker replies `BOOTSTRAP_ACK`.
4. Post-bootstrap, `MapEngine` exposes synchronous reads (`getBBox`/`getCentroid`/`getNeighbors`, hex-string and numeric-ID overloads) served from `SharedRegistryProxy` snapshots, and async Worker round-trips (`pick`, `setTraversalCosts`/`findPath`, `setParentMapping`/`aggregateGroups`, `computeAnchors`, `recomputeBorders`) via `CALL`/`RESULT`.
5. `aggregateGroups()`/`computeAnchors()`/`recomputeBorders()` each push a result buffer to Main (`groupBBoxes`/`anchors`/`borderEdges`) via their ring pool (`transferable-pool.ts`) before the handler's `RESULT` message resolves the call's Promise — this ordering guarantee is what makes `getGroupBBox`/`getAnchor`/`getBorderSegments` valid to read synchronously the instant the `await` resolves. Any future push-based hot-path feature reusing this pattern must preserve it: post the handoff message first, resolve the handler second.

## Sector identity system

Every pixel's RGB value encodes a sector identity. The hex key (`"ff0000"` lowercase, no `#`) is the universal identifier connecting bitmap pixels to JSON definition entries. `toHexKey(r, g, b)` is the single conversion utility used throughout. `#000000` is the conventional void/non-interactive color. Internally, each sector also has a dense numeric ID (`0..sectorCount-1`); `idToHex: string[]` (Main-resident, never transferred) resolves numeric ID → hex key in O(1) for the picking pipeline.

## GPU palette LUT strategy

`setSectorColor`/`resetSectorColor`/`setPalette` write directly into a GPU-resident RGBA8 palette texture via `IThreeRenderBackend.writePaletteEntry`/`updateUniforms` — an O(1) LUT write, not a CPU pixel iteration. The fragment shader (`ThreeRenderBackend`, GLSL3 `RawShaderMaterial`) samples a `usampler2D` index texture and looks up the palette entry with `texelFetch`. A full-map recolor (map-mode swap) only replaces the palette uniform; the index texture is never re-uploaded. There is no `CanvasTexture`/`putImageData` path in the current architecture — color mutation never touches the CPU-side pixel buffer.

## GPU resource lifecycle across context loss

A raw GPU resource (a `WebGLBuffer`, `WebGLTexture`) wrapped by a long-lived Three.js scene object must be re-bound to the new resource object after `webglcontextrestored`, not just re-uploaded to. Context loss destroys every GPU resource; `ThreeRenderBackend.uploadBorderEdges` correctly allocates a brand-new `WebGLBuffer` on the first call after restore, but a `THREE.GLBufferAttribute` built before the loss keeps pointing at the old, now-invalid object unless something explicitly rebuilds it — three.js does not detect or fix this itself. The failure mode is a deep, unrelated-looking crash inside three.js's own program-binding path (`WebGLProgram.getUniforms` → `onFirstUse`), not a clean "stale buffer" error. `BorderRenderer`'s fix — tracking the bound buffer's identity and rebuilding whenever it differs from the backend's current one, in `MapRenderer._receiveBorderEdges` — is the pattern any future GPU-resource-wrapping object needs to repeat.

Separately: `THREE.BufferGeometry`'s opaque-object Z-sort pass calls `geometry.computeBoundingSphere()` unconditionally whenever `geometry.boundingSphere` is `null`, regardless of `object.frustumCulled` — setting `frustumCulled = false` only skips the renderer's separate frustum-cull check, not this one. A `GLBufferAttribute`-backed geometry has no CPU-side array to compute a bounding sphere from. Assign `geometry.boundingSphere` directly to a fixed, generously-sized `THREE.Sphere` up front instead; the exact radius doesn't need to track live vertex data since frustum culling is disabled anyway.

**Testing this:** a real `WEBGL_lose_context.restoreContext()` call may never fire `webglcontextrestored` if nothing is actively pumping `requestAnimationFrame` while waiting for it — the browser's context-restoration processing appears to be tied to the animation-frame pipeline. A passive `addEventListener` + bare `await` on that event can hang indefinitely if the render loop is (correctly) paused during the lost/restoring transition to avoid rendering mid-transition. Poll the lost/restored condition via a loop that itself calls `requestAnimationFrame` each iteration, while keeping the actual render loop's own rAF scheduling paused throughout — these are two independent concerns, and conflating them (assuming "pause the loop" means no rAF calls at all are needed) is the trap.

## Picking pipeline

`pointermove`/`click`/`MapEngine.pick(point)` all share `_resolvePixelCoords`: NDC conversion via `getBoundingClientRect()` → `raycaster.intersectObject(mesh)` → UV → pixel (mandatory Y-inversion: `pixelY = Math.floor((1 - uv.y) * height)`). The resulting pixel feeds `IThreeRenderBackend.readSectorIdAt(x, y)` (GPU index-texture readback), which returns a numeric ID resolved to a hex key via `idToHex`. `MapEngine.pick()` is async (`Promise<PickResult | null>`) — the one sanctioned public API signature break from the pre-Worker synchronous model — because GPU readback and Worker IPC cannot be answered synchronously. The hover/click event pipeline wraps the same resolution path and stays synchronous from the consumer's perspective (events fire when ready).

## World-to-screen projection

`MapRenderer.project(x, y): [number, number]` (backing `MapEngine.project`) is the closed-form algebraic inverse of `_resolvePixelCoords`'s screen→pixel raycast, not a Three.js `Vector3.project()` call: `ndc = (world - camera.position) * zoom / frustumHalf`, then NDC→CSS-px. It's built entirely from fields the class already holds (`_registry.width/height`, `camera.position`, `camera.zoom`, `_frustumHalfW/H`, `_canvas.clientWidth/Height`), so no new Three.js type crosses the public boundary. Prefer this closed-form-inverse pattern over exposing internal camera/renderer objects when a future feature needs a coordinate-space transform.

## Worker boundary and Transferable discipline

`MapEngine`/`MapRenderer` are Main-thread only (they own `HTMLCanvasElement`/WebGL). `SectorRegistry`/`SectorBitmapParser` stay zero-DOM and zero-Three.js so they remain constructible inside the Worker. Cross-thread data moves via `postMessage` with Transferable `ArrayBuffer`s, never `SharedArrayBuffer` — this keeps the engine deployable on zero-config static hosts with no COOP/COEP headers. After the one-time `BOOTSTRAP` transfer, a Main-resident `pixelIndicesMirror` (`Uint16Array` downcast of `pixelIndices`) is retained solely for `webglcontextrestored` index-texture recovery; reading it for anything else risks staleness against the Worker's live state.

## Resize / responsiveness strategy

`MapRenderer` handles canvas resize inside the rAF render loop — not via `ResizeObserver`. At the top of every frame, `canvas.clientWidth/clientHeight` is compared to the last-known size. If changed, `renderer.setSize()` and the camera frustum are updated immediately before `renderer.render()` in the same callback. This is the canonical webgl2fundamentals.org resizing pattern.

**Why not ResizeObserver:** per the HTML spec rendering order (rAF → layout → ResizeObserver → paint), any ResizeObserver approach that defers work to the next rAF frame is exactly one frame late — the CSS-scaled old buffer gets composited first. Checking size inside rAF avoids all timing ambiguity.

**Proportional frustum scaling:** a `_worldUnitsPerPixel` constant is computed once at construction from the initial "contain" framing. On resize, frustum half-dimensions are set to `(newCSSPx * _worldUnitsPerPixel) / 2`. This keeps the world-to-pixel ratio constant — the map appears the same physical size and the viewport boundary simply grows or shrinks. Do not rerun the "contain" strategy on resize; that changes scale.

## Build configuration

`vite.config.ts` serves dual purpose: library build (`rollupOptions.external: ['three']` is mandatory — omitting it bundles Three.js and silently blows the 15 KB gzipped size budget) and Vitest browser-mode testing. See CLAUDE.md "Dev dependencies" for the pinned versions.

## Test fixtures

Located at `test/fixtures/`. The `test-4x4.png` (4×4 pixel, 4 sectors) is generated programmatically via `test/fixtures/generate-fixtures.js` using `sharp`. Use absolute paths in browser-mode tests (e.g., `'/test/fixtures/test-4x4.png'`), not relative paths.

## Perf and timing test design

This dev session has no dedicated GPU and runs `*.gl.spec.ts` perf gates alongside other real-GPU tests and, per the CLAUDE.md post-task checklist, concurrently with `npm run build`. Design any perf/timing gate around that contention from the first draft, not as a reaction to an observed failure.

Apply the same environment-aware tolerance already established for render perf (5.0× on a detected software renderer, via `WEBGL_debug_renderer_info`) to every hardware-relative assertion in the gate — a drift or cadence bound is exactly as hardware-relative as a render-time bound. Sample latency across repeated passes and keep the minimum per measurement, since contention only makes a run slower, never faster. Run any extra latency passes after a drift/cadence snapshot, not overlapping it — lengthening a same-thread measurement window can itself starve a co-resident timer.

A same-thread sequence of many fast calls chained via `await` can starve a co-resident `setInterval`-driven clock (e.g. `SimulationClock`) even though each call is individually async: `yieldIfNeeded` only yields past its interval threshold, so a sequence where every call resolves under that threshold runs entirely on microtasks with no macrotask yield in between. Don't pad between calls with `setTimeout(0)` to fix this — browsers clamp zero-delay timeouts to a floor around 4ms, which aliases against a 60Hz tick period and produces a different, still-wrong reading. Sample a real ≥1 second wall-clock window instead (`test/SimulationClock.test.ts` is the precedent), so a transient disruption's catch-up burst dilutes into an acceptable overall mean rather than needing every inter-tick delta to individually pass.

Compare a computed tolerance with `toBeLessThanOrEqual`, not `toBeLessThan` — an exact tie at the boundary is a reachable value, not an edge case to ignore.

Stop once best-of-N sampling and environment-aware tolerance are in place and a few stress-test runs — including one concurrent with `npm run build` — look reasonable. A slow or contended box is non-authoritative for a perf gate; chasing zero residual flakiness past that point costs far more than it is worth.

## Example app assets

The example app's map bitmap and sector definition are committed static assets. Do not generate or replace them programmatically.
