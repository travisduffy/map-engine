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
  protected readonly _frustumHalfW: number
  protected readonly _frustumHalfH: number

  private _animFrameId: number

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

    // Continuous render loop (v1 decision — render-on-demand deferred to v2)
    const loop = () => {
      this._animFrameId = requestAnimationFrame(loop)
      this.renderer.render(this.scene, this.camera)
    }
    this._animFrameId = requestAnimationFrame(loop)
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
    cancelAnimationFrame(this._animFrameId)
    this.renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
    this._texture.dispose()
  }
}
