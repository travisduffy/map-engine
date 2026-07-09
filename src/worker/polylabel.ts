import { yieldIfNeeded } from './yield'

/**
 * @internal Pole of Inaccessibility (mapbox `polylabel` behavior, CA-8) over
 * a flat, ring-order-agnostic segment list. Worker-safe: zero DOM / Three.js
 * imports.
 *
 * `segments` is `[x1, y1, x2, y2, ...]` — every boundary edge of the shape
 * (outer ring, hole rings, and/or synthesized map-edge cracks) concatenated
 * with no grouping. Both the point-in-polygon test and the point-to-boundary
 * distance are ring-order-agnostic, so multi-ring shapes (holes) need no
 * ring-separation logic — every segment is treated uniformly.
 */

export interface Pole {
  x: number
  y: number
  distance: number
}

interface Cell {
  x: number
  y: number
  h: number // half-size of this cell
  d: number // signed distance from (x,y) to the nearest boundary segment
  max: number // upper bound on distance achievable anywhere in this cell: d + h*sqrt(2)
}

const SQRT2 = Math.sqrt(2)

/**
 * Signed distance from (px,py) to the nearest of `segments` — positive if
 * inside (crossing-number/ray-cast test), negative if outside. Exported so
 * Task 7.3's fixture acceptance test can assert interiority/clearance using
 * the exact same rule `polylabel` itself converges against, rather than a
 * reimplementation that could subtly diverge (e.g. on a self-intersecting
 * ring).
 */
export function signedDistanceToSegments(
  segments: ArrayLike<number>,
  segCount: number,
  px: number,
  py: number
): number {
  let inside = false
  let minDistSq = Infinity

  for (let i = 0; i < segCount; i++) {
    const o = i * 4
    const ax = segments[o]
    const ay = segments[o + 1]
    const bx = segments[o + 2]
    const by = segments[o + 3]

    // Crossing-number ray-cast (ray in +x direction from (px,py)).
    if (ay > py !== by > py) {
      const xIntersect = ax + ((py - ay) / (by - ay)) * (bx - ax)
      if (px < xIntersect) inside = !inside
    }

    // Point-to-segment squared distance.
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const cx = ax + t * dx
    const cy = ay + t * dy
    const ddx = px - cx
    const ddy = py - cy
    const distSq = ddx * ddx + ddy * ddy
    if (distSq < minDistSq) minDistSq = distSq
  }

  const dist = Math.sqrt(minDistSq)
  return inside ? dist : -dist
}

function makeCell(
  x: number,
  y: number,
  h: number,
  segments: ArrayLike<number>,
  segCount: number
): Cell {
  const d = signedDistanceToSegments(segments, segCount, x, y)
  return { x, y, h, d, max: d + h * SQRT2 }
}

/**
 * Computes the Pole of Inaccessibility for the shape bounded by `segments`.
 *
 * `extraCandidates` (e.g. a per-sector centroid) are evaluated as additional
 * seed cells alongside the mandatory bbox-center seed, which is always
 * evaluated first (mapbox behavior — this pins tie-degenerate shapes, such
 * as rectangles and symmetric multi-pole shapes, to a deterministic result).
 *
 * Yields cooperatively (`yieldIfNeeded`) between priority-queue pops so a
 * single large call can span multiple 8ms slices without blocking the
 * Worker thread — this is load-bearing for sectors with many boundary
 * segments (e.g. a single sector spanning an entire large bitmap).
 */
export async function polylabel(
  segments: ArrayLike<number>,
  segCount: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  precision = 1.0,
  extraCandidates?: Array<[number, number]>,
  yieldState: { lastYield: number } = { lastYield: performance.now() }
): Promise<Pole> {
  const width = maxX - minX
  const height = maxY - minY
  const cellSize = Math.min(width, height)

  if (cellSize === 0) {
    return { x: minX, y: minY, distance: 0 }
  }

  // Bbox-center candidate is evaluated first, unconditionally.
  let best = makeCell(
    minX + width / 2,
    minY + height / 2,
    0,
    segments,
    segCount
  )

  if (extraCandidates) {
    for (const [cx, cy] of extraCandidates) {
      const c = makeCell(cx, cy, 0, segments, segCount)
      if (c.d > best.d) best = c
    }
  }

  // Seed the queue with a coarse grid covering the bbox.
  const h0 = cellSize / 2
  const queue: Cell[] = []
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h0, y + h0, h0, segments, segCount))
    }
  }

  // Max-heap by `max` via a simple array + linear scan (queue sizes here are
  // small per sector-yield-slice, and this stays allocation-light — a binary
  // heap is an option if profiling ever shows this to be a bottleneck).
  let iterCount = 0
  while (queue.length > 0) {
    let bestIdx = 0
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].max > queue[bestIdx].max) bestIdx = i
    }
    const cell = queue[bestIdx]
    queue[bestIdx] = queue[queue.length - 1]
    queue.pop()

    if (cell.d > best.d) best = cell

    // Prune: this cell (and everything smaller inside it) cannot beat `best`
    // by more than `precision`.
    if (cell.max - best.d <= precision) continue

    const h = cell.h / 2
    queue.push(makeCell(cell.x - h, cell.y - h, h, segments, segCount))
    queue.push(makeCell(cell.x + h, cell.y - h, h, segments, segCount))
    queue.push(makeCell(cell.x - h, cell.y + h, h, segments, segCount))
    queue.push(makeCell(cell.x + h, cell.y + h, h, segments, segCount))

    iterCount++
    if (iterCount % 64 === 0) {
      await yieldIfNeeded(yieldState)
    }
  }

  return { x: best.x, y: best.y, distance: best.d }
}
