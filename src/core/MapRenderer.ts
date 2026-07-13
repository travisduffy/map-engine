import type { OrthographicCamera, Scene, Mesh, Vector2 } from 'three'
import type {
  IThreeRenderBackend,
  ThreeRenderBackendInternalAccess,
} from '../render/IThreeRenderBackend'
import { ThreeRenderBackend } from '../render/ThreeRenderBackend'
import { BorderRenderer } from '../render/BorderRenderer'
import type { SectorRegistry } from '../sector/SectorRegistry'
import type { PickEvent } from '../shared/types'
import { parseColorToRgb } from '../shared/color'
import { InputController } from '../input/InputController'

export class MapRenderer {
  readonly scene: Scene
  readonly camera: OrthographicCamera
  readonly mesh: Mesh

  private readonly _backend: IThreeRenderBackend &
    ThreeRenderBackendInternalAccess

  protected readonly _canvas: HTMLCanvasElement
  protected readonly _registry: SectorRegistry
  protected _frustumHalfW: number
  protected _frustumHalfH: number

  private _animFrameId: number
  private readonly _worldUnitsPerPixel: number
  private _currentW: number
  private _currentH: number

  private readonly _input: InputController

  private _borderRenderer: BorderRenderer | null = null
  /**
   * The `WebGLBuffer` `_borderRenderer`'s `GLBufferAttribute` currently
   * wraps. Context loss destroys the GPU buffer; `uploadBorderEdges`
   * reallocates a brand-new `WebGLBuffer` object on the next call after
   * restore (F-4.10), but an already-constructed `BorderRenderer`'s
   * attribute still references the old, now-invalid one. Comparing against
   * `_backend.getBorderVBO()` on every receipt is what detects this and
   * triggers a rebuild in `_receiveBorderEdges` below -- without it, three.js
   * throws deep inside its own shader/program binding path when it tries to
   * bind the stale buffer on the next render.
   */
  private _borderRendererVBO: WebGLBuffer | null = null
  /**
   * Retained Main-side private copy backing `getBorderSegments()` (CA-6) --
   * independent of the pooled buffer bounced back to the Worker after GPU
   * upload, and independent of `BorderRenderer`'s own (lazy, non-empty-only)
   * construction. Also the source for the context-restore re-upload below.
   * `null` before the first `recomputeBorders` resolution.
   */
  private _borderSegments: Float32Array | null = null
  /**
   * Desired visibility, applied to `_borderRenderer.lineSegments.visible`.
   * Persisted independently of `_borderRenderer`'s own lifecycle (lazy
   * construction, rebuild-on-context-restore) so a hide/show choice made
   * before borders exist yet, or across a rebuild, isn't lost.
   */
  private _bordersVisible = true

  _dirty: boolean = true

  private _destroyed = false

  /** @internal */
  public _preRenderHook: (() => void) | null

  /**
   * @internal Invoked immediately after `_backend.render(...)`, but only when
   * a render actually happened (dirty-gated — unlike `_preRenderHook`, which
   * runs unconditionally at the top of every frame). Aggregation's Transferable
   * ring pool (F-C.7/F-C.8) uses this to flush bounce-back buffers to the
   * Worker; receipt of a hot-path handoff sets `_dirty = true` so a render
   * (and therefore a flush) always follows a handoff (Known Risk 3).
   */
  public _postRenderHook: (() => void) | null = null

  constructor(
    canvas: HTMLCanvasElement,
    registry: SectorRegistry,
    preRenderHook?: () => void,
    onPointerMove?: (e: PickEvent) => void,
    onClick?: (e: PickEvent) => void,
    _backend?: IThreeRenderBackend & ThreeRenderBackendInternalAccess
  ) {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      throw new Error(
        'MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM and has non-zero CSS dimensions before calling loadMap()'
      )
    }

    this._canvas = canvas
    this._registry = registry
    this._preRenderHook = preRenderHook ?? null

    const w = registry.width
    const h = registry.height

    // Orthographic camera — "contain" framing strategy
    const canvasAspect = canvas.clientWidth / canvas.clientHeight
    const bitmapAspect = w / h

    let frustumHalfW: number
    let frustumHalfH: number

    if (canvasAspect >= bitmapAspect) {
      frustumHalfH = h / 2
      frustumHalfW = frustumHalfH * canvasAspect
    } else {
      frustumHalfW = w / 2
      frustumHalfH = frustumHalfW / canvasAspect
    }

    this._frustumHalfW = frustumHalfW
    this._frustumHalfH = frustumHalfH
    this._worldUnitsPerPixel = (frustumHalfW * 2) / canvas.clientWidth
    this._currentW = canvas.clientWidth
    this._currentH = canvas.clientHeight

    this._backend =
      _backend ??
      new ThreeRenderBackend(
        canvas,
        frustumHalfW,
        frustumHalfH,
        w,
        h,
        registry.pixelIndices,
        registry.idToHex.length,
        registry.idToPackedRgb
      )

    canvas.addEventListener('webglcontextrestored', () => {
      this._backend.reuploadIndexTexture(this._registry.pixelIndicesMirror)
      // F-4.10: the border VBO is destroyed along with the rest of the GPU
      // context. Re-run the same receipt path a fresh Worker resolution
      // would (upload + rebuild `BorderRenderer` if the VBO was
      // reallocated + mark dirty) from the retained private copy, if a
      // border has ever been computed -- reusing `_receiveBorderEdges`
      // keeps this in lockstep with the VBO-identity-change handling there
      // instead of duplicating a second, easily-drifting copy of it.
      if (this._borderSegments) {
        this._receiveBorderEdges(
          this._borderSegments,
          this._borderSegments.length / 4
        )
      }
      this._dirty = true
    })

    this.scene = this._backend.scene
    this.camera = this._backend.camera
    this.mesh = this._backend.mesh

    // InputController owns all DOM event listeners (CA-3)
    this._input = new InputController(canvas, {
      onDirty: () => {
        this._dirty = true
      },
      pan: delta => this._applyPan(delta),
      zoom: (factor, ndcPoint) => this._applyZoom(factor, ndcPoint),
      pointerMove: onPointerMove,
      click: onClick,
    })

    this._animFrameId = requestAnimationFrame(this._loop)
  }

  // Canvas size is checked at the top of every frame (webgl2fundamentals pattern).
  private readonly _loop = (): void => {
    this._animFrameId = requestAnimationFrame(this._loop)
    if (this._preRenderHook) this._preRenderHook()
    const cw = this._canvas.clientWidth
    const ch = this._canvas.clientHeight
    if (cw !== this._currentW || ch !== this._currentH) {
      this._currentW = cw
      this._currentH = ch
      this._backend.setSize(cw, ch)
      const fhw = (cw * this._worldUnitsPerPixel) / 2
      const fhh = (ch * this._worldUnitsPerPixel) / 2
      this._frustumHalfW = fhw
      this._frustumHalfH = fhh
      this.camera.left = -fhw
      this.camera.right = fhw
      this.camera.top = fhh
      this.camera.bottom = -fhh
      this.camera.updateProjectionMatrix()
      this.clampPan()
      this._dirty = true
    }
    if (this._dirty) {
      this._backend.render(this.scene, this.camera)
      if (this._postRenderHook) this._postRenderHook()
      this._dirty = false
    }
  }

  /** @internal pauses the rAF render loop; used by MapEngine while the Worker bootstrap handshake is in flight. */
  public _pauseLoop(): void {
    cancelAnimationFrame(this._animFrameId)
  }

  /** @internal resumes the rAF render loop after a `_pauseLoop()` call. */
  public _resumeLoop(): void {
    this._animFrameId = requestAnimationFrame(this._loop)
  }

  private _applyPan(delta: Vector2): void {
    const scaleX = (this._frustumHalfW * 2) / this._canvas.clientWidth
    const scaleY = (this._frustumHalfH * 2) / this._canvas.clientHeight
    this.camera.position.x -= (delta.x * scaleX) / this.camera.zoom
    this.camera.position.y += (delta.y * scaleY) / this.camera.zoom
    this.clampPan()
  }

  private _applyZoom(factor: number, ndcPoint: Vector2): void {
    const zoomBefore = this.camera.zoom
    const newZoom = Math.max(0.5, Math.min(20.0, zoomBefore * factor))
    this.camera.zoom = newZoom
    this.camera.updateProjectionMatrix()
    this.camera.position.x +=
      ndcPoint.x * this._frustumHalfW * (1 / zoomBefore - 1 / newZoom)
    this.camera.position.y +=
      ndcPoint.y * this._frustumHalfH * (1 / zoomBefore - 1 / newZoom)
    this.clampPan()
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

  /** @internal delegates to the backend's index-space pixel→sector-ID lookup (Epic 3 Task 3.4). */
  readSectorIdAt(x: number, y: number): number {
    return this._backend.readSectorIdAt(x, y)
  }

  /**
   * Projects a bitmap pixel-space coordinate `(x, y)` (pixel center) to CSS
   * screen-space coordinates relative to the canvas's top-left corner,
   * honoring the live camera pan/zoom (CA-8). This is the exact inverse of
   * `MapEngine._resolvePixelCoords`'s screen→pixel raycast, expressed as a
   * closed-form transform since the camera is orthographic — 1 world unit
   * equals 1 bitmap pixel, and the map plane is centered at the world
   * origin (`ThreeRenderBackend`'s `PlaneGeometry(mapWidth, mapHeight)`).
   * All inputs are read live so panning/zooming/resizing between calls is
   * always reflected.
   */
  project(x: number, y: number): [number, number] {
    const w = this._registry.width
    const h = this._registry.height
    const worldX = x + 0.5 - w / 2
    const worldY = h / 2 - (y + 0.5)
    const ndcX =
      ((worldX - this.camera.position.x) * this.camera.zoom) /
      this._frustumHalfW
    const ndcY =
      ((worldY - this.camera.position.y) * this.camera.zoom) /
      this._frustumHalfH
    const screenX = ((ndcX + 1) / 2) * this._canvas.clientWidth
    const screenY = ((1 - ndcY) / 2) * this._canvas.clientHeight
    return [screenX, screenY]
  }

  get isPanning(): boolean {
    return this._input.isPanning
  }

  get isLeftDragging(): boolean {
    return this._input.isLeftDragging
  }

  get leftHasDragged(): boolean {
    return this._input.leftHasDragged
  }

  /**
   * O(1) LUT-entry patch (Epic 4 B2) — no bbox/dirty-rect batching needed;
   * the dirty flag is set directly at the point of mutation.
   */
  setSectorColor(hexKey: string, color: string): void {
    const pixels = this._registry.getSectorPixels(hexKey)
    if (!pixels) {
      console.warn('[MapEngine] setSectorColor: sector has no pixel data')
      return
    }
    const numId = this._registry.getNumericId(hexKey)!
    const { r, g, b } = parseColorToRgb(color)
    this._backend.writePaletteEntry(numId, r, g, b)
    this._dirty = true
  }

  resetSectorColor(hexKey: string): void {
    const pixels = this._registry.getSectorPixels(hexKey)
    if (!pixels) {
      console.warn('[MapEngine] resetSectorColor: sector has no pixel data')
      return
    }
    const numId = this._registry.getNumericId(hexKey)!
    const packed = this._registry.idToPackedRgb[numId]
    this._backend.writePaletteEntry(
      numId,
      (packed >>> 16) & 0xff,
      (packed >>> 8) & 0xff,
      packed & 0xff
    )
    this._dirty = true
  }

  /** Replaces the entire palette LUT (Epic 4 CA-7 `registerMapMode`/`setMapMode`). */
  setPalette(colors: Uint32Array): void {
    this._backend.updateUniforms({ palette: colors })
    this._dirty = true
  }

  /**
   * Receives a `recomputeBorders` (CA-6) resolution -- called by
   * `MapEngine`'s `TransferableBorderPool` on every Worker handoff,
   * including the zero-edge sentinel, and re-invoked directly (with the
   * retained copy) on `webglcontextrestored` (F-4.10). Order matters here
   * (the receipt-flow contract): GPU upload, then retain the private copy,
   * then mark dirty. None of this depends on `BorderRenderer`'s own
   * construction, since the GPU VBO is backend-owned independent of the
   * scene object.
   */
  _receiveBorderEdges(edges: Float32Array, count: number): void {
    this._backend.uploadBorderEdges(edges, count)
    this._borderSegments = edges.slice(0, count * 4)

    const currentVbo = this._backend.getBorderVBO()
    if (this._borderRenderer && this._borderRendererVBO !== currentVbo) {
      // The VBO was reallocated since this BorderRenderer was built (context
      // loss/restore is the only case that reallocates -- steady-state
      // uploads always reuse the same buffer) -- its GLBufferAttribute
      // still wraps the old, now-destroyed WebGLBuffer. Rebuild against the
      // current one rather than rendering with a stale reference.
      this.scene.remove(this._borderRenderer.lineSegments)
      this._borderRenderer.dispose()
      this._borderRenderer = null
    }

    if (count > 0) {
      if (!this._borderRenderer) {
        this._borderRenderer = new BorderRenderer(
          this._backend,
          this._registry.width,
          this._registry.height
        )
        this._borderRendererVBO = currentVbo
        this._borderRenderer.lineSegments.visible = this._bordersVisible
        this.scene.add(this._borderRenderer.lineSegments)
      }
      this._borderRenderer.setDrawCount(count)
    }
    this._dirty = true
  }

  /** Sync read of the retained border-segment copy (CA-6); `null` before the first resolution. */
  getBorderSegments(): Float32Array | null {
    return this._borderSegments
  }

  /**
   * Toggles border-line visibility without recomputing or re-uploading
   * anything -- a plain `Object3D.visible` flip on the already-built scene
   * object. Safe to call before any border has ever been computed (the
   * choice is remembered via `_bordersVisible` and applied whenever
   * `BorderRenderer` is next lazily constructed or rebuilt).
   */
  setBordersVisible(visible: boolean): void {
    this._bordersVisible = visible
    if (this._borderRenderer) {
      this._borderRenderer.lineSegments.visible = visible
      this._dirty = true
    }
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    cancelAnimationFrame(this._animFrameId)
    this._preRenderHook = null
    this._postRenderHook = null
    this._input.destroy()
    this._borderRenderer?.dispose()
    this._borderRenderer = null
    this._backend.dispose()
  }
}
