import type { MapConfig, SectorData, PickResult } from './types'

export class MapEngine {
  loadMap(_config: MapConfig): Promise<void> {
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

  on(event: 'sectorClick', handler: (result: PickResult) => void): void
  on(event: 'sectorHover', handler: (result: PickResult | null) => void): void
  on(_event: string, _handler: Function): void {
    throw new Error('Not implemented')
  }

  off(_event: 'sectorClick' | 'sectorHover', _handler: Function): void {
    throw new Error('Not implemented')
  }

  destroy(): void {
    throw new Error('Not implemented')
  }
}
