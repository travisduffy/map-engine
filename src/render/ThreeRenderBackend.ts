import * as THREE from 'three'
import type {
  IThreeRenderBackend,
  ThreeRenderBackendInternalAccess,
} from './IThreeRenderBackend'
import { WebGL2NotSupportedError } from '../errors'

const VOID_ID = 0xffff

// GLSL ES 3.00 (WebGL2) — fragment-LUT palette shader (Epic 4 B2).
// `texelFetch` (raw integer texel indexing) is used for both textures so
// neither the index texture's uint row order nor the palette's row order is
// affected by any implicit UV/flipY convention.
const VERTEX_SHADER = /* glsl */ `
in vec3 position;
in vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D indexTex;
uniform sampler2D paletteTex;
uniform int sectorCount;
uniform int paletteWidth;
in vec2 vUv;
out vec4 fragColor;

void main() {
  ivec2 size = textureSize(indexTex, 0);
  int ix = int(vUv.x * float(size.x));
  int iy = int((1.0 - vUv.y) * float(size.y));
  ix = clamp(ix, 0, size.x - 1);
  iy = clamp(iy, 0, size.y - 1);
  uint id = texelFetch(indexTex, ivec2(ix, iy), 0).r;
  if (id == ${VOID_ID}u || int(id) >= sectorCount) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  int px = int(id) % paletteWidth;
  int py = int(id) / paletteWidth;
  fragColor = texelFetch(paletteTex, ivec2(px, py), 0);
}
`

export class ThreeRenderBackend
  implements IThreeRenderBackend, ThreeRenderBackendInternalAccess
{
  readonly camera: THREE.OrthographicCamera
  readonly scene: THREE.Scene
  readonly mesh: THREE.Mesh
  readonly material: THREE.RawShaderMaterial

  private readonly _renderer: THREE.WebGLRenderer
  private readonly _indexTextureWidth: number
  private readonly _indexTextureHeight: number
  private readonly _indexTexture: THREE.DataTexture
  private readonly _paletteTexture: THREE.DataTexture
  private readonly _paletteData: Uint8Array
  private readonly _sectorCount: number
  /** Retained for the picking pipeline (Epic 3 Task 3.4). */
  private readonly _pixelIndicesSnapshot: Uint32Array

  constructor(
    canvas: HTMLCanvasElement,
    frustumHalfW: number,
    frustumHalfH: number,
    mapWidth: number,
    mapHeight: number,
    pixelIndices: Uint32Array,
    sectorCount: number,
    initialPalette: Uint32Array
  ) {
    const gl = canvas.getContext('webgl2')
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new WebGL2NotSupportedError()
    }
    this._sectorCount = sectorCount
    this._pixelIndicesSnapshot = pixelIndices.slice()

    this._renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as unknown as WebGLRenderingContext,
      antialias: false,
    })
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    this._indexTextureWidth = mapWidth
    this._indexTextureHeight = mapHeight
    this._indexTexture = new THREE.DataTexture(
      pixelIndices,
      mapWidth,
      mapHeight,
      THREE.RedIntegerFormat,
      THREE.UnsignedIntType
    )
    this._indexTexture.minFilter = THREE.NearestFilter
    this._indexTexture.magFilter = THREE.NearestFilter
    this._indexTexture.generateMipmaps = false
    this._indexTexture.flipY = false
    this._indexTexture.needsUpdate = true

    canvas.addEventListener('webglcontextlost', e => e.preventDefault())

    // Texture-width guard (F-3.4): sectorCount can reach 65,535, which may
    // exceed MAX_TEXTURE_SIZE on integrated/mobile GPUs — wrap into a 2D
    // layout rather than assuming a flat sectorCount×1 row always fits.
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    const paletteWidth = Math.max(1, Math.min(sectorCount, maxTextureSize))
    const paletteHeight = Math.max(1, Math.ceil(sectorCount / paletteWidth))

    const paletteData = new Uint8Array(paletteWidth * paletteHeight * 4)
    for (let id = 0; id < sectorCount; id++) {
      const packed = initialPalette[id]
      const o = id * 4
      paletteData[o] = (packed >>> 16) & 0xff
      paletteData[o + 1] = (packed >>> 8) & 0xff
      paletteData[o + 2] = packed & 0xff
      paletteData[o + 3] = 255
    }
    this._paletteData = paletteData
    this._paletteTexture = new THREE.DataTexture(
      paletteData,
      paletteWidth,
      paletteHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )
    this._paletteTexture.minFilter = THREE.NearestFilter
    this._paletteTexture.magFilter = THREE.NearestFilter
    this._paletteTexture.generateMipmaps = false
    this._paletteTexture.flipY = false
    this._paletteTexture.needsUpdate = true

    this.scene = new THREE.Scene()

    const geometry = new THREE.PlaneGeometry(mapWidth, mapHeight)
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        indexTex: { value: this._indexTexture },
        paletteTex: { value: this._paletteTexture },
        sectorCount: { value: sectorCount },
        paletteWidth: { value: paletteWidth },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.mesh)

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

  /** O(1) — patches one LUT entry and flags the (small) palette texture dirty. */
  writePaletteEntry(numId: number, r: number, g: number, b: number): void {
    const o = numId * 4
    this._paletteData[o] = r
    this._paletteData[o + 1] = g
    this._paletteData[o + 2] = b
    this._paletteData[o + 3] = 255
    this._paletteTexture.needsUpdate = true
  }

  /** Single write path for a full-palette replace (`registerMapMode`/`setMapMode`, Epic 4 CA-7). */
  private _writePaletteUniform(colors: Uint32Array): void {
    const n = Math.min(colors.length, this._sectorCount)
    for (let id = 0; id < n; id++) {
      const packed = colors[id]
      const o = id * 4
      this._paletteData[o] = (packed >>> 16) & 0xff
      this._paletteData[o + 1] = (packed >>> 8) & 0xff
      this._paletteData[o + 2] = packed & 0xff
      this._paletteData[o + 3] = 255
    }
    this._paletteTexture.needsUpdate = true
  }

  /** @internal benchmark-harness hook (F-3.4 "API Relationship"). */
  _setPaletteUniformDirect(colors: Uint32Array): void {
    this._writePaletteUniform(colors)
  }

  updateUniforms(uniforms: Record<string, unknown>): void {
    const palette = uniforms.palette
    if (palette instanceof Uint32Array) {
      this._writePaletteUniform(palette)
    }
  }

  reuploadIndexTexture(mirror: Uint16Array): void {
    const data = this._indexTexture.image.data as Uint32Array
    for (let i = 0; i < mirror.length; i++) data[i] = mirror[i]
    this._indexTexture.needsUpdate = true
  }

  getIndexTexture(): THREE.Texture | null {
    return this._indexTexture
  }

  uploadBorderEdges(_buffer: Float32Array, _count: number): void {}

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

  /**
   * `x`/`y` are bitmap/texture pixel coordinates (0..width-1 / 0..height-1).
   * Sourced from the retained `pixelIndices` snapshot — cheaper than a GPU
   * framebuffer readback and equally authoritative (PR-3, Epic 3 Task 3.4).
   */
  readSectorIdAt(x: number, y: number): number {
    if (
      x < 0 ||
      y < 0 ||
      x >= this._indexTextureWidth ||
      y >= this._indexTextureHeight
    ) {
      return 0xffff
    }
    return this._pixelIndicesSnapshot[y * this._indexTextureWidth + x]
  }

  dispose(): void {
    this._renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
    this._indexTexture.dispose()
    this._paletteTexture.dispose()
  }
}
