import * as THREE from 'three'
import type { SectorRegistry } from './SectorRegistry'
import type { PickEvent, SectorBBox } from './types'
import { parseColorToRgb } from './internal/color'
import { InputController } from './input/InputController'

export class MapRenderer {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly mesh: THREE.Mesh
  readonly renderer: THREE.WebGLRenderer

  readonly material: THREE.MeshBasicMaterial

  readonly displayCtx: OffscreenCanvasRenderingContext2D
  readonly displayImageData: ImageData
  private readonly _texture: THREE.CanvasTexture<OffscreenCanvas>

  protected readonly _canvas: HTMLCanvasElement
  protected readonly _registry: SectorRegistry
  protected _frustumHalfW: number
  protected _frustumHalfH: number

  private _animFrameId: number
  private readonly _worldUnitsPerPixel: number
  private _currentW: number
  private _currentH: number

  private readonly _input: InputController

  // Prep for Task 2.2 render gating — set by InputController onDirty callback.
  _dirty: boolean = true

  private _destroyed = false

  /** @internal */
  public _preRenderHook: (() => void) | null
  /** @internal */
  public _lastFrameTime: number = -1
  /** @internal */
  public _pendingDirtyRect: SectorBBox | null = null

  constructor(
    canvas: HTMLCanvasElement,
    registry: SectorRegistry,
    preRenderHook?: () => void,
    onPointerMove?: (e: PickEvent) => void,
    onClick?: (e: PickEvent) => void
  ) {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      throw new Error(
        'MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM and has non-zero CSS dimensions before calling loadMap()'
      )
    }

    this._canvas = canvas
    this._registry = registry
    this._preRenderHook = preRenderHook ?? null

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    // Scene
    this.scene = new THREE.Scene()

    // Geometry: 1 world unit = 1 pixel, centered at origin
    const geometry = new THREE.PlaneGeometry(registry.width, registry.height)

    this.material = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.DoubleSide,
    })

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

    // Build displayImageData from pixelIndices + idToPackedRgb.
    // sourceBuffer is null after SectorRegistry construction (disposed for memory — PR-1).
    const w = registry.width,
      h = registry.height
    const rawData = new Uint8ClampedArray(w * h * 4)
    const idToPackedRgb = registry.idToPackedRgb
    const pixelIndices = registry.pixelIndices
    for (let i = 0, n = w * h; i < n; i++) {
      const id = pixelIndices[i]
      if (id !== 0xffff) {
        const packed = idToPackedRgb[id]
        rawData[i * 4] = (packed >>> 16) & 0xff
        rawData[i * 4 + 1] = (packed >>> 8) & 0xff
        rawData[i * 4 + 2] = packed & 0xff
      }
      rawData[i * 4 + 3] = 255
    }

    const displayCanvas = new OffscreenCanvas(w, h)
    this.displayCtx = displayCanvas.getContext('2d')!
    this.displayImageData = new ImageData(rawData, w, h)
    this.displayCtx.putImageData(this.displayImageData, 0, 0)

    // CanvasTexture wired to the display OffscreenCanvas
    this._texture = new THREE.CanvasTexture(displayCanvas)
    this._texture.minFilter = THREE.NearestFilter
    this._texture.magFilter = THREE.NearestFilter
    this._texture.generateMipmaps = false

    this.material.map = this._texture

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

    // Canvas size is checked at the top of every frame (webgl2fundamentals pattern).
    const loop = () => {
      this._animFrameId = requestAnimationFrame(loop)
      if (this._preRenderHook) this._preRenderHook()
      const cw = this._canvas.clientWidth
      const ch = this._canvas.clientHeight
      if (cw !== this._currentW || ch !== this._currentH) {
        this._currentW = cw
        this._currentH = ch
        this.renderer.setSize(cw, ch, false)
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
        this.renderer.render(this.scene, this.camera)
        this._dirty = false
      }
    }
    this._animFrameId = requestAnimationFrame(loop)
  }

  private _applyPan(delta: THREE.Vector2): void {
    const scaleX = (this._frustumHalfW * 2) / this._canvas.clientWidth
    const scaleY = (this._frustumHalfH * 2) / this._canvas.clientHeight
    this.camera.position.x -= (delta.x * scaleX) / this.camera.zoom
    this.camera.position.y += (delta.y * scaleY) / this.camera.zoom
    this.clampPan()
  }

  private _applyZoom(factor: number, ndcPoint: THREE.Vector2): void {
    const zoomBefore = this.camera.zoom
    const newZoom = THREE.MathUtils.clamp(zoomBefore * factor, 0.5, 20.0)
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

  get isPanning(): boolean {
    return this._input.isPanning
  }

  get isLeftDragging(): boolean {
    return this._input.isLeftDragging
  }

  get leftHasDragged(): boolean {
    return this._input.leftHasDragged
  }

  setSectorColor(hexKey: string, color: string): void {
    const pixels = this._registry.getSectorPixels(hexKey)
    if (!pixels) {
      console.warn('[MapEngine] setSectorColor: sector has no pixel data')
      return
    }

    const { r, g, b } = parseColorToRgb(color)
    const data = this.displayImageData.data
    for (let n = 0; n < pixels.length; n++) {
      const offset = pixels[n] * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = 255
    }

    const [minX, minY, maxX, maxY] = this._registry.getBBox(hexKey)
    this.displayCtx.putImageData(
      this.displayImageData,
      0,
      0,
      minX,
      minY,
      maxX - minX + 1,
      maxY - minY + 1
    )

    this._dirty = true
    this._texture.needsUpdate = true
  }

  /** @internal */
  public _patchSectorPixels(
    hexKey: string,
    r: number,
    g: number,
    b: number
  ): void {
    const pixels = this._registry.getSectorPixels(hexKey)
    if (!pixels) return
    const data = this.displayImageData.data
    for (let i = 0; i < pixels.length; i++) {
      const offset = pixels[i] * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
    }
    const [minX, minY, maxX, maxY] = this._registry.getBBox(hexKey)
    if (this._pendingDirtyRect === null) {
      this._pendingDirtyRect = { minX, minY, maxX, maxY }
    } else {
      this._pendingDirtyRect.minX = Math.min(this._pendingDirtyRect.minX, minX)
      this._pendingDirtyRect.minY = Math.min(this._pendingDirtyRect.minY, minY)
      this._pendingDirtyRect.maxX = Math.max(this._pendingDirtyRect.maxX, maxX)
      this._pendingDirtyRect.maxY = Math.max(this._pendingDirtyRect.maxY, maxY)
    }
  }

  /** @internal */
  public _patchSectorPixelsFromSource(hexKey: string): void {
    const pixels = this._registry.getSectorPixels(hexKey)
    if (!pixels) return
    const numId = this._registry.getNumericId(hexKey)!
    const packed = this._registry.idToPackedRgb[numId]
    const r = (packed >>> 16) & 0xff
    const g = (packed >>> 8) & 0xff
    const b = packed & 0xff
    const data = this.displayImageData.data
    for (let i = 0; i < pixels.length; i++) {
      const offset = pixels[i] * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
    }
    const [minX, minY, maxX, maxY] = this._registry.getBBox(hexKey)
    if (this._pendingDirtyRect === null) {
      this._pendingDirtyRect = { minX, minY, maxX, maxY }
    } else {
      this._pendingDirtyRect.minX = Math.min(this._pendingDirtyRect.minX, minX)
      this._pendingDirtyRect.minY = Math.min(this._pendingDirtyRect.minY, minY)
      this._pendingDirtyRect.maxX = Math.max(this._pendingDirtyRect.maxX, maxX)
      this._pendingDirtyRect.maxY = Math.max(this._pendingDirtyRect.maxY, maxY)
    }
  }

  /** @internal */
  public _flushPendingDirty(): void {
    if (this._pendingDirtyRect === null) return
    const r = this._pendingDirtyRect!
    this.displayCtx.putImageData(
      this.displayImageData,
      0,
      0,
      r.minX,
      r.minY,
      r.maxX - r.minX + 1,
      r.maxY - r.minY + 1
    )
    this._dirty = true
    this._texture.needsUpdate = true
    this._pendingDirtyRect = null
  }

  resetSectorColor(hexKey: string): void {
    const pixels = this._registry.getSectorPixels(hexKey)
    if (!pixels) {
      console.warn('[MapEngine] resetSectorColor: sector has no pixel data')
      return
    }

    const numId = this._registry.getNumericId(hexKey)!
    const packed = this._registry.idToPackedRgb[numId]
    const r = (packed >>> 16) & 0xff
    const g = (packed >>> 8) & 0xff
    const b = packed & 0xff
    const data = this.displayImageData.data
    for (let n = 0; n < pixels.length; n++) {
      const offset = pixels[n] * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = 255
    }

    const [minX, minY, maxX, maxY] = this._registry.getBBox(hexKey)
    this.displayCtx.putImageData(
      this.displayImageData,
      0,
      0,
      minX,
      minY,
      maxX - minX + 1,
      maxY - minY + 1
    )

    this._dirty = true
    this._texture.needsUpdate = true
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    cancelAnimationFrame(this._animFrameId)
    this._preRenderHook = null
    this._pendingDirtyRect = null
    this._input.destroy()
    this.renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
    this._texture.dispose()
  }
}
