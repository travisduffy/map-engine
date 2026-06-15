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
  readonly texture: Texture
  uploadTexture(tex: Texture): void
  uploadBorderEdges(buffer: Float32Array, count: number): void
  updateUniforms(uniforms: Record<string, unknown>): void
  render(scene: Scene, camera: Camera): void
  setSize(width: number, height: number): void
  dispose(): void
}

export interface ThreeRenderBackendInternalAccess {
  getThreeScene(): Scene
  getThreeRenderer(): WebGLRenderer
  readSectorIdAt(x: number, y: number): number
}
