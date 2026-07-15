---
paths:
  - 'src/render/**/*.ts'
  - 'src/core/MapRenderer.ts'
  - 'src/core/RenderClock.ts'
---

## GPU palette LUT strategy

`setSectorColor`/`resetSectorColor`/`setPalette` write directly into a GPU-resident RGBA8 palette texture via `IThreeRenderBackend.writePaletteEntry`/`updateUniforms` — an O(1) LUT write, not a CPU pixel iteration. The fragment shader (`ThreeRenderBackend`, GLSL3 `RawShaderMaterial`) samples a `usampler2D` index texture and looks up the palette entry with `texelFetch`. A full-map recolor (map-mode swap) only replaces the palette uniform; the index texture is never re-uploaded. There is no `CanvasTexture`/`putImageData` path in the current architecture — color mutation never touches the CPU-side pixel buffer.

## GPU resource lifecycle across context loss

A raw GPU resource (a `WebGLBuffer`, `WebGLTexture`) wrapped by a long-lived Three.js scene object must be re-bound to the new resource object after `webglcontextrestored`, not just re-uploaded to. Context loss destroys every GPU resource; `ThreeRenderBackend.uploadBorderEdges` correctly allocates a brand-new `WebGLBuffer` on the first call after restore, but a `THREE.GLBufferAttribute` built before the loss keeps pointing at the old, now-invalid object unless something explicitly rebuilds it — three.js does not detect or fix this itself. The failure mode is a deep, unrelated-looking crash inside three.js's own program-binding path (`WebGLProgram.getUniforms` → `onFirstUse`), not a clean "stale buffer" error. `BorderRenderer`'s fix — tracking the bound buffer's identity and rebuilding whenever it differs from the backend's current one, in `MapRenderer._receiveBorderEdges` — is the pattern any future GPU-resource-wrapping object needs to repeat.

Separately: `THREE.BufferGeometry`'s opaque-object Z-sort pass calls `geometry.computeBoundingSphere()` unconditionally whenever `geometry.boundingSphere` is `null`, regardless of `object.frustumCulled` — setting `frustumCulled = false` only skips the renderer's separate frustum-cull check, not this one. A `GLBufferAttribute`-backed geometry has no CPU-side array to compute a bounding sphere from. Assign `geometry.boundingSphere` directly to a fixed, generously-sized `THREE.Sphere` up front instead; the exact radius doesn't need to track live vertex data since frustum culling is disabled anyway.

**Testing this:** a real `WEBGL_lose_context.restoreContext()` call may never fire `webglcontextrestored` if nothing is actively pumping `requestAnimationFrame` while waiting for it — the browser's context-restoration processing appears to be tied to the animation-frame pipeline. A passive `addEventListener` + bare `await` on that event can hang indefinitely if the render loop is (correctly) paused during the lost/restoring transition to avoid rendering mid-transition. Poll the lost/restored condition via a loop that itself calls `requestAnimationFrame` each iteration, while keeping the actual render loop's own rAF scheduling paused throughout — these are two independent concerns, and conflating them (assuming "pause the loop" means no rAF calls at all are needed) is the trap.

## World-to-screen projection

`MapRenderer.project(x, y): [number, number]` (backing `MapEngine.project`) is the closed-form algebraic inverse of `_resolvePixelCoords`'s screen→pixel raycast, not a Three.js `Vector3.project()` call: `ndc = (world - camera.position) * zoom / frustumHalf`, then NDC→CSS-px. It's built entirely from fields the class already holds (`_registry.width/height`, `camera.position`, `camera.zoom`, `_frustumHalfW/H`, `_canvas.clientWidth/Height`), so no new Three.js type crosses the public boundary. Prefer this closed-form-inverse pattern over exposing internal camera/renderer objects when a future feature needs a coordinate-space transform.

See picking.md for the forward screen→sector path this transform inverts.

## Resize / responsiveness strategy

`MapRenderer` handles canvas resize inside the rAF render loop — not via `ResizeObserver`. At the top of every frame, `canvas.clientWidth/clientHeight` is compared to the last-known size. If changed, `renderer.setSize()` and the camera frustum are updated immediately before `renderer.render()` in the same callback. This is the canonical webgl2fundamentals.org resizing pattern.

**Why not ResizeObserver:** per the HTML spec rendering order (rAF → layout → ResizeObserver → paint), any ResizeObserver approach that defers work to the next rAF frame is exactly one frame late — the CSS-scaled old buffer gets composited first. Checking size inside rAF avoids all timing ambiguity.

**Proportional frustum scaling:** a `_worldUnitsPerPixel` constant is computed once at construction from the initial "contain" framing. On resize, frustum half-dimensions are set to `(newCSSPx * _worldUnitsPerPixel) / 2`. This keeps the world-to-pixel ratio constant — the map appears the same physical size and the viewport boundary simply grows or shrinks. Do not rerun the "contain" strategy on resize; that changes scale.
