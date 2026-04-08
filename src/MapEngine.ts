import { SectorBitmapParser } from './SectorBitmapParser'
import type { MapConfig, SectorData, PickResult } from './types'

export class MapEngine {
  private _loaded: boolean = false
  private _destroyed: boolean = false
  private _loading: boolean = false
  private _lastHexKey: string | null = null
  private _parser: SectorBitmapParser
  private _handlers: Map<string, Set<Function>>

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

  loadMap(_config: MapConfig): Promise<void> {
    void this._parser
    void this._loaded
    void this._loading
    void this._lastHexKey
    void this._emit
    throw new Error('Not implemented')
  }

  getSector(_hexKey: string): SectorData | undefined {
    throw new Error('Not implemented')
  }

  setSectorColor(_hexKey: string, _color: string): void {
    throw new Error('Not implemented')
  }

  resetSectorColor(_hexKey: string): void {
    throw new Error('Not implemented')
  }

  destroy(): void {
    throw new Error('Not implemented')
  }
}
