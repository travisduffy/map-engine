import * as THREE from 'three'
import type {
  IThreeRenderBackend,
  ThreeRenderBackendInternalAccess,
} from './IThreeRenderBackend'

export class NullRenderBackend
  implements IThreeRenderBackend, ThreeRenderBackendInternalAccess
{
  readonly camera: THREE.OrthographicCamera
  readonly scene: THREE.Scene
  readonly mesh: THREE.Mesh
  readonly texture: THREE.Texture

  private _imageData: Uint8ClampedArray | null = null
  private _width = 0
  private _height = 0

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000)
    this.camera.position.set(0, 0, 1)
    this.scene = new THREE.Scene()
    this.mesh = new THREE.Mesh()
    this.texture = new THREE.Texture()
  }

  uploadTexture(tex: THREE.Texture): void {
    const img = tex.image
    if (img instanceof OffscreenCanvas) {
      const ctx = img.getContext('2d')
      if (ctx) {
        const id = ctx.getImageData(0, 0, img.width, img.height)
        this._imageData = id.data.slice()
        this._width = img.width
        this._height = img.height
      }
    }
  }

  uploadBorderEdges(_buffer: Float32Array, _count: number): void {}

  updateUniforms(_uniforms: Record<string, unknown>): void {}

  render(_scene: THREE.Scene, _camera: THREE.Camera): void {}

  setSize(_width: number, _height: number): void {}

  getThreeScene(): THREE.Scene {
    return this.scene
  }

  getThreeRenderer(): THREE.WebGLRenderer {
    throw new Error('NullRenderBackend: no WebGLRenderer')
  }

  readSectorIdAt(x: number, y: number): number {
    if (
      !this._imageData ||
      x < 0 ||
      y < 0 ||
      x >= this._width ||
      y >= this._height
    ) {
      return 0xffff
    }
    const i = (y * this._width + x) * 4
    return (
      (this._imageData[i] << 16) |
      (this._imageData[i + 1] << 8) |
      this._imageData[i + 2]
    )
  }

  dispose(): void {
    this._imageData = null
  }
}
