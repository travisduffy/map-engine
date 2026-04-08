import type { SectorRegistry } from './SectorRegistry'

export class MapRenderer {
  constructor(_canvas: HTMLCanvasElement, _registry: SectorRegistry) {
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
