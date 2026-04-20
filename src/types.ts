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
 * @experimental — shape may change in a future version
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

// elapsed is the 1-indexed count of ticks fired since this GameClock was constructed,
// including the current one. The first tick's callback receives elapsed === 1.
export type ClockTickCallback = (elapsed: number) => void

// dt is elapsed wall-clock seconds since the previous frame (e.g. 0.01667 at 60fps).
// On the very first rAF frame after loadMap() completes, dt === 0.
// On all subsequent frames, dt is elapsed wall-clock seconds since the previous frame,
// regardless of when a given callback was registered via onFrame.
export type FrameCallback = (dt: number) => void

/** Result of a successful pick operation. */
export interface PickResult {
  hexKey: string
  sectorData: SectorData
  pixelX: number
  pixelY: number
}
