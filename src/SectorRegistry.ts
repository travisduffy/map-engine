import type {
  SectorData,
  SectorDefinitionFile,
  ISpatialRegistry,
} from './types'
import { SectorLimitExceededError } from './types'
import { toHexKey, packRgb } from './utils'

const VOID_ID = 0xffff

export class SectorRegistry implements ISpatialRegistry {
  readonly width: number
  readonly height: number

  // sourceBuffer is null after construction (disposed for memory — PR-1).
  sourceBuffer: Uint8ClampedArray | null

  // SoA per-sector arrays, indexed by dense numeric ID (0..N-1).
  readonly bboxes: Int16Array // sectorCount*4: [minX, minY, maxX, maxY] per sector
  readonly centroids: Int16Array // sectorCount*2: [x, y] per sector (rounded)
  readonly idToHex: string[] // sectorCount: numeric ID → hex string (Main-thread PR-2)

  // Flat pixel-to-sector map.
  readonly pixelIndices: Uint32Array // width*height: pixel flat index → numeric ID or VOID_ID
  readonly pixelIndicesMirror: Uint16Array // width*height: Uint16 downcast for recovery (F-3.3)

  // Binary-search lookup sorted by packed RGB (F-3.1, for Phase 3 Worker pick).
  readonly hexColors: Uint32Array // sectorCount: packed RGB values, sorted ascending
  readonly sectorIds: Uint16Array // sectorCount: numeric ID corresponding to hexColors[i]

  // ID-indexed packed RGB for MapRenderer source-color restoration.
  readonly idToPackedRgb: Uint32Array // sectorCount: numeric ID → packed RGB

  // CSR adjacency.
  readonly adjacencyPointers: Uint32Array // sectorCount+1: CSR row pointers
  readonly adjacencyNeighbors: Uint16Array // totalEdges: CSR column indices

  // CSR contour: border segment endpoints per sector.
  // Segment k for sector id: contourPoints[(contourPointers[id]+k)*4 .. +3] = x1,y1,x2,y2
  readonly contourPointers: Uint32Array // sectorCount+1: CSR row pointers (in segment units)
  readonly contourPoints: Int16Array // totalContourSegs*4: [x1,y1,x2,y2] per segment

  // Pre-allocated border edge buffer for Phase 4 (zero-initialized).
  readonly borderEdges: Float32Array // 4 * totalGeometricPerimeterSegments
  readonly borderEdgeCount: Uint32Array // 1-element transferable counter, init 0

  private readonly _hexToId: Map<string, number>
  private readonly _sectorData: Array<SectorData | null>
  private readonly _sectorPixels: Uint32Array[] // per-sector flat pixel index lists

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

    this.width = width
    this.height = height
    this.sourceBuffer = buffer

    // ── Phase 1: Assign dense numeric IDs from definition ──────────────────

    const defEntries = Object.entries(definition)
    const sectorCount = defEntries.length

    if (sectorCount > 65534) {
      throw new SectorLimitExceededError(sectorCount)
    }

    const hexToId = new Map<string, number>()
    const idToHex: string[] = []
    const sectorData: Array<SectorData | null> = []

    for (const [hexKey, data] of defEntries) {
      hexToId.set(hexKey, idToHex.length)
      idToHex.push(hexKey)
      sectorData.push(data)
    }

    // ── Phase 2: Allocate TypedArrays ─────────────────────────────────────

    const pixelIndices = new Uint32Array(width * height).fill(VOID_ID)

    // Init bboxes: minX/minY = Int16.MAX, maxX/maxY = Int16.MIN
    const bboxes = new Int16Array(sectorCount * 4)
    for (let i = 0; i < sectorCount; i++) {
      bboxes[i * 4] = 32767
      bboxes[i * 4 + 1] = 32767
      bboxes[i * 4 + 2] = -32768
      bboxes[i * 4 + 3] = -32768
    }

    const centSumX = new Float64Array(sectorCount)
    const centSumY = new Float64Array(sectorCount)
    const centCount = new Uint32Array(sectorCount)

    const sectorPixelLists: number[][] = Array.from(
      { length: sectorCount },
      () => []
    )
    const edgePairs = new Set<number>()
    // tempBorderEdges: [x1, y1, x2, y2, idA, idB, ...] per border segment
    const tempBorderEdges: number[] = []
    const contourSegCount = new Uint32Array(sectorCount)
    const bitmapOnlyKeys = new Set<string>()
    let totalGeoPerimeterSegs = 0

    // ── Phase 3: Single O(W×H) scan ────────────────────────────────────────

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const flat = y * width + x
        const offset = flat * 4
        const hex = toHexKey(
          buffer[offset],
          buffer[offset + 1],
          buffer[offset + 2]
        )
        const id = hexToId.get(hex) ?? VOID_ID
        pixelIndices[flat] = id

        if (id !== VOID_ID) {
          // Update bbox
          const base = id * 4
          if (x < bboxes[base]) bboxes[base] = x
          if (y < bboxes[base + 1]) bboxes[base + 1] = y
          if (x > bboxes[base + 2]) bboxes[base + 2] = x
          if (y > bboxes[base + 3]) bboxes[base + 3] = y

          // Accumulate centroid
          centSumX[id] += x
          centSumY[id] += y
          centCount[id]++

          // Accumulate per-sector pixel index
          sectorPixelLists[id].push(flat)
        } else {
          bitmapOnlyKeys.add(hex)
        }

        // Border detection for ALL pixels (right and bottom neighbors only,
        // so each edge is emitted once from the left/top pixel's perspective).
        if (x < width - 1) {
          const rOff = (y * width + x + 1) * 4
          const rId =
            hexToId.get(
              toHexKey(buffer[rOff], buffer[rOff + 1], buffer[rOff + 2])
            ) ?? VOID_ID
          if (rId !== id) {
            // Geometric segment: vertical line at x+1, spanning y to y+1
            tempBorderEdges.push(x + 1, y, x + 1, y + 1, id, rId)
            totalGeoPerimeterSegs++
            if (id !== VOID_ID) contourSegCount[id]++
            if (rId !== VOID_ID) contourSegCount[rId]++
            if (id !== VOID_ID && rId !== VOID_ID) {
              const lo = id < rId ? id : rId
              const hi = id < rId ? rId : id
              edgePairs.add((lo << 16) | hi)
            }
          }
        }

        if (y < height - 1) {
          const bOff = ((y + 1) * width + x) * 4
          const bId =
            hexToId.get(
              toHexKey(buffer[bOff], buffer[bOff + 1], buffer[bOff + 2])
            ) ?? VOID_ID
          if (bId !== id) {
            // Geometric segment: horizontal line at y+1, spanning x to x+1
            tempBorderEdges.push(x, y + 1, x + 1, y + 1, id, bId)
            totalGeoPerimeterSegs++
            if (id !== VOID_ID) contourSegCount[id]++
            if (bId !== VOID_ID) contourSegCount[bId]++
            if (id !== VOID_ID && bId !== VOID_ID) {
              const lo = id < bId ? id : bId
              const hi = id < bId ? bId : id
              edgePairs.add((lo << 16) | hi)
            }
          }
        }
      }
    }

    // ── Phase 4: Post-scan finalization ────────────────────────────────────

    // 4a. Centroids (rounded to nearest pixel)
    const centroids = new Int16Array(sectorCount * 2)
    for (let id = 0; id < sectorCount; id++) {
      if (centCount[id] > 0) {
        centroids[id * 2] = Math.round(centSumX[id] / centCount[id])
        centroids[id * 2 + 1] = Math.round(centSumY[id] / centCount[id])
      }
    }

    // 4b. Dispose sourceBuffer (PR-1 memory mandate), then build Uint16 mirror.
    this.sourceBuffer = null
    const pixelIndicesMirror = new Uint16Array(width * height)
    for (let i = 0, n = width * height; i < n; i++) {
      pixelIndicesMirror[i] = pixelIndices[i] & 0xffff
    }

    // 4c. Build hexColors + sectorIds (sorted by packed RGB for binary search).
    const rawPairs: Array<[number, number]> = [] // [packedRgb, numericId]
    for (let id = 0; id < sectorCount; id++) {
      const h = idToHex[id]
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      rawPairs.push([packRgb(r, g, b), id])
    }
    rawPairs.sort((a, b) => a[0] - b[0])

    const hexColors = new Uint32Array(sectorCount)
    const sectorIds = new Uint16Array(sectorCount)
    const idToPackedRgb = new Uint32Array(sectorCount)
    for (let i = 0; i < sectorCount; i++) {
      hexColors[i] = rawPairs[i][0]
      sectorIds[i] = rawPairs[i][1]
      idToPackedRgb[rawPairs[i][1]] = rawPairs[i][0]
    }

    // 4d. Per-sector pixel arrays (for MapRenderer recoloring)
    const sectorPixels = sectorPixelLists.map(list => new Uint32Array(list))

    // 4e. CSR adjacency — Pass 2: flatten, sort, populate.
    const edgePairsArr = new Uint32Array(edgePairs.size)
    let ei = 0
    for (const pair of edgePairs) edgePairsArr[ei++] = pair
    edgePairsArr.sort() // unsigned Uint32 sort: groups by lo (high 16 bits) first

    const degree = new Uint32Array(sectorCount)
    for (let i = 0; i < edgePairsArr.length; i++) {
      const lo = edgePairsArr[i] >>> 16
      const hi = edgePairsArr[i] & 0xffff
      degree[lo]++
      degree[hi]++
    }

    const adjacencyPointers = new Uint32Array(sectorCount + 1)
    for (let i = 0; i < sectorCount; i++) {
      adjacencyPointers[i + 1] = adjacencyPointers[i] + degree[i]
    }
    const adjacencyNeighbors = new Uint16Array(adjacencyPointers[sectorCount])
    const adjCursor = new Uint32Array(sectorCount)
    for (let i = 0; i < edgePairsArr.length; i++) {
      const lo = edgePairsArr[i] >>> 16
      const hi = edgePairsArr[i] & 0xffff
      adjacencyNeighbors[adjacencyPointers[lo] + adjCursor[lo]++] = hi
      adjacencyNeighbors[adjacencyPointers[hi] + adjCursor[hi]++] = lo
    }

    // 4f. CSR contour — build pointers then fill from tempBorderEdges.
    const contourPointers = new Uint32Array(sectorCount + 1)
    for (let i = 0; i < sectorCount; i++) {
      contourPointers[i + 1] = contourPointers[i] + contourSegCount[i]
    }
    const totalContourSegs = contourPointers[sectorCount]
    const contourPoints = new Int16Array(totalContourSegs * 4)
    const contourCursor = new Uint32Array(sectorCount)

    for (let i = 0; i < tempBorderEdges.length; i += 6) {
      const x1 = tempBorderEdges[i],
        y1 = tempBorderEdges[i + 1]
      const x2 = tempBorderEdges[i + 2],
        y2 = tempBorderEdges[i + 3]
      const idA = tempBorderEdges[i + 4],
        idB = tempBorderEdges[i + 5]
      if (idA !== VOID_ID) {
        const base = (contourPointers[idA] + contourCursor[idA]++) * 4
        contourPoints[base] = x1
        contourPoints[base + 1] = y1
        contourPoints[base + 2] = x2
        contourPoints[base + 3] = y2
      }
      if (idB !== VOID_ID) {
        const base = (contourPointers[idB] + contourCursor[idB]++) * 4
        contourPoints[base] = x1
        contourPoints[base + 1] = y1
        contourPoints[base + 2] = x2
        contourPoints[base + 3] = y2
      }
    }

    // 4g. Border edge allocator (Phase 4 placeholder, zero-initialized).
    const borderEdges = new Float32Array(4 * totalGeoPerimeterSegs)
    const borderEdgeCount = new Uint32Array(1)

    // ── Assign properties ──────────────────────────────────────────────────

    this.bboxes = bboxes
    this.centroids = centroids
    this.idToHex = idToHex
    this.pixelIndices = pixelIndices
    this.pixelIndicesMirror = pixelIndicesMirror
    this.hexColors = hexColors
    this.sectorIds = sectorIds
    this.idToPackedRgb = idToPackedRgb
    this.adjacencyPointers = adjacencyPointers
    this.adjacencyNeighbors = adjacencyNeighbors
    this.contourPointers = contourPointers
    this.contourPoints = contourPoints
    this.borderEdges = borderEdges
    this.borderEdgeCount = borderEdgeCount
    this._hexToId = hexToId
    this._sectorData = sectorData
    this._sectorPixels = sectorPixels

    // ── Load-time validation ───────────────────────────────────────────────

    for (let id = 0; id < sectorCount; id++) {
      if (centCount[id] === 0) {
        console.warn(
          `[MapEngine] Sector '${idToHex[id]}' is defined in sectors.json but has no pixels in the bitmap.`
        )
      }
    }
    for (const hexKey of bitmapOnlyKeys) {
      console.warn(
        `[MapEngine] Color '${hexKey}' found in the bitmap has no corresponding entry in sectors.json.`
      )
    }
  }

  // ── Public accessors ───────────────────────────────────────────────────────

  /** Returns the hex key of the sector at pixel (pixelX, pixelY), or '000000' for void pixels. */
  getSectorAt(pixelX: number, pixelY: number): string {
    const x = Math.floor(pixelX)
    const y = Math.floor(pixelY)
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new Error('getSectorAt: coordinates out of bounds')
    }
    const id = this.pixelIndices[y * this.width + x]
    return id === VOID_ID ? '000000' : this.idToHex[id]
  }

  /** Returns SectorData for the given hex key, or undefined if not in the definition. */
  getSector(hexKey: string): SectorData | undefined {
    const id = this._hexToId.get(hexKey)
    return id !== undefined ? (this._sectorData[id] ?? undefined) : undefined
  }

  /** Returns all hex keys from the definition (includes zero-pixel sectors). */
  getSectorKeys(): string[] {
    return this.idToHex.slice()
  }

  /** Returns the flat pixel-index array for the given sector, or undefined if unknown/zero-pixel. */
  getSectorPixels(hexKey: string): Uint32Array | undefined {
    const id = this._hexToId.get(hexKey)
    if (id === undefined) return undefined
    const pixels = this._sectorPixels[id]
    return pixels.length > 0 ? pixels : undefined
  }

  /** Returns the dense numeric ID for a hex key, or undefined if not in the definition. */
  getNumericId(hexKey: string): number | undefined {
    return this._hexToId.get(hexKey)
  }

  // ── ISpatialRegistry implementation ───────────────────────────────────────

  getBBox(id: string): [number, number, number, number]
  getBBox(id: number): [number, number, number, number]
  getBBox(id: string | number): [number, number, number, number] {
    const numId = typeof id === 'string' ? this._hexToId.get(id) : id
    if (numId === undefined || numId < 0 || numId >= this.idToHex.length) {
      throw new Error(`SectorRegistry: unknown sector '${id}'`)
    }
    const b = numId * 4
    return [
      this.bboxes[b],
      this.bboxes[b + 1],
      this.bboxes[b + 2],
      this.bboxes[b + 3],
    ]
  }

  getCentroid(id: string): [number, number]
  getCentroid(id: number): [number, number]
  getCentroid(id: string | number): [number, number] {
    const numId = typeof id === 'string' ? this._hexToId.get(id) : id
    if (numId === undefined || numId < 0 || numId >= this.idToHex.length) {
      throw new Error(`SectorRegistry: unknown sector '${id}'`)
    }
    return [this.centroids[numId * 2], this.centroids[numId * 2 + 1]]
  }

  getNeighbors(id: string): string[]
  getNeighbors(id: number): number[]
  getNeighbors(id: string | number): string[] | number[] {
    if (typeof id === 'string') {
      const numId = this._hexToId.get(id)
      if (numId === undefined) return []
      const start = this.adjacencyPointers[numId]
      const end = this.adjacencyPointers[numId + 1]
      const result: string[] = []
      for (let i = start; i < end; i++) {
        result.push(this.idToHex[this.adjacencyNeighbors[i]])
      }
      return result
    } else {
      const start = this.adjacencyPointers[id]
      const end = this.adjacencyPointers[id + 1]
      const result: number[] = []
      for (let i = start; i < end; i++) {
        result.push(this.adjacencyNeighbors[i])
      }
      return result
    }
  }
}
