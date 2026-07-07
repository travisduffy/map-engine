import type {
  OrthographicCamera,
  Scene,
  Mesh,
  Texture,
  Camera,
  WebGLRenderer,
} from 'three'

export interface IThreeRenderBackend {
  readonly camera: OrthographicCamera
  readonly scene: Scene
  readonly mesh: Mesh
  /** Patches a single palette LUT entry (Epic 4 B2) — O(1), no bbox/dirty-rect bookkeeping needed. */
  writePaletteEntry(numId: number, r: number, g: number, b: number): void
  uploadBorderEdges(buffer: Float32Array, count: number): void
  /** `{ palette: Uint32Array }` replaces the entire LUT (Epic 4 B2/CA-7). */
  updateUniforms(uniforms: Record<string, unknown>): void
  render(scene: Scene, camera: Camera): void
  setSize(width: number, height: number): void
  dispose(): void
}

export interface ThreeRenderBackendInternalAccess {
  getThreeScene(): Scene
  getThreeRenderer(): WebGLRenderer
  readSectorIdAt(x: number, y: number): number
  /** Re-uploads the R32UI index texture from a Uint16Array mirror (F-3.3 context-loss recovery). */
  reuploadIndexTexture(mirror: Uint16Array): void
  /** @internal exposed for the Epic 4 palette shader; null on backends with no GPU index texture. */
  getIndexTexture(): Texture | null
}
