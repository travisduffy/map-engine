import * as THREE from 'three'
import type { SectorRegistry } from './SectorRegistry'

export class MapRenderer {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly mesh: THREE.Mesh
  readonly renderer: THREE.WebGLRenderer

  // Exposed for Task 2.2+ (display canvas and texture setup)
  readonly material: THREE.MeshBasicMaterial

  // Display canvas and texture (Task 2.2)
  readonly displayCtx: OffscreenCanvasRenderingContext2D
  readonly displayImageData: ImageData
  private readonly _texture: THREE.CanvasTexture<OffscreenCanvas>
  private readonly _colorParserCanvas: OffscreenCanvas
  private readonly _colorParserCtx: OffscreenCanvasRenderingContext2D

  // Stored for pan/zoom in Tasks 2.5/2.6
  protected readonly _canvas: HTMLCanvasElement
  protected readonly _registry: SectorRegistry
  protected _frustumHalfW: number
  protected _frustumHalfH: number

  private _animFrameId: number
  // Fixed world-units-per-pixel scale (set from initial "contain" computation).
  // Used to proportionally resize the frustum when the canvas CSS size changes so
  // the map appears the same physical size — only the viewport boundary moves.
  private readonly _worldUnitsPerPixel: number
  private _currentW: number
  private _currentH: number

  // Pan state — middle-button only (CA-3)
  // Middle button = pan. Left button = hover/click/drag. Concerns are fully decoupled.
  private static readonly _DRAG_DEAD_ZONE_PX = 4
  private _panPressed = false // middle button is currently held
  private _isPanning = false // middle button held AND dead zone exceeded (actively panning)
  private _panOrigin = { x: 0, y: 0 } // cumulative dead-zone origin (pointerdown position)
  private _lastPointerPos = { x: 0, y: 0 }

  // Left-button drag tracking (marquee-select foundation — CA-3 follow-up)
  // Completely independent from middle-button pan state.
  private _leftPressed = false // left button currently held
  private _leftDragActive = false // true once dead zone (4px) exceeded
  private _leftHasDragged = false // sticky: persists past pointerup through synthesized click
  private _leftDragOrigin = { x: 0, y: 0 }

  // Bound handler references — stored so destroy() can removeEventListener
  private readonly _onPointerDown: (e: PointerEvent) => void
  private readonly _onPointerMove: (e: PointerEvent) => void
  private readonly _onPointerUp: (e: PointerEvent) => void
  private readonly _onPointerCancel: () => void
  private readonly _onWheel: (e: WheelEvent) => void

  private _destroyed = false

  constructor(canvas: HTMLCanvasElement, registry: SectorRegistry) {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      throw new Error(
        'MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM and has non-zero CSS dimensions before calling loadMap()'
      )
    }

    this._canvas = canvas
    this._registry = registry

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    // Scene
    this.scene = new THREE.Scene()

    // Geometry: 1 world unit = 1 pixel, centered at origin
    const geometry = new THREE.PlaneGeometry(registry.width, registry.height)

    // Material: map is null until Task 2.2 assigns the CanvasTexture
    this.material = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.DoubleSide,
    })

    // Mesh
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.mesh)

    // Orthographic camera — "contain" framing strategy
    const canvasAspect = canvas.clientWidth / canvas.clientHeight
    const bitmapAspect = registry.width / registry.height

    let frustumHalfW: number
    let frustumHalfH: number

    if (canvasAspect >= bitmapAspect) {
      frustumHalfH = registry.height / 2
      frustumHalfW = frustumHalfH * canvasAspect
    } else {
      frustumHalfW = registry.width / 2
      frustumHalfH = frustumHalfW / canvasAspect
    }

    this._frustumHalfW = frustumHalfW
    this._frustumHalfH = frustumHalfH
    this._worldUnitsPerPixel = (frustumHalfW * 2) / canvas.clientWidth
    this._currentW = canvas.clientWidth
    this._currentH = canvas.clientHeight

    this.camera = new THREE.OrthographicCamera(
      -frustumHalfW,
      frustumHalfW,
      frustumHalfH,
      -frustumHalfH,
      -1000,
      1000
    )
    this.camera.position.set(0, 0, 1)
    this.camera.zoom = 1.0
    this.camera.updateProjectionMatrix()

    // Display canvas and displayImageData (Task 2.2)
    // OffscreenCanvas mirrors the bitmap dimensions exactly
    const displayCanvas = new OffscreenCanvas(registry.width, registry.height)
    this.displayCtx = displayCanvas.getContext('2d')!

    // Mandatory .slice() — keeps displayImageData.data independent from registry.sourceBuffer
    this.displayImageData = new ImageData(
      registry.sourceBuffer.slice(),
      registry.width,
      registry.height
    )
    this.displayCtx.putImageData(this.displayImageData, 0, 0)

    // Color parser helper — created once, reused in setSectorColor
    this._colorParserCanvas = new OffscreenCanvas(1, 1)
    this._colorParserCtx = this._colorParserCanvas.getContext('2d')!

    // CanvasTexture wired to the display OffscreenCanvas
    this._texture = new THREE.CanvasTexture(displayCanvas)
    this._texture.minFilter = THREE.NearestFilter
    this._texture.magFilter = THREE.NearestFilter
    this._texture.generateMipmaps = false

    // Wire texture into the material created above
    this.material.map = this._texture

    // Middle-button pan handlers (CA-3)
    // Only middle button (button === 1) triggers pan. Left button is reserved for
    // hover/click picking — the two concerns are fully decoupled at the button level.
    this._onPointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        // Middle button — pan
        this._panPressed = true
        this._isPanning = false
        this._panOrigin = { x: e.clientX, y: e.clientY }
        this._lastPointerPos = { x: e.clientX, y: e.clientY }
        // Route all subsequent pointer events to this canvas even if cursor leaves.
        // Fixes stuck-drag: pointerup fires on canvas even when released outside.
        try {
          this._canvas.setPointerCapture(e.pointerId)
        } catch (_) {
          // Synthetic test events may not have a capturable pointer ID — safe to ignore.
        }
      } else if (e.button === 0) {
        // Left button — drag tracking (future: marquee-select)
        this._leftPressed = true
        this._leftDragActive = false
        this._leftHasDragged = false
        this._leftDragOrigin = { x: e.clientX, y: e.clientY }
        // No setPointerCapture here — middle-button pan capture must not be disrupted.
        // Outside-release is handled via e.buttons check in _onPointerMove instead.
      }
    }
    this._onPointerMove = (e: PointerEvent) => {
      // Auto-release left drag state if the left button is no longer held.
      // Handles outside-release without needing setPointerCapture on the left button.
      if (this._leftPressed && (e.buttons & 1) === 0) {
        this._leftPressed = false
        this._leftDragActive = false
      }

      // ── Middle button pan ────────────────────────────────────────────────
      if (this._panPressed) {
        const deltaScreenX = e.clientX - this._lastPointerPos.x
        const deltaScreenY = e.clientY - this._lastPointerPos.y
        // Always update _lastPointerPos (even pre-dead-zone) so the first pan delta is smooth.
        this._lastPointerPos = { x: e.clientX, y: e.clientY }

        if (!this._isPanning) {
          // Measure cumulative distance from the middle-button down position.
          // Per-frame deltas would be too small to ever cross the threshold.
          const dist = Math.hypot(
            e.clientX - this._panOrigin.x,
            e.clientY - this._panOrigin.y
          )
          if (dist > MapRenderer._DRAG_DEAD_ZONE_PX) this._isPanning = true
        }

        if (this._isPanning) {
          const scaleX = (this._frustumHalfW * 2) / this._canvas.clientWidth
          const scaleY = (this._frustumHalfH * 2) / this._canvas.clientHeight
          this.camera.position.x -= (deltaScreenX * scaleX) / this.camera.zoom
          this.camera.position.y += (deltaScreenY * scaleY) / this.camera.zoom
          this.clampPan()
        }
      }

      // ── Left button drag tracking ────────────────────────────────────────
      if (this._leftPressed && !this._leftDragActive) {
        const dist = Math.hypot(
          e.clientX - this._leftDragOrigin.x,
          e.clientY - this._leftDragOrigin.y
        )
        if (dist > MapRenderer._DRAG_DEAD_ZONE_PX) {
          this._leftDragActive = true
          this._leftHasDragged = true
        }
      }
    }
    this._onPointerUp = (e: PointerEvent) => {
      if (e.button === 1) {
        this._panPressed = false
        this._isPanning = false
      } else if (e.button === 0) {
        this._leftPressed = false
        this._leftDragActive = false
        // _leftHasDragged intentionally NOT reset — must survive until next pointerdown
        // (browser fires synthesized 'click' after pointerup; leftHasDragged must be
        // readable at click time to suppress drag-clicks)
      }
    }
    this._onPointerCancel = () => {
      this._panPressed = false
      this._isPanning = false
      this._leftPressed = false
      this._leftDragActive = false
      // _leftHasDragged: leave it — a cancelled gesture counts as "did drag"
    }
    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('pointercancel', this._onPointerCancel)

    // Scroll-wheel zoom toward cursor (CA-3)
    this._onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomBefore = this.camera.zoom
      const zoomFactor = Math.pow(1.1, -e.deltaY / 100)
      const newZoom = THREE.MathUtils.clamp(zoomBefore * zoomFactor, 0.5, 20.0)
      this.camera.zoom = newZoom
      this.camera.updateProjectionMatrix()

      // Offset camera so the world point under the cursor stays fixed.
      // Derivation: worldX = pos.x + ndcX * frustumHalfW / zoom
      // To keep worldX constant: delta = ndcX * frustumHalfW * (1/zoomBefore - 1/newZoom)
      const rect = this._canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      this.camera.position.x +=
        ndcX * this._frustumHalfW * (1 / zoomBefore - 1 / newZoom)
      this.camera.position.y +=
        ndcY * this._frustumHalfH * (1 / zoomBefore - 1 / newZoom)

      this.clampPan()
    }
    canvas.addEventListener('wheel', this._onWheel, { passive: false })

    // Continuous render loop (v1 decision — render-on-demand deferred to v2).
    // Canvas size is checked at the top of every frame (webgl2fundamentals pattern):
    // if the CSS size changed, resize the draw buffer and update the camera frustum
    // proportionally before rendering — all within the same rAF callback so the
    // browser composites the correctly-sized result with no intermediate flash.
    const loop = () => {
      this._animFrameId = requestAnimationFrame(loop)
      const w = this._canvas.clientWidth
      const h = this._canvas.clientHeight
      if (w !== this._currentW || h !== this._currentH) {
        this._currentW = w
        this._currentH = h
        this.renderer.setSize(w, h, false)
        const fhw = (w * this._worldUnitsPerPixel) / 2
        const fhh = (h * this._worldUnitsPerPixel) / 2
        this._frustumHalfW = fhw
        this._frustumHalfH = fhh
        this.camera.left = -fhw
        this.camera.right = fhw
        this.camera.top = fhh
        this.camera.bottom = -fhh
        this.camera.updateProjectionMatrix()
        this.clampPan()
      }
      this.renderer.render(this.scene, this.camera)
    }
    this._animFrameId = requestAnimationFrame(loop)
  }

  clampPan(): void {
    const maxX = this._registry.width / 2 + this._registry.width * 0.1
    const maxY = this._registry.height / 2 + this._registry.height * 0.1
    this.camera.position.x = Math.max(
      -maxX,
      Math.min(maxX, this.camera.position.x)
    )
    this.camera.position.y = Math.max(
      -maxY,
      Math.min(maxY, this.camera.position.y)
    )
  }

  /** True while the middle button is held (pan gesture active or pending dead zone). */
  get isPanning(): boolean {
    return this._panPressed
  }

  /** True while the left button is held AND drag dead zone (4px) has been exceeded.
   *  Future hook for rendering a marquee-select rectangle. */
  get isLeftDragging(): boolean {
    return this._leftDragActive
  }

  /** Sticky: true after any left-drag (dead zone exceeded), until next left pointerdown.
   *  MapEngine reads this in the click handler to suppress synthesized drag-clicks. */
  get leftHasDragged(): boolean {
    return this._leftHasDragged
  }

  setSectorColor(hexKey: string, color: string): void {
    if (!this._registry.pixelIndices.has(hexKey)) {
      console.warn('[MapEngine] setSectorColor: sector has no pixel data')
      return
    }

    // Parse CSS color via 1×1 canvas
    this._colorParserCtx.clearRect(0, 0, 1, 1)
    this._colorParserCtx.fillStyle = color
    this._colorParserCtx.fillRect(0, 0, 1, 1)
    const parsed = this._colorParserCtx.getImageData(0, 0, 1, 1).data
    const r = parsed[0]
    const g = parsed[1]
    const b = parsed[2]

    // Write color to all pixels in this sector
    const indices = this._registry.pixelIndices.get(hexKey)!
    const data = this.displayImageData.data
    for (let n = 0; n < indices.length; n++) {
      const offset = indices[n] * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = 255
    }

    // Dirty-rect flush scoped to sector bbox
    const bbox = this._registry.bboxes.get(hexKey)!
    this.displayCtx.putImageData(
      this.displayImageData,
      0,
      0,
      bbox.minX,
      bbox.minY,
      bbox.maxX - bbox.minX + 1,
      bbox.maxY - bbox.minY + 1
    )

    this._texture.needsUpdate = true
  }

  resetSectorColor(hexKey: string): void {
    if (!this._registry.pixelIndices.has(hexKey)) {
      console.warn('[MapEngine] resetSectorColor: sector has no pixel data')
      return
    }

    const indices = this._registry.pixelIndices.get(hexKey)!
    const src = this._registry.sourceBuffer
    const data = this.displayImageData.data
    for (let n = 0; n < indices.length; n++) {
      const offset = indices[n] * 4
      data[offset] = src[offset]
      data[offset + 1] = src[offset + 1]
      data[offset + 2] = src[offset + 2]
      data[offset + 3] = 255
    }

    const bbox = this._registry.bboxes.get(hexKey)!
    this.displayCtx.putImageData(
      this.displayImageData,
      0,
      0,
      bbox.minX,
      bbox.minY,
      bbox.maxX - bbox.minX + 1,
      bbox.maxY - bbox.minY + 1
    )

    this._texture.needsUpdate = true
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    cancelAnimationFrame(this._animFrameId)
    this._canvas.removeEventListener('pointerdown', this._onPointerDown)
    this._canvas.removeEventListener('pointermove', this._onPointerMove)
    this._canvas.removeEventListener('pointerup', this._onPointerUp)
    this._canvas.removeEventListener('pointercancel', this._onPointerCancel)
    this._canvas.removeEventListener('wheel', this._onWheel)
    this.renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
    this._texture.dispose()
  }
}
