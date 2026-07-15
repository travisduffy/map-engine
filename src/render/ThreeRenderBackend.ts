import * as THREE from 'three'

import { WebGL2NotSupportedError } from '../shared/errors'
import type {
  IThreeRenderBackend,
  ThreeRenderBackendInternalAccess,
} from './IThreeRenderBackend'

/** Void/unknown-pixel sentinel in the numeric sector-ID space (matches `pixelIndices`). */
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

/**
 * Real WebGL2 `IThreeRenderBackend`: a GLSL3 `RawShaderMaterial`
 * fragment-LUT shader samples an R32UI index texture (one sector ID per
 * map pixel) and looks each fragment's color up in an RGBA8 palette
 * texture, so recolors are LUT writes — never a per-pixel CPU pass. Also
 * owns the managed border VBO (CA-6) and the context-loss recovery hooks
 * (F-3.3/F-4.10).
 */
export class ThreeRenderBackend
  implements IThreeRenderBackend, ThreeRenderBackendInternalAccess
{
  /** The orthographic camera, framed to the constructor's frustum half-dimensions. */
  readonly camera: THREE.OrthographicCamera
  /** The scene containing the map plane mesh. */
  readonly scene: THREE.Scene
  /** The full-map plane mesh (`PlaneGeometry(mapWidth, mapHeight)` centered at the world origin) — the picking pipeline's raycast target. */
  readonly mesh: THREE.Mesh
  /** The fragment-LUT `RawShaderMaterial` (exposed for shader-level tests). */
  readonly material: THREE.RawShaderMaterial

  private readonly _renderer: THREE.WebGLRenderer
  private readonly _indexTextureWidth: number
  private readonly _indexTextureHeight: number
  // R32UI one-uint-per-pixel sector-ID texture sampled by the fragment shader.
  private readonly _indexTexture: THREE.DataTexture
  // RGBA8 palette LUT texture; _paletteData is its CPU-side backing store.
  private readonly _paletteTexture: THREE.DataTexture
  private readonly _paletteData: Uint8Array
  private readonly _sectorCount: number
  /** Retained for the picking pipeline (Epic 3 Task 3.4). */
  private readonly _pixelIndicesSnapshot: Uint32Array
  /**
   * Managed GPU VBO for `BorderRenderer`'s `GLBufferAttribute` (CA-6, F-C.9).
   * Allocated at construction/first upload, sized to the fixed max capacity
   * (the caller's buffer length never changes across calls). Destroyed on
   * context loss (`webglcontextlost` nulls this out below) so the next
   * `uploadBorderEdges` reallocates via `gl.bufferData` (F-4.10) instead of
   * writing into a stale handle with `gl.bufferSubData`.
   */
  private _borderVBO: WebGLBuffer | null = null

  /**
   * Acquires the WebGL2 context (throws `WebGL2NotSupportedError` if
   * unavailable), snapshots `pixelIndices` to back the index texture and the
   * picking readback, builds the palette texture from `initialPalette`
   * (wrapping into a 2D layout when `sectorCount` exceeds
   * `MAX_TEXTURE_SIZE`, F-3.4), assembles the shader/mesh/scene/camera, and
   * wires the `webglcontextlost` VBO-drop listener.
   */
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
    // Back the index texture with the Main-resident snapshot, NOT the caller's
    // `pixelIndices`: the bootstrap transfer (MapEngine.loadMap) detaches that
    // buffer, and the render loop is paused until after the transfer — so the
    // texture is never uploaded to the GPU before the detach. Uploading the
    // detached (zero-length) buffer would read id 0 for every texel and paint
    // the whole map sector 0's color. The snapshot is an independent copy taken
    // above (pre-transfer) and shared read-only with the picking pipeline.
    this._indexTexture = new THREE.DataTexture(
      this._pixelIndicesSnapshot,
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

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault()
      // The raw WebGLBuffer is destroyed along with the rest of the GPU
      // context -- three.js has no automatic recovery path for it (unlike
      // its own-managed textures/geometries), so drop the reference here.
      // The next `uploadBorderEdges` call sees `_borderVBO === null` and
      // reallocates via `gl.bufferData` (F-4.10).
      this._borderVBO = null
    })

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

  /** @internal benchmark-harness hook (F-3.4 "API Relationship"). */
  _setPaletteUniformDirect(colors: Uint32Array): void {
    this._writePaletteUniform(colors)
  }

  /** Applies a `{ palette: Uint32Array }` full-palette replace via `_writePaletteUniform`; ignores everything else. */
  updateUniforms(uniforms: Record<string, unknown>): void {
    const palette = uniforms.palette
    if (palette instanceof Uint32Array) {
      this._writePaletteUniform(palette)
    }
  }

  /** Overwrites the index texture's CPU backing store from the Uint16Array mirror and flags it for re-upload (F-3.3 context-loss recovery). */
  reuploadIndexTexture(mirror: Uint16Array): void {
    const data = this._indexTexture.image.data as Uint32Array
    for (let i = 0; i < mirror.length; i++) data[i] = mirror[i]
    this._indexTexture.needsUpdate = true
  }

  /** The live R32UI index `DataTexture` (Epic 4 palette shader). */
  getIndexTexture(): THREE.Texture | null {
    return this._indexTexture
  }

  /**
   * Copies `4*count` floats into the managed GPU VBO via `gl.bufferSubData`.
   * `buffer` is always the fixed-max-capacity pooled array (only the leading
   * `count*4` floats are meaningful — `BorderRenderer`'s draw range clips
   * the rest); the VBO is sized once to that same capacity so steady-state
   * uploads never need `gl.bufferData` again, except immediately after a
   * context loss (see the `webglcontextlost` listener above), which is
   * exactly when `_borderVBO` is `null` here.
   */
  uploadBorderEdges(buffer: Float32Array, count: number): void {
    const gl = this._renderer.getContext()
    if (!this._borderVBO) {
      this._borderVBO = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, this._borderVBO)
      gl.bufferData(gl.ARRAY_BUFFER, buffer.byteLength, gl.DYNAMIC_DRAW)
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._borderVBO)
    }
    const floatsNeeded = count * 4
    if (floatsNeeded > 0) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buffer.subarray(0, floatsNeeded))
    }
  }

  /** The managed border `WebGLBuffer`; `null` before the first `uploadBorderEdges` call and immediately after a context loss. */
  getBorderVBO(): WebGLBuffer | null {
    return this._borderVBO
  }

  /** Submits one render of `scene` through `camera` to the `WebGLRenderer`. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this._renderer.render(scene, camera)
  }

  /** Resizes the drawing buffer to the given CSS-pixel dimensions (without touching the canvas's CSS size). */
  setSize(width: number, height: number): void {
    this._renderer.setSize(width, height, false)
  }

  /** The backend's scene as a concrete `THREE.Scene`. */
  getThreeScene(): THREE.Scene {
    return this.scene
  }

  /** The live `THREE.WebGLRenderer`. */
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

  /** Releases the renderer, plane geometry, shader material, and both textures. */
  dispose(): void {
    this._renderer.dispose()
    ;(this.mesh.geometry as THREE.BufferGeometry).dispose()
    this.material.dispose()
    this._indexTexture.dispose()
    this._paletteTexture.dispose()
  }

  /** Single write path for a full-palette replace (`registerMapMode`/`setMapMode`, Epic 4 CA-7): repacks each 24-bit RGB entry into the LUT backing store and flags the palette texture dirty. */
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
}
