import * as THREE from 'three'
import type { ThreeRenderBackendInternalAccess } from './IThreeRenderBackend'

/**
 * Renders group-perimeter border segments (CA-6) as a single
 * `THREE.LineSegments` bound to the backend's managed GPU VBO (F-C.9) via a
 * `GLBufferAttribute` -- never the Transferable's CPU array, which is
 * bounced back to the Worker after upload. Lazily constructed by
 * `MapRenderer._receiveBorderEdges` on the first non-empty `recomputeBorders`
 * resolution; disposed alongside `loadMap()`/`dispose()`.
 *
 * `borderEdges` segments are raw pixel coordinates (origin top-left,
 * Y-down); the map mesh is a `PlaneGeometry(mapWidth, mapHeight)` centered
 * at the world origin (Y-up). Scaling by `(1, -1, 1)` then translating by
 * `(-width/2, height/2)` reproduces the same pixel->world mapping as
 * `MapRenderer.project`'s closed-form inverse (`worldX = px - w/2`,
 * `worldY = h/2 - py`) -- three.js applies an `Object3D`'s scale before its
 * position, so this order matters. A small +Z offset keeps the lines from
 * z-fighting against the sector-color plane mesh, which sits at z=0.
 */
export class BorderRenderer {
  readonly lineSegments: THREE.LineSegments
  private readonly _geometry: THREE.BufferGeometry
  private readonly _material: THREE.LineBasicMaterial
  private readonly _positionAttribute: THREE.GLBufferAttribute

  constructor(
    backend: ThreeRenderBackendInternalAccess,
    mapWidth: number,
    mapHeight: number
  ) {
    const gl = backend.getThreeRenderer().getContext()
    const vbo = backend.getBorderVBO()
    if (!vbo) {
      throw new Error(
        'BorderRenderer: backend has no border VBO -- uploadBorderEdges() must be called before constructing BorderRenderer'
      )
    }

    // itemSize 2 (XY only -- WebGL fills the missing Z with its default of
    // 0). A GLBufferAttribute has no CPU-side array, so three.js cannot
    // compute a bounding sphere from it; `frustumCulled = false` below is
    // what avoids that throwing at render time.
    this._positionAttribute = new THREE.GLBufferAttribute(
      vbo,
      gl.FLOAT,
      2,
      4,
      0
    )
    this._geometry = new THREE.BufferGeometry()
    // `@types/three`'s `setAttribute` signature predates `GLBufferAttribute`
    // support (three.js's own runtime accepts it -- see `WebGLBindingStates`)
    // -- go through `unknown` for this one call; `_positionAttribute` above
    // is the properly-typed reference used everywhere else in this class.
    this._geometry.setAttribute(
      'position',
      this._positionAttribute as unknown as THREE.BufferAttribute
    )
    this._geometry.setDrawRange(0, 0)
    // `frustumCulled = false` (below) skips the renderer's frustum-cull
    // bounding-sphere check, but `WebGLRenderer`'s opaque-object Z-sort pass
    // computes `geometry.boundingSphere` unconditionally when it's null,
    // regardless of `frustumCulled` -- and a `GLBufferAttribute` has no
    // CPU-side array to compute one from (throws/warns). Assign a fixed
    // sphere covering the whole map up front so that call is always a
    // no-op; the exact radius doesn't need to track live segment data since
    // frustum culling itself is already disabled.
    this._geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      Math.sqrt(mapWidth * mapWidth + mapHeight * mapHeight) / 2
    )

    // WebGL core line rendering clamps `linewidth` to 1px on most platforms
    // (a long-standing WebGL/ANGLE limitation, not a three.js bug) -- a
    // "thick" fat-line shader is out of scope for this epic. White is
    // chosen so the line is visible regardless of which two sector fill
    // colors border each other (a fixed mid-tone would disappear against a
    // similarly-toned sector, and source bitmaps may already contain their
    // own dark coastline/county-outline art that a black line would blend
    // into -- see the example map).
    this._material = new THREE.LineBasicMaterial({ color: 0xffffff })

    this.lineSegments = new THREE.LineSegments(this._geometry, this._material)
    this.lineSegments.frustumCulled = false
    this.lineSegments.scale.set(1, -1, 1)
    this.lineSegments.position.set(-mapWidth / 2, mapHeight / 2, 0.1)
  }

  /**
   * Updates the draw range to the latest resolved segment count (2 vertices
   * per segment). The `GLBufferAttribute`'s own `count` also gates
   * rendering in three.js -- kept in sync with the draw range here.
   */
  setDrawCount(count: number): void {
    this._geometry.setDrawRange(0, count * 2)
    this._positionAttribute.count = count * 2
  }

  dispose(): void {
    this._geometry.dispose()
    this._material.dispose()
  }
}
