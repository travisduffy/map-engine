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

  // Numeric sector-ID space (0..sectorCount-1, sentinel 0xffff) — matches
  // `pixelIndicesMirror`/`sectorIds` (Epic 3 Task 3.4).
  private readonly _pixelIndices: Uint32Array | null
  private readonly _indexWidth: number
  private readonly _indexHeight: number

  // Last-written palette, retained for assertions (F-2.8).
  private _lastPalette: Uint32Array | null = null
  private readonly _entryColors = new Map<number, [number, number, number]>()

  constructor(pixelIndices?: Uint32Array, width = 0, height = 0) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000)
    this.camera.position.set(0, 0, 1)
    this.scene = new THREE.Scene()
    this.mesh = new THREE.Mesh()
    this._pixelIndices = pixelIndices ? pixelIndices.slice() : null
    this._indexWidth = width
    this._indexHeight = height
  }

  writePaletteEntry(numId: number, r: number, g: number, b: number): void {
    this._entryColors.set(numId, [r, g, b])
  }

  /** @internal test/introspection: last per-entry color patch, if any. */
  getPaletteEntry(numId: number): [number, number, number] | undefined {
    return this._entryColors.get(numId)
  }

  updateUniforms(uniforms: Record<string, unknown>): void {
    const palette = uniforms.palette
    if (palette instanceof Uint32Array) {
      this._lastPalette = palette.slice()
    }
  }

  /** @internal test/introspection: last full-palette replace, if any. */
  getLastPalette(): Uint32Array | null {
    return this._lastPalette
  }

  uploadBorderEdges(_buffer: Float32Array, _count: number): void {}

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
      !this._pixelIndices ||
      x < 0 ||
      y < 0 ||
      x >= this._indexWidth ||
      y >= this._indexHeight
    ) {
      return 0xffff
    }
    return this._pixelIndices[y * this._indexWidth + x]
  }

  reuploadIndexTexture(_mirror: Uint16Array): void {}

  getIndexTexture(): THREE.Texture | null {
    return null
  }

  dispose(): void {}
}
