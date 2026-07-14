import * as THREE from 'three'

import type { SectorRegistry } from '../sector/SectorRegistry'
import type { PickEvent, PickResult } from '../shared/types'
import type { MapRenderer } from './MapRenderer'

/**
 * Resolves a pointer event to the sector beneath it (Epic 3 picking pipeline):
 * NDC conversion -> raycast against the map mesh -> UV -> clamped, Y-inverted
 * bitmap pixel -> numeric sector id -> hex key. Constructed once per loaded map
 * with the live renderer/registry/canvas it reads; dropped when the session
 * tears down.
 *
 * Backs both the synchronous hover/click event pipeline (`handlePointer`) and
 * `MapEngine.pick()` (`pick`), emitting `sectorHover`/`sectorClick` through the
 * injected `emit` callback. Hover/click suppression during pan/drag lives here,
 * reading the renderer's live gesture flags.
 */
export class PointerPickResolver {
  private readonly _renderer: MapRenderer
  private readonly _registry: SectorRegistry
  private readonly _canvas: HTMLCanvasElement
  private readonly _emit: (event: string, payload: unknown) => void
  private readonly _raycaster: THREE.Raycaster
  /** Hex key last emitted as a hover, so `sectorHover` fires only on a change of sector. */
  private _lastHexKey: string | null = null

  /** Captures the live renderer/registry/canvas the pick pipeline reads and the `emit` callback for `sectorHover`/`sectorClick`, and allocates the reusable raycaster. */
  constructor(
    renderer: MapRenderer,
    registry: SectorRegistry,
    canvas: HTMLCanvasElement,
    emit: (event: string, payload: unknown) => void
  ) {
    this._renderer = renderer
    this._registry = registry
    this._canvas = canvas
    this._emit = emit
    this._raycaster = new THREE.Raycaster()
  }

  /**
   * Resolves the sector under `point` for `MapEngine.pick()`. Returns `null`
   * on a mesh-miss (ray missed the map plane) or a void/unknown pixel.
   */
  pick(point: PickEvent): PickResult | null {
    const coords = this._resolvePixelCoords(point)
    if (!coords) return null
    return this._resolveHexPick(coords.pixelX, coords.pixelY)
  }

  /**
   * Handles a hover (`isClick === false`) or click (`isClick === true`) pointer
   * event: resolves the sector and emits `sectorHover`/`sectorClick` as
   * warranted. Hover emits only on a change of sector and is suppressed during
   * middle-button pan or left-button drag; the synthesized click that follows a
   * left-button drag is suppressed.
   */
  handlePointer(event: PickEvent, isClick: boolean): void {
    const coords = this._resolvePixelCoords(event)
    const result = coords
      ? this._resolveHexPick(coords.pixelX, coords.pixelY)
      : null

    if (result === null) {
      if (!isClick && this._lastHexKey !== null) {
        this._lastHexKey = null
        this._emit('sectorHover', null)
      }
      return
    }

    if (!isClick) {
      // Suppress hover during middle-button pan OR left-button drag.
      if (this._renderer.isPanning || this._renderer.isLeftDragging) return
      if (result.hexKey !== this._lastHexKey) {
        this._lastHexKey = result.hexKey
        this._emit('sectorHover', result)
      }
    } else {
      // Suppress synthesized click that follows a left-button drag.
      if (this._renderer.leftHasDragged) return
      this._emit('sectorClick', result)
    }
  }

  /**
   * NDC conversion -> raycast -> UV -> clamped, Y-inverted bitmap pixel coords.
   * Returns `null` on a mesh-miss (ray did not hit the map plane).
   */
  private _resolvePixelCoords(
    event: PickEvent
  ): { pixelX: number; pixelY: number } | null {
    const rect = this._canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )

    this._raycaster.setFromCamera(ndc, this._renderer.camera)
    const intersections = this._raycaster.intersectObject(this._renderer.mesh)
    if (intersections.length === 0) return null

    const uv = intersections[0].uv!
    const width = this._registry.width
    const height = this._registry.height
    const pixelX = Math.max(0, Math.min(width - 1, Math.floor(uv.x * width)))
    const pixelY = Math.max(
      0,
      Math.min(height - 1, Math.floor((1 - uv.y) * height))
    )
    return { pixelX, pixelY }
  }

  /** Resolves a bitmap pixel + numeric id into a `PickResult`, or `null` on a void/unknown sector. */
  private _resolveHexPick(pixelX: number, pixelY: number): PickResult | null {
    const numId = this._renderer.readSectorIdAt(pixelX, pixelY)
    if (numId >= this._registry.idToHex.length) return null
    const hexKey = this._registry.idToHex[numId]
    const sectorData = this._registry.getSector(hexKey)
    if (sectorData === undefined) return null
    return { hexKey, sectorData, pixelX, pixelY }
  }
}
