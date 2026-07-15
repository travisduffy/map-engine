import type {
  OrthographicCamera,
  Scene,
  Mesh,
  Texture,
  Camera,
  WebGLRenderer,
} from 'three'

/**
 * Interface isolating `MapRenderer` from Three.js/GPU internals: palette LUT
 * writes, GPU border-VBO uploads, render submission, and resize. Implemented
 * by `ThreeRenderBackend` (real WebGL2) and `NullRenderBackend` (no-op test
 * double).
 */
export interface IThreeRenderBackend {
  /** The backend-owned orthographic camera. */
  readonly camera: OrthographicCamera
  /** The backend-owned scene containing the map plane mesh. */
  readonly scene: Scene
  /** The backend-owned full-map plane mesh — the picking pipeline's raycast target. */
  readonly mesh: Mesh
  /** Patches a single palette LUT entry (Epic 4 B2) — O(1), no bbox/dirty-rect bookkeeping needed. */
  writePaletteEntry(numId: number, r: number, g: number, b: number): void
  /** Uploads the leading `count * 4` floats of `buffer` (border segments, CA-6) into the managed GPU border VBO. */
  uploadBorderEdges(buffer: Float32Array, count: number): void
  /** `{ palette: Uint32Array }` replaces the entire LUT (Epic 4 B2/CA-7). */
  updateUniforms(uniforms: Record<string, unknown>): void
  /** Submits one render of `scene` through `camera`. */
  render(scene: Scene, camera: Camera): void
  /** Resizes the drawing buffer to the given CSS-pixel dimensions. */
  setSize(width: number, height: number): void
  /** Releases the backend's GPU resources (renderer, geometry, material, textures). */
  dispose(): void
}

/**
 * Internal-access surface for collaborators needing raw Three.js/GPU
 * handles — `BorderRenderer`'s VBO binding, the picking pipeline's
 * index-space readback, and context-loss recovery — kept separate from
 * `IThreeRenderBackend` so the public backend contract stays GPU-opaque.
 */
export interface ThreeRenderBackendInternalAccess {
  /** The backend's scene as a concrete `THREE.Scene`. */
  getThreeScene(): Scene
  /** The live `THREE.WebGLRenderer`; a backend with no real GPU context throws instead. */
  getThreeRenderer(): WebGLRenderer
  /** Numeric sector ID at bitmap pixel `(x, y)`; the `0xffff` void sentinel when out of bounds. */
  readSectorIdAt(x: number, y: number): number
  /** Re-uploads the R32UI index texture from a Uint16Array mirror (F-3.3 context-loss recovery). */
  reuploadIndexTexture(mirror: Uint16Array): void
  /** @internal exposed for the Epic 4 palette shader; null on backends with no GPU index texture. */
  getIndexTexture(): Texture | null
  /** @internal exposed so `BorderRenderer` (CA-6) can bind a `GLBufferAttribute` to the managed VBO; null before the first `uploadBorderEdges` call or on backends with no GPU border VBO. */
  getBorderVBO(): WebGLBuffer | null
}
