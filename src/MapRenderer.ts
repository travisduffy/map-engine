import * as THREE from 'three'
import type { SectorRegistry } from './SectorRegistry'

export class MapRenderer {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly mesh: THREE.Mesh
  readonly renderer: THREE.WebGLRenderer

  // Exposed for Task 2.2+ (display canvas and texture setup)
  readonly material: THREE.MeshBasicMaterial

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

    // Continuous render loop (v1 decision — render-on-demand deferred to v2)
    const loop = () => {
      this._animFrameId = requestAnimationFrame(loop)
      this.renderer.render(this.scene, this.camera)
    }
    this._animFrameId = requestAnimationFrame(loop)
  }

  setSectorColor(_hexKey: string, _color: string): void {
    throw new Error('Not implemented')
  }

  resetSectorColor(_hexKey: string): void {
    throw new Error('Not implemented')
  }

  destroy(): void {
    cancelAnimationFrame(this._animFrameId)
    this.renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
  }
}
