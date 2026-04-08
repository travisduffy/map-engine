/** User-defined data for a sector (from sectors.json value). */
export type SectorData = { name: string; [key: string]: unknown }

/** The parsed sectors.json top-level object. */
export type SectorDefinitionFile = Record<string, SectorData>

/** Config passed to MapEngine.loadMap(). */
export interface MapConfig {
  bitmapUrl: string
  definitionUrl: string
  canvas: HTMLCanvasElement
}

/**
 * A pixel-boundary edge between two adjacent sectors.
 * @experimental — shape may change in v2
 */
export interface BorderEdge {
  x: number
  y: number
  direction: 'h' | 'v' // 'h' = horizontal scan (right neighbor); 'v' = vertical scan (bottom neighbor)
  sectorA: string // hex key
  sectorB: string // hex key
}

/** Axis-aligned bounding box for a sector (pixel space). */
export interface SectorBBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Result of a successful pick operation. */
export interface PickResult {
  hexKey: string
  sectorData: SectorData
  pixelX: number
  pixelY: number
}
