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
 * @deprecated Use `SectorRegistry.adjacency` for neighbor queries. `BorderEdge` retains
 * richer spatial data (exact pixel coordinates of each edge segment) not exposed by
 * `adjacency`. Retained until Dynamic Perimeter Rendering (CA-6) determines whether
 * a more structured perimeter representation supersedes it.
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

/** Minimal cursor-position event shape required by the picking pipeline. */
export interface PickEvent {
  clientX: number
  clientY: number
}

/**
 * Contract for spatial registry implementations and future hierarchical proxies.
 * Overloaded signatures ensure strict return-type consistency per caller ID type.
 */
export interface ISpatialRegistry {
  getBBox(id: string): [number, number, number, number]
  getBBox(id: number): [number, number, number, number]
  getNeighbors(id: string): string[]
  getNeighbors(id: number): number[]
  getCentroid(id: string): [number, number]
  getCentroid(id: number): [number, number]
}

/** Result of a successful pick operation. */
export interface PickResult {
  hexKey: string
  sectorData: SectorData
  pixelX: number
  pixelY: number
}

/** Main → Worker one-time Transferable bootstrap payload (F-3.1). */
export interface BootstrapPayload {
  pixelIndices: Uint32Array
  bboxes: Int16Array
  centroids: Int16Array
  adjacencyPointers: Uint32Array
  adjacencyNeighbors: Uint16Array
  contourPointers: Uint32Array
  contourPoints: Int16Array
  borderEdges: Float32Array
  borderEdgeCount: Uint32Array
  width: number
  height: number
  sectorCount: number
  tickHz: number
}

/** Worker → Main bootstrap round-trip verification scalars (F-3.1). */
export interface BootstrapAckPayload {
  sectorCount: number
  totalEdges: number
  firstSectorBBox: [number, number, number, number]
  lastSectorBBox: [number, number, number, number]
}

/** Identifier for a registered map mode (CA-7). */
export type MapModeId = string

/** Main ↔ Worker message protocol (F-3.1). */
export type WorkerMessage =
  | { type: 'BOOTSTRAP'; payload: BootstrapPayload }
  | { type: 'BOOTSTRAP_ACK'; payload: BootstrapAckPayload }
  | { type: 'CALL'; id: number; method: string; params: unknown }
  | { type: 'RESULT'; id: number; result: unknown; snapshot?: unknown }
  | { type: 'ERROR'; id: number; errorName: string; message: string }
  | { type: 'INIT_GROUPS'; maxGroups: number }
  | { type: 'groupBBoxes'; buffer: Int16Array }
  | { type: 'returnGroupBBoxes'; buffer: Int16Array }
  | { type: 'INIT_ANCHORS'; sectorCount: number }
  | { type: 'anchors'; buffer: Int16Array }
  | { type: 'returnAnchors'; buffer: Int16Array }
