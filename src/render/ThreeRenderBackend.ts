import * as THREE from 'three'
import type {
  IThreeRenderBackend,
  ThreeRenderBackendInternalAccess,
} from './IThreeRenderBackend'

export class ThreeRenderBackend
  implements IThreeRenderBackend, ThreeRenderBackendInternalAccess
{
  readonly camera: THREE.OrthographicCamera
  readonly scene: THREE.Scene
  readonly mesh: THREE.Mesh
  readonly texture: THREE.CanvasTexture<OffscreenCanvas>
  readonly material: THREE.MeshBasicMaterial

  private readonly _renderer: THREE.WebGLRenderer

  constructor(
    canvas: HTMLCanvasElement,
    displayCanvas: OffscreenCanvas,
    frustumHalfW: number,
    frustumHalfH: number,
    mapWidth: number,
    mapHeight: number
  ) {
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    this.scene = new THREE.Scene()

    const geometry = new THREE.PlaneGeometry(mapWidth, mapHeight)
    this.material = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.mesh)

    this.texture = new THREE.CanvasTexture(displayCanvas)
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.material.map = this.texture

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
  }

  uploadTexture(tex: THREE.Texture): void {
    tex.needsUpdate = true
  }

  uploadBorderEdges(_buffer: Float32Array, _count: number): void {}

  updateUniforms(_uniforms: Record<string, unknown>): void {}

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this._renderer.render(scene, camera)
  }

  setSize(width: number, height: number): void {
    this._renderer.setSize(width, height, false)
  }

  getThreeScene(): THREE.Scene {
    return this.scene
  }

  getThreeRenderer(): THREE.WebGLRenderer {
    return this._renderer
  }

  readSectorIdAt(_x: number, _y: number): number {
    return 0xffff
  }

  dispose(): void {
    this._renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}
