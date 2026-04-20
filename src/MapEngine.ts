import * as THREE from 'three'
import { SectorBitmapParser } from './SectorBitmapParser'
import { SectorRegistry } from './SectorRegistry'
import { MapRenderer } from './MapRenderer'
import type { MapConfig, SectorData, PickResult, FrameCallback } from './types'
import { parseColorToRgb } from './internal/color'

export class MapEngine {
  private _loaded: boolean = false
  private _destroyed: boolean = false
  private _loading: boolean = false
  private _lastHexKey: string | null = null
  private _parser: SectorBitmapParser
  private _handlers: Map<string, Set<Function>>
  private _canvas: HTMLCanvasElement | null = null
  private _registry: SectorRegistry | null = null
  private _renderer: MapRenderer | null = null
  private _boundPointerMove: ((e: PointerEvent) => void) | null = null
  private _boundClick: ((e: MouseEvent) => void) | null = null
  private readonly _raycaster: THREE.Raycaster
  private _frameCallbacks: FrameCallback[] = []
  private _inTick: boolean = false

  constructor() {
    this._parser = new SectorBitmapParser()
    this._handlers = new Map<string, Set<Function>>()
    this._raycaster = new THREE.Raycaster()
  }

  on(event: 'sectorClick', handler: (result: PickResult) => void): void
  on(event: 'sectorHover', handler: (result: PickResult | null) => void): void
  on(_event: string, _handler: Function): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    const event = _event
    const handler = _handler
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set())
    }
    this._handlers.get(event)!.add(handler)
  }

  off(_event: 'sectorClick' | 'sectorHover', _handler: Function): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    const set = this._handlers.get(_event)
    if (set) set.delete(_handler)
  }

  onFrame(callback: FrameCallback): void {
    if (this._destroyed) return
    this._frameCallbacks.push(callback)
  }

  offFrame(callback: FrameCallback): void {
    if (this._destroyed) return
    const idx = this._frameCallbacks.indexOf(callback)
    if (idx !== -1) this._frameCallbacks.splice(idx, 1)
  }

  private _emit(event: string, payload: unknown): void {
    const set = this._handlers.get(event)
    if (set) {
      for (const handler of set) {
        handler(payload)
      }
    }
  }

  private _handlePointerEvent(event: MouseEvent, isClick: boolean): void {
    if (!this._renderer || !this._registry || !this._canvas) return

    // Step 1: NDC conversion via getBoundingClientRect()
    const rect = this._canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )

    // Step 2: Raycast
    this._raycaster.setFromCamera(ndc, this._renderer.camera)
    const intersections = this._raycaster.intersectObject(this._renderer.mesh)

    // Step 3: Miss — ray did not hit the map plane
    if (intersections.length === 0) {
      if (!isClick && this._lastHexKey !== null) {
        this._lastHexKey = null
        this._emit('sectorHover', null)
      }
      return
    }

    // Step 4: UV → clamped pixel coords (mandatory Y-inversion)
    const uv = intersections[0].uv!
    const width = this._registry.width
    const height = this._registry.height
    const pixelX = Math.max(0, Math.min(width - 1, Math.floor(uv.x * width)))
    const pixelY = Math.max(
      0,
      Math.min(height - 1, Math.floor((1 - uv.y) * height))
    )

    // Step 5: getSectorAt → hex key
    const hexKey = this._registry.getSectorAt(pixelX, pixelY)

    // Step 6: getSector → SectorData | undefined
    const sectorData = this._registry.getSector(hexKey)

    // Step 7: undefined means bitmap-only color — treat as miss
    if (sectorData === undefined) {
      if (!isClick && this._lastHexKey !== null) {
        this._lastHexKey = null
        this._emit('sectorHover', null)
      }
      return
    }

    // Step 8: construct PickResult and emit
    const result: PickResult = { hexKey, sectorData, pixelX, pixelY }

    if (!isClick) {
      // Suppress hover during middle-button pan OR left-button drag.
      if (this._renderer!.isPanning || this._renderer!.isLeftDragging) return
      if (hexKey !== this._lastHexKey) {
        this._lastHexKey = hexKey
        this._emit('sectorHover', result)
      }
    } else {
      // Suppress synthesized click that follows a left-button drag.
      if (this._renderer!.leftHasDragged) return
      this._emit('sectorClick', result)
    }
  }

  async loadMap(config: MapConfig): Promise<void> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (this._loaded)
      throw new Error(
        'MapEngine: already loaded — call destroy() before loading a new map'
      )
    if (this._loading)
      throw new Error('MapEngine: loadMap() is already in progress')

    this._loading = true

    try {
      const [{ buffer, width, height }, definition] = await Promise.all([
        this._parser.parse(config.bitmapUrl),
        fetch(config.definitionUrl).then(r => {
          if (!r.ok)
            throw new Error(
              `Failed to load definition: HTTP ${r.status} ${r.statusText}`
            )
          return r.json()
        }),
      ])

      const registry = new SectorRegistry(buffer, width, height, definition)
      let renderer: MapRenderer
      const hook = (): void => {
        const now = performance.now()
        const dt =
          renderer._lastFrameTime === -1
            ? 0
            : (now - renderer._lastFrameTime) / 1000
        renderer._lastFrameTime = now
        this._inTick = true
        try {
          for (const cb of [...this._frameCallbacks]) {
            try {
              cb(dt)
            } catch (err) {
              console.error('[map-engine] FrameCallback threw:', err)
            }
          }
        } finally {
          this._inTick = false
          renderer._flushPendingDirty()
        }
      }
      renderer = new MapRenderer(config.canvas, registry, hook)

      this._canvas = config.canvas
      this._registry = registry
      this._renderer = renderer

      this._boundPointerMove = (e: PointerEvent) =>
        this._handlePointerEvent(e, false)
      this._boundClick = (e: MouseEvent) => this._handlePointerEvent(e, true)
      this._canvas.addEventListener('pointermove', this._boundPointerMove)
      this._canvas.addEventListener('click', this._boundClick)

      this._loaded = true
      this._loading = false
    } catch (err) {
      this._loading = false
      throw err
    }
  }

  destroy(): void {
    // Step 1: idempotent — never throws
    if (this._destroyed) return

    // Step 0 (new): clear frame callbacks
    this._frameCallbacks = []
    // Step 1 (new): clear pending dirty rect before renderer.destroy() disposes the canvas context
    if (this._renderer) this._renderer._pendingDirtyRect = null
    // Step 2: destroy renderer (disposes rAF, geometry, material, texture, MapRenderer listeners)
    if (this._renderer) {
      this._renderer.destroy()
    }

    // Step 3: remove MapEngine-owned canvas listeners (picking)
    if (this._canvas) {
      if (this._boundPointerMove)
        this._canvas.removeEventListener('pointermove', this._boundPointerMove)
      if (this._boundClick)
        this._canvas.removeEventListener('click', this._boundClick)
    }

    // Step 4: clear event handler map
    this._handlers.clear()

    // Step 5: null out refs
    this._registry = null
    this._renderer = null
    this._canvas = null
    this._boundPointerMove = null
    this._boundClick = null
    this._loading = false

    // Steps 6–7: conditionally mark destroyed
    if (this._loaded) {
      this._destroyed = true
    }
    // If _loaded === false (partial failure), do NOT set _destroyed — allow retry via loadMap()
  }

  get renderer(): MapRenderer {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._renderer!
  }

  get registry(): SectorRegistry {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!
  }

  getSector(hexKey: string): SectorData | undefined {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getSector(hexKey)
  }

  getSectorKeys(): string[] {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getSectorKeys()
  }

  setSectorColor(hexKey: string, color: string): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    const { r, g, b } = parseColorToRgb(color) // eslint-disable-line @typescript-eslint/no-unused-vars
    if (this._inTick) {
      this._renderer!._patchSectorPixels(hexKey, r, g, b)
    } else {
      this._renderer!.setSectorColor(hexKey, color)
    }
  }

  resetSectorColor(hexKey: string): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (this._inTick) {
      this._renderer!._patchSectorPixelsFromSource(hexKey)
    } else {
      this._renderer!.resetSectorColor(hexKey)
    }
  }

  getNeighbors(hexKey: string): ReadonlySet<string> | undefined {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.adjacency.get(hexKey)
  }
}
