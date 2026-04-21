import type {
  SectorData,
  SectorDefinitionFile,
  SectorBBox,
  BorderEdge,
} from './types'
import { toHexKey } from './utils'

export class SectorRegistry {
  readonly sourceBuffer: Uint8ClampedArray
  readonly width: number
  readonly height: number
  readonly bboxes: Map<string, SectorBBox>
  readonly centroids: Map<string, { x: number; y: number }>
  readonly pixelIndices: Map<string, Uint32Array>
  /**
   * @deprecated Use `adjacency` for neighbor queries. `borderEdges` retains richer
   * spatial data (exact pixel coordinates of each edge segment) that `adjacency` does
   * not expose. Retained until Dynamic Perimeter Rendering (CA-6) determines whether
   * a more structured perimeter representation supersedes it.
   * @experimental
   */
  readonly borderEdges: BorderEdge[]
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>

  private _sectorMap: Map<string, SectorData>

  constructor(
    buffer: Uint8ClampedArray,
    width: number,
    height: number,
    definition: SectorDefinitionFile
  ) {
    if (buffer.length !== width * height * 4) {
      throw new Error(
        `SectorRegistry: buffer length ${buffer.length} does not match ${width}×${height}×4 = ${width * height * 4}`
      )
    }

    this.sourceBuffer = buffer
    this.width = width
    this.height = height

    // Pre-populate sector map from definition (includes zero-pixel sectors)
    this._sectorMap = new Map<string, SectorData>()
    for (const [hexKey, sectorData] of Object.entries(definition)) {
      this._sectorMap.set(hexKey, sectorData)
    }

    this.bboxes = new Map<string, SectorBBox>()
    this.borderEdges = []

    const adjacencyMutable = new Map<string, Set<string>>()
    for (const hexKey of this._sectorMap.keys()) {
      adjacencyMutable.set(hexKey, new Set<string>())
    }

    // Per-sector accumulators
    const centroidSums = new Map<
      string,
      { sumX: number; sumY: number; count: number }
    >()
    const pixelIndexArrays = new Map<string, number[]>()
    // Tracks bitmap hex keys with no definition entry (for load-time validation)
    const bitmapOnlyKeys = new Set<string>()

    // Single O(W×H) scan pass — builds all structures in one traversal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const hexKey = toHexKey(
          buffer[offset],
          buffer[offset + 1],
          buffer[offset + 2]
        )

        // Spatial structures only for definition-registered sectors
        if (this._sectorMap.has(hexKey)) {
          // Update bounding box
          const bbox = this.bboxes.get(hexKey)
          if (bbox === undefined) {
            this.bboxes.set(hexKey, { minX: x, minY: y, maxX: x, maxY: y })
          } else {
            if (x < bbox.minX) bbox.minX = x
            if (y < bbox.minY) bbox.minY = y
            if (x > bbox.maxX) bbox.maxX = x
            if (y > bbox.maxY) bbox.maxY = y
          }

          // Accumulate centroid
          const cs = centroidSums.get(hexKey)
          if (cs === undefined) {
            centroidSums.set(hexKey, { sumX: x, sumY: y, count: 1 })
          } else {
            cs.sumX += x
            cs.sumY += y
            cs.count++
          }

          // Accumulate flat pixel index
          const flat = y * width + x
          const indices = pixelIndexArrays.get(hexKey)
          if (indices === undefined) {
            pixelIndexArrays.set(hexKey, [flat])
          } else {
            indices.push(flat)
          }
        } else {
          bitmapOnlyKeys.add(hexKey)
        }

        // Border edges + adjacency: check neighbors for every pixel
        const isDefinedSector = this._sectorMap.has(hexKey)

        if (x < width - 1) {
          const rOff = (y * width + (x + 1)) * 4
          const rHex = toHexKey(
            buffer[rOff],
            buffer[rOff + 1],
            buffer[rOff + 2]
          )
          if (rHex !== hexKey) {
            this.borderEdges.push({
              x,
              y,
              direction: 'h',
              sectorA: hexKey,
              sectorB: rHex,
            })
            if (isDefinedSector && adjacencyMutable.has(rHex)) {
              adjacencyMutable.get(hexKey)!.add(rHex)
              adjacencyMutable.get(rHex)!.add(hexKey)
            }
          }
        }

        if (y < height - 1) {
          const bOff = ((y + 1) * width + x) * 4
          const bHex = toHexKey(
            buffer[bOff],
            buffer[bOff + 1],
            buffer[bOff + 2]
          )
          if (bHex !== hexKey) {
            this.borderEdges.push({
              x,
              y,
              direction: 'v',
              sectorA: hexKey,
              sectorB: bHex,
            })
            if (isDefinedSector && adjacencyMutable.has(bHex)) {
              adjacencyMutable.get(hexKey)!.add(bHex)
              adjacencyMutable.get(bHex)!.add(hexKey)
            }
          }
        }
      }
    }

    // Finalize centroids
    const centroidsMap = new Map<string, { x: number; y: number }>()
    for (const [key, { sumX, sumY, count }] of centroidSums) {
      centroidsMap.set(key, { x: sumX / count, y: sumY / count })
    }
    this.centroids = centroidsMap

    // Convert pixel index arrays to sorted Uint32Arrays
    const pixelIndicesMap = new Map<string, Uint32Array>()
    for (const [key, indices] of pixelIndexArrays) {
      indices.sort((a, b) => a - b)
      pixelIndicesMap.set(key, new Uint32Array(indices))
    }
    this.pixelIndices = pixelIndicesMap

    this.adjacency = adjacencyMutable as ReadonlyMap<
      string,
      ReadonlySet<string>
    >

    // Load-time validation — warn but never throw
    for (const hexKey of this._sectorMap.keys()) {
      if (!this.bboxes.has(hexKey)) {
        console.warn(
          `[MapEngine] Sector '${hexKey}' is defined in sectors.json but has no pixels in the bitmap.`
        )
      }
    }
    for (const hexKey of bitmapOnlyKeys) {
      console.warn(
        `[MapEngine] Color '${hexKey}' found in the bitmap has no corresponding entry in sectors.json.`
      )
    }
  }

  /** Returns the hex key of the sector at the given pixel coordinates. */
  getSectorAt(pixelX: number, pixelY: number): string {
    const x = Math.floor(pixelX)
    const y = Math.floor(pixelY)
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new Error('getSectorAt: coordinates out of bounds')
    }
    const offset = (y * this.width + x) * 4
    return toHexKey(
      this.sourceBuffer[offset],
      this.sourceBuffer[offset + 1],
      this.sourceBuffer[offset + 2]
    )
  }

  /** Returns the SectorData for the given hex key, or undefined if not found. */
  getSector(hexKey: string): SectorData | undefined {
    return this._sectorMap.get(hexKey)
  }

  /** Returns all hex keys in the sector map (definition keys only; bitmap-only colors excluded). */
  getSectorKeys(): string[] {
    return Array.from(this._sectorMap.keys())
  }
}
