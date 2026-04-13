# Epic 2: WebGL Rendering and Camera Architecture

**Objective:** Translate the spatial data layer into a visual WebGL environment using Three.js, establishing orthographic camera framing, pointer-driven navigation, and programmatic color mutations.
**Scope:** Incorporates PRD Phase 4.

**Verifiable & Measurable Success Criteria:**

- **Scene Provisioning:** `MapRenderer` constructs an `OffscreenCanvas` populated by a mandated `.slice()` copy of the source buffer. The environment yields a `THREE.PlaneGeometry` mapped by a `THREE.CanvasTexture` utilizing strictly `THREE.NearestFilter` with mipmaps explicitly disabled for color-picking accuracy.
- **Color Mutation Subsystem:** Executing `setSectorColor(hexKey, color)` securely loops over `registry.pixelIndices` to mutate the active `displayImageData` state. It executes a localized dirty-rect `putImageData` flush to update the texture. `registry.sourceBuffer` must not mutate during this cycle.
- **Camera Navigation:** Scroll events adjust `camera.zoom` strictly clamped between 0.5x and 20.0x. Pointer drag events reliably manipulate `camera.position.x` and `camera.position.y` with mathematical inversion applied (e.g., downward screen delta forces an upward world-space camera shift).
- **Viewport Boundaries:** Initial framing calculates a "contain" bounds strategy against the parent CSS canvas context. Continuous pan events are hard-clamped via `clampPan()` to block rendering outside a 10% geometric margin surrounding the physical bitmap.

---

## Tasks

### Task 2.1 — Three.js Scene, Renderer, Camera, Geometry, and Render Loop

**PRD Reference:** Phase 4 scope (§ "Phase 4: MapRenderer"); §"Canvas Sizing Contract"; §5 "Pan and Zoom Camera" (initial framing formula); §"Key Architectural Decisions" #9 (continuous rAF loop)

Stand up the Three.js renderer, scene graph, orthographic camera, plane mesh, and the continuous render loop. The camera must be created here because the render loop calls `renderer.render(scene, camera)` and cannot start without it. No display canvas or texture yet — those follow in Task 2.2.

**Work:**

- Implement the `MapRenderer` constructor signature: `(canvas: HTMLCanvasElement, registry: SectorRegistry)`
- Store `registry` and `canvas` as instance fields — both are needed by color mutation methods (Tasks 2.3/2.4) and camera navigation (Tasks 2.5/2.6)
- Apply canvas sizing contract at the top of the constructor: if `canvas.clientWidth === 0 || canvas.clientHeight === 0`, throw `new Error('MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM and has non-zero CSS dimensions before calling loadMap()')` (PRD §"Canvas Sizing Contract")
- Create `THREE.WebGLRenderer({ canvas, antialias: false })`; call `renderer.setPixelRatio(window.devicePixelRatio)`; call `renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)` — the third argument `false` prevents `setSize` from overriding the consumer's CSS `style.width`/`style.height`; do **not** manually assign `canvas.width` or `canvas.height` before calling `setSize` (dead code — `setSize` overwrites it immediately) (PRD §"Canvas Sizing Contract")
- Create `THREE.Scene`
- Create `THREE.PlaneGeometry(registry.width, registry.height)` — 1 world unit = 1 pixel; centered at origin; do **not** translate the mesh (PRD Phase 4 §"Coordinate system note")
- Create `THREE.MeshBasicMaterial({ map: null, side: THREE.DoubleSide })` — `map` is `null` at this point because the `CanvasTexture` does not exist until Task 2.2; Task 2.2 must assign `material.map = texture` after the texture is created; store the `material` reference on the instance so Task 2.2 can reach it
- Create `THREE.Mesh(geometry, material)`; store `mesh` on the instance (needed by the picking raycaster in Epic 3); add to scene
- Create `THREE.OrthographicCamera` using the "contain" framing strategy (PRD §5 "Concrete frustum formula") — the camera must be created here because the render loop cannot start without it:
  - If `canvasAspect >= bitmapAspect`: `frustumHalfH = registry.height / 2`; `frustumHalfW = frustumHalfH * canvasAspect`
  - Else: `frustumHalfW = registry.width / 2`; `frustumHalfH = frustumHalfW / canvasAspect`
  - `new THREE.OrthographicCamera(-frustumHalfW, frustumHalfW, frustumHalfH, -frustumHalfH, -1000, 1000)`; `camera.position.set(0, 0, 1)`; `camera.zoom = 1.0`; `camera.updateProjectionMatrix()`
  - Store `frustumHalfW` and `frustumHalfH` as instance fields — needed by pan scale conversion in Task 2.5
- Start `requestAnimationFrame` loop calling `renderer.render(scene, camera)` each frame; store the return value as `_animFrameId: number` on the instance — `destroy()` cancels it via `cancelAnimationFrame(this._animFrameId)` (PRD §"Key Architectural Decisions" #9 — continuous loop is the explicit v0.0.1 decision; render-on-demand deferred to v0.1.0)
- Expose `scene`, `camera`, `mesh`, and `renderer` (the `THREE.WebGLRenderer`) as readonly instance fields for test access and the `MapEngine` exposed internals (PRD §7 "Exposed internals")

**Done when:** After construction with an 800×600 canvas, `canvas.width > 0` and `canvas.height > 0`; `threeRenderer.info.render.frame >= 1` after one rAF tick; `renderer.scene instanceof THREE.Scene === true`; `renderer.camera instanceof THREE.OrthographicCamera === true`; PlaneGeometry UV attribute at vertex index 0 has `u ≈ 0.0, v ≈ 1.0` confirming Three.js bottom-left UV origin convention (validates the Y-inversion assumption the picking formula depends on — PRD Phase 4 acceptance criteria); construction with a zero-dimensions canvas throws the specified error message.

---

### Task 2.2 — Display Canvas, `displayImageData`, `CanvasTexture`, and Color Parser Setup

**PRD Reference:** Phase 4 scope items for display canvas and texture (§ "Phase 4: MapRenderer"); Core Functionality §3 "Sector Color Overlay" (display canvas strategy); §"Key Architectural Decisions" #10 (`.slice()` mandatory)

Initialize the `OffscreenCanvas` display buffer, the persistent `displayImageData` object (with mandatory source buffer copy), the `CanvasTexture` wired to the display canvas, and the 1×1 CSS color parser helper. These are the data-flow foundations that `setSectorColor` and `resetSectorColor` depend on.

**Work:**

- Create `OffscreenCanvas` sized to `registry.width × registry.height`; obtain its 2D context and store as readonly `displayCtx: OffscreenCanvasRenderingContext2D` on the instance (PRD Phase 4 — "exposed as readonly instance field for test access")
- Initialize `displayImageData = new ImageData(registry.sourceBuffer.slice(), registry.width, registry.height)` — the `.slice()` call is **mandatory**: it creates a separate copy of the source buffer so that `setSectorColor` mutating `displayImageData.data` cannot corrupt `registry.sourceBuffer`, which `resetSectorColor` reads from and which the picking pipeline reads from (PRD §"Key Architectural Decisions" #10 — "load-bearing copy, not a defensive measure"); flush immediately with `displayCtx.putImageData(displayImageData, 0, 0)`; **retain `displayImageData` on the instance** — never recreate it on each color change, always mutate in place (PRD §3 "Do not replace `displayImageData` with a new object on each call")
- Create and retain `_colorParserCanvas = new OffscreenCanvas(1, 1)` and `_colorParserCtx` on the instance — used by `setSectorColor` for CSS color string → `[r, g, b]` conversion; created once in the constructor and reused on every call (PRD §3 "Implementation note — color parsing")
- Create `THREE.CanvasTexture` from the display `OffscreenCanvas`; set `minFilter = THREE.NearestFilter`, `magFilter = THREE.NearestFilter`, `texture.generateMipmaps = false` — both disabled for two independent reasons: (1) picking correctness — interpolation at sector borders creates phantom RGB values that resolve to garbage hex keys silently; (2) rendering correctness — interpolated colors at borders produce phantom visual colors misrepresenting the spatial data (PRD Phase 4 §"Create THREE.CanvasTexture" — "two independent reasons stated; must not be changed"); retain texture reference on instance for `destroy()`
- Assign the texture into the material created in Task 2.1: `material.map = texture` — this completes the render pipeline; the material was created with `map: null` in Task 2.1 because the texture did not yet exist

**Done when:** `renderer.displayCtx` is a non-null `OffscreenCanvasRenderingContext2D`; `displayImageData` is backed by a separate buffer from `registry.sourceBuffer` (mutating one does not affect the other); after construction, pixels rendered to the canvas reflect the source bitmap colors (texture is live).

---

### Task 2.3 — `setSectorColor`: CSS Color Parsing and Pixel Write

**PRD Reference:** Core Functionality §3 "Sector Color Overlay" (full implementation spec); §"Key Architectural Decisions" #5 (O(sector-size) pixel index map); Phase 4 acceptance criteria for `setSectorColor`

Implement `setSectorColor` — the forward path of the color mutation subsystem. Reads CSS color → resolves RGB bytes → iterates `pixelIndices` → writes to `displayImageData` → dirty-rect flush → marks texture dirty.

**Work:**

- Implement `setSectorColor(hexKey: string, color: string) => void` on `MapRenderer`:
  - Check `registry.pixelIndices.has(hexKey)` — if missing (sector absent from map, or sector exists but has zero bitmap pixels and was excluded from `pixelIndices`), emit `console.warn('[MapEngine] setSectorColor: sector has no pixel data')` and return no-op; always check `pixelIndices`, not the sector map (PRD §3 "Edge Cases" — "Check `pixelIndices`, not the sector map, to determine actionability")
  - Parse CSS color using `_colorParserCtx`: `_colorParserCtx.clearRect(0,0,1,1)`; `_colorParserCtx.fillStyle = color`; `_colorParserCtx.fillRect(0,0,1,1)`; read `_colorParserCtx.getImageData(0,0,1,1).data` → extract `[r, g, b]`; if `color` is invalid the browser silently uses the previous `fillStyle` — documented undefined-behavior, not an error to handle (PRD §3 "Implementation note — color parsing")
  - Retrieve `registry.pixelIndices.get(hexKey)`; for each flat index `i`, write `r, g, b, 255` into `displayImageData.data` at byte offset `i * 4` — mutate in place; never call `putImageData` per pixel (catastrophically slow) (PRD §3 "Implementation note — pixel writing")
  - After iterating all indices, flush with the dirty-rect overload of `putImageData` scoped to the sector's bounding box: `displayCtx.putImageData(displayImageData, 0, 0, bbox.minX, bbox.minY, bbox.maxX - bbox.minX + 1, bbox.maxY - bbox.minY + 1)` — reduces Canvas 2D write cost only; does not reduce WebGL upload cost (PRD §3 "Display canvas update strategy")
  - Set `texture.needsUpdate = true` — instructs Three.js to call `texImage2D` (full VRAM re-upload, not `texSubImage2D`) on the next render frame; accepted for v0.0.1; must not be changed (PRD §3 "`texture.needsUpdate = true` — WebGL upload cost")

**Done when:** After `setSectorColor('ff0000', '#0000ff')`: `displayCtx.getImageData(0,0,4,4)` at pixel (0,0) offset 0 returns `[0,0,255,255]`; at pixel (1,1) offset 20 returns `[0,0,255,255]`; at pixel (2,0) offset 8 returns `[0,255,0,255]` (green sector unchanged); `registry.sourceBuffer` bytes at pixel (0,0) are still `[255,0,0,255]` — source buffer not mutated.

---

### Task 2.4 — `resetSectorColor`, Edge Cases, and Color Mutation Tests

**PRD Reference:** Core Functionality §3 "Edge Cases — `resetSectorColor`"; Phase 4 acceptance criteria for `resetSectorColor` and `setSectorColor` edge cases; §"Key Architectural Decisions" #10 (source buffer immutability)

Implement `resetSectorColor` (the reverse path of the mutation subsystem), cover all edge cases for both color methods, and write the full test suite for the color mutation layer.

**Work:**

- Implement `resetSectorColor(hexKey: string) => void` on `MapRenderer`:
  - Same `pixelIndices` guard as `setSectorColor` — no-op + `console.warn` if key absent or has zero pixels (PRD §3 "Edge Cases — `resetSectorColor`")
  - For each flat index `i` in `registry.pixelIndices.get(hexKey)`: copy `registry.sourceBuffer[i*4]`, `[i*4+1]`, `[i*4+2]` into `displayImageData.data` at the same offsets; **always write alpha as `255`** regardless of the source buffer's alpha value — the display canvas must remain fully opaque (PRD §3 "Edge Cases — `resetSectorColor`" — "alpha is always written as 255 regardless of the value in `sourceBuffer`; display canvas must always be fully opaque")
  - Flush with the same dirty-rect `putImageData` overload scoped to `registry.bboxes.get(hexKey)`; set `texture.needsUpdate = true`
- Edge cases to cover in tests:
  - `setSectorColor` with a hex key not found in `pixelIndices`: emits `console.warn` and does not throw
  - `setSectorColor` for a sector that exists in the sector map but has zero bitmap pixels (excluded from `pixelIndices`): same no-op + `console.warn` behavior
  - `resetSectorColor` with a hex key not found in `pixelIndices`: same no-op + `console.warn`
  - Invalid CSS color string: does not throw; browser silently uses previous `fillStyle`
- Write browser-mode tests using the test canvas setup preamble (PRD §"Test Canvas Setup" — create canvas, `style.width = '800px'`, `style.height = '600px'`, append to `document.body`, remove in teardown):
  - `setSectorColor` pixel write and source buffer immutability
  - `resetSectorColor` restores original RGB at pixel (0,0)
  - All no-op + warn edge cases

**Done when:** After `resetSectorColor('ff0000')`: `displayCtx.getImageData()` at pixel (0,0) returns `[255,0,0,255]`; `registry.sourceBuffer` unchanged throughout; all `console.warn` edge cases emit without throwing.

---

### Task 2.5 — Orthographic Camera Framing and Pointer-Drag Pan

**PRD Reference:** Core Functionality §5 "Pan and Zoom Camera" (initial framing, pan implementation, `clampPan()`); Phase 4 acceptance criteria for pan direction and clamp; §"Key Architectural Decisions" #7 (hardcoded bounds)

Wire pointer-drag pan against the orthographic camera created in Task 2.1, with world-space coordinate conversion and `clampPan()` enforcement. The camera and `frustumHalfW`/`frustumHalfH` instance fields already exist from Task 2.1 — this task adds the pan interaction layer on top.

**Work:**

- Initialize pan internal state as instance fields: `_isDragging: boolean = false`, `_lastPointerPos: { x: number; y: number } = { x: 0, y: 0 }` (PRD §5 "Pan implementation")
- Register `pointerdown` listener on canvas: set `_isDragging = true`; record `_lastPointerPos = { x: event.clientX, y: event.clientY }`
- Register `pointermove` listener on canvas: if `_isDragging`, compute `deltaScreenX = event.clientX - _lastPointerPos.x` and `deltaScreenY = event.clientY - _lastPointerPos.y`; update `_lastPointerPos`; apply to camera position:
  ```typescript
  const scaleX = (frustumHalfW * 2) / canvas.clientWidth
  const scaleY = (frustumHalfH * 2) / canvas.clientHeight
  camera.position.x -= (deltaScreenX * scaleX) / camera.zoom
  camera.position.y += (deltaScreenY * scaleY) / camera.zoom
  ```
  Sign inversion on Y is correct: downward screen drag (positive `deltaScreenY`) → `camera.position.y` increases (camera moves up in world space → map follows cursor downward) (PRD §5 "Pan implementation" — this was an Iteration 7 BLOCKER fix)
- Register `pointerup` listener: set `_isDragging = false`
- Implement `clampPan()`: clamp `camera.position.x` to `[-(registry.width/2 + registry.width*0.1), +(registry.width/2 + registry.width*0.1)]`; same for Y with `registry.height` (PRD §5 "Bounds — Pan — bitmap + 10% margin"); call after every pan position update

**Done when:** Rightward drag (pointerdown at x=100 → pointermove to x=150) decreases `camera.position.x`; downward drag (pointerdown at y=100 → pointermove to y=150) increases `camera.position.y`; programmatically setting `camera.position.x = registry.width * 2` then dispatching a wheel event (triggers `clampPan()`) clamps position to `<= registry.width / 2 + registry.width * 0.1`.

---

### Task 2.6 — Scroll-Wheel Zoom, `destroy()` Teardown, and Full Camera/Navigation Tests

**PRD Reference:** Core Functionality §5 "Pan and Zoom Camera" (zoom implementation); Phase 4 acceptance criteria for zoom clamp and `destroy()`; PRD §7 "`destroy()` cleanup contract" (texture disposal); Phase 4 acceptance criteria for `destroy()` idempotency

Implement scroll-wheel zoom with zoom-factor math and clamping, implement `destroy()` with full resource disposal, and write the complete test suite for all camera navigation and teardown behavior.

**Work:**

- Register `wheel` listener on canvas with `{ passive: false }` so `preventDefault()` can be called (PRD §5 "Zoom implementation"):
  ```typescript
  canvas.addEventListener(
    'wheel',
    event => {
      event.preventDefault()
      const zoomFactor = Math.pow(1.1, -event.deltaY / 100)
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * zoomFactor, 0.5, 20.0)
      camera.updateProjectionMatrix()
      clampPan()
    },
    { passive: false }
  )
  ```
  A standard mouse wheel notch (`deltaY ≈ 100`) zooms by ~10%; touchpad scrolls produce smaller `deltaY` and zoom proportionally less; `clampPan()` is called after zoom because changing `camera.zoom` changes the effective world view, which may violate pan bounds
- Implement `destroy()` on `MapRenderer` (PRD §7 "`destroy()` cleanup contract"):
  - `cancelAnimationFrame(this._animFrameId)` — stops the render loop
  - `this._renderer.dispose()` — releases the WebGL context
  - `geometry.dispose()`, `material.dispose()`, `texture.dispose()` — texture disposal is explicitly required (PRD §7 — "disposes geometry, material, **and texture** (`texture.dispose()`)"; added in Iteration 6)
  - Remove all event listeners owned by `MapRenderer` from the canvas: `pointerdown`, `pointermove`, `pointerup`, `wheel` — use the same handler references registered in Tasks 2.5 and 2.6 so `removeEventListener` matches correctly
- Write browser-mode tests using the test canvas setup preamble (PRD §"Test Canvas Setup"):
  - `camera instanceof THREE.OrthographicCamera === true` after construction
  - Pan direction: rightward drag decreases `camera.position.x`; downward drag increases `camera.position.y`
  - Zoom-in: `wheel` with `deltaY: -100` increases `camera.zoom`
  - Zoom-out: `wheel` with `deltaY: +100` decreases `camera.zoom`
  - Zoom max clamp: force to `20×`, further zoom-in wheel event → `camera.zoom` unchanged
  - Zoom min clamp: force to `0.5×`, zoom-out wheel event → `camera.zoom` unchanged
  - Pan clamp: set `camera.position.x = registry.width * 2`, dispatch wheel → position clamped to `<= registry.width / 2 + registry.width * 0.1`
  - `destroy()` does not throw; second `destroy()` call does not throw (idempotent)

**Done when:** All Phase 4 zoom and destroy acceptance criteria pass; scroll-up increases `camera.zoom`; scroll-down decreases it; both clamp edges hold; `destroy()` is idempotent; no listener leaks after destroy.
