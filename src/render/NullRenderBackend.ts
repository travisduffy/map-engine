import * as THREE from 'three'

import type {
  IThreeRenderBackend,
  ThreeRenderBackendInternalAccess,
} from './IThreeRenderBackend.js'

/**
 * No-op test double for logic tests that don't need a real GPU context.
 * Records palette writes for assertions, serves `readSectorIdAt` from an
 * optional CPU-side index copy, and stubs every GPU-touching method.
 */
export class NullRenderBackend
  implements IThreeRenderBackend, ThreeRenderBackendInternalAccess
{
  /** A real (but never-rendered) orthographic camera, so pan/zoom logic under test behaves normally. */
  readonly camera: THREE.OrthographicCamera
  /** A real (but never-rendered) scene, so scene add/remove logic under test behaves normally. */
  readonly scene: THREE.Scene
  /** An empty placeholder mesh standing in for the map plane. */
  readonly mesh: THREE.Mesh

  // Numeric sector-ID space (0..sectorCount-1, sentinel 0xffff) — matches
  // `pixelIndicesMirror`/`sectorIds` (Epic 3 Task 3.4).
  private readonly _pixelIndices: Uint32Array | null
  private readonly _indexWidth: number
  private readonly _indexHeight: number

  // Last-written palette, retained for assertions (F-2.8).
  private _lastPalette: Uint32Array | null = null
  // Per-entry writePaletteEntry patches, keyed by numeric sector ID — retained for assertions.
  private readonly _entryColors = new Map<number, [number, number, number]>()

  /**
   * Builds the placeholder camera/scene/mesh; an optional `pixelIndices`
   * copy (defensively sliced) plus dimensions back `readSectorIdAt` lookups.
   */
  constructor(pixelIndices?: Uint32Array, width = 0, height = 0) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000)
    this.camera.position.set(0, 0, 1)
    this.scene = new THREE.Scene()
    this.mesh = new THREE.Mesh()
    this._pixelIndices = pixelIndices ? pixelIndices.slice() : null
    this._indexWidth = width
    this._indexHeight = height
  }

  /** Records the per-entry patch in `_entryColors` (no GPU write). */
  writePaletteEntry(numId: number, r: number, g: number, b: number): void {
    this._entryColors.set(numId, [r, g, b])
  }

  /** @internal test/introspection: last per-entry color patch, if any. */
  getPaletteEntry(numId: number): [number, number, number] | undefined {
    return this._entryColors.get(numId)
  }

  /** Retains a copy of a `{ palette: Uint32Array }` full-palette replace; ignores everything else. */
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

  /** No-op — this backend has no GPU border VBO. */
  uploadBorderEdges(_buffer: Float32Array, _count: number): void {}

  /** Always `null` — this backend has no GPU border VBO. */
  getBorderVBO(): WebGLBuffer | null {
    return null
  }

  /** No-op — nothing is ever rendered. */
  render(_scene: THREE.Scene, _camera: THREE.Camera): void {}

  /** No-op — there is no drawing buffer to resize. */
  setSize(_width: number, _height: number): void {}

  /** Returns the placeholder scene. */
  getThreeScene(): THREE.Scene {
    return this.scene
  }

  /** Always throws — this backend has no `WebGLRenderer`. */
  getThreeRenderer(): THREE.WebGLRenderer {
    throw new Error('NullRenderBackend: no WebGLRenderer')
  }

  /** Serves the numeric sector ID from the CPU-side index copy; the `0xffff` void sentinel when out of bounds or no copy was supplied. */
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

  /** No-op — this backend has no GPU index texture to recover. */
  reuploadIndexTexture(_mirror: Uint16Array): void {}

  /** Always `null` — this backend has no GPU index texture. */
  getIndexTexture(): THREE.Texture | null {
    return null
  }

  /** No-op — nothing GPU-resident to release. */
  dispose(): void {}
}
