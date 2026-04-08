import { SectorBitmapParser } from './SectorBitmapParser'
import { SectorRegistry } from './SectorRegistry'
import { MapRenderer } from './MapRenderer'
import type { MapConfig, SectorData, PickResult } from './types'

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

  constructor() {
    this._parser = new SectorBitmapParser()
    this._handlers = new Map<string, Set<Function>>()
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

  private _emit(event: string, payload: unknown): void {
    const set = this._handlers.get(event)
    if (set) {
      for (const handler of set) {
        handler(payload)
      }
    }
  }

  // Picking logic implemented in Task 3.3
  private _handlePointerEvent(_event: MouseEvent, _isClick: boolean): void {
    void this._lastHexKey
    void this._emit
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
      const renderer = new MapRenderer(config.canvas, registry)

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
    this._renderer!.setSectorColor(hexKey, color)
  }

  resetSectorColor(hexKey: string): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    this._renderer!.resetSectorColor(hexKey)
  }
}
