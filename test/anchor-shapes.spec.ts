import { describe, it, expect } from 'vitest'
import { polylabel, signedDistanceToSegments } from '../src/worker/polylabel'

interface AnchorFixture {
  id: string
  type: string
  points: number[][]
  expectedAnchor: number[]
}

// Per the Epic 7 Task 7.3 BDFL ruling: `expectedAnchor` is NOT authoritative
// (13/20 checked-in values contradict the polylabel definition -- verified
// during sprint hardening) and is intentionally never read below. Acceptance
// is re-specified as interiority + clearance-optimality against an
// independent reference, not coordinate equality.
const fixtures: AnchorFixture[] = await fetch(
  '/test/fixtures/anchor-shapes.json'
).then(r => r.json())

/**
 * Parses a fixture's `points` into one or more closed rings and returns a
 * flat [x1,y1,x2,y2,...] segment array. The file uses two conventions: the 6
 * multi-ring fixtures (annulus-*, multi-pole-*) close each ring explicitly
 * by repeating its first vertex, with rings back-to-back; the 14 single-ring
 * fixtures don't repeat the first vertex (the ring is open and must be
 * closed implicitly, last vertex -> first). This walks the point list once,
 * detecting an explicit closure (a vertex equal to the *current* ring's
 * first vertex) at each step; a ring that never repeats its start closes
 * implicitly at the end of the list.
 */
function parseRingsToSegments(points: number[][]): Float64Array {
  const segs: number[] = []
  let ringStart = 0

  while (ringStart < points.length) {
    const [sx, sy] = points[ringStart]
    let ringEnd = -1
    for (let i = ringStart + 1; i < points.length; i++) {
      if (points[i][0] === sx && points[i][1] === sy) {
        ringEnd = i
        break
      }
    }

    if (ringEnd === -1) {
      // No explicit closure found -- an open ring running to the end of the
      // list; close it implicitly (last vertex -> first).
      for (let j = ringStart; j < points.length; j++) {
        const [ax, ay] = points[j]
        const [bx, by] = points[j + 1 < points.length ? j + 1 : ringStart]
        segs.push(ax, ay, bx, by)
      }
      ringStart = points.length
    } else {
      for (let j = ringStart; j < ringEnd; j++) {
        const [ax, ay] = points[j]
        const [bx, by] = points[j + 1]
        segs.push(ax, ay, bx, by)
      }
      ringStart = ringEnd + 1
    }
  }

  return new Float64Array(segs)
}

function bboxOfPoints(points: number[][]): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

/**
 * Independent reference for the shape's true max clearance -- a coarse
 * full-bbox grid search followed by a fine local refine around the coarse
 * best, deliberately a *different* algorithm from polylabel's adaptive
 * quadtree subdivision (a plain grid search), so this isn't circular: it
 * doesn't re-run polylabel, it directly samples the same distance function
 * polylabel is trying to maximize. The refine window (±2× the coarse step)
 * comfortably covers the coarse grid's worst-case diagonal miss
 * (coarseStep*sqrt(2)/2 ≈ 0.71 for coarseStep=1).
 */
function bruteForceMaxClearance(
  segs: Float64Array,
  segCount: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): number {
  const coarseStep = 1.0
  let bestX = minX
  let bestY = minY
  let best = -Infinity
  for (let y = minY; y <= maxY; y += coarseStep) {
    for (let x = minX; x <= maxX; x += coarseStep) {
      const d = signedDistanceToSegments(segs, segCount, x, y)
      if (d > best) {
        best = d
        bestX = x
        bestY = y
      }
    }
  }

  const fineStep = 0.05
  const window = 2 * coarseStep
  for (let y = bestY - window; y <= bestY + window; y += fineStep) {
    for (let x = bestX - window; x <= bestX + window; x += fineStep) {
      const d = signedDistanceToSegments(segs, segCount, x, y)
      if (d > best) best = d
    }
  }

  return best
}

describe('anchor-shapes.json fixture acceptance — Epic 7 Task 7.3', () => {
  for (const fx of fixtures) {
    it(`produces a strictly-interior, clearance-optimal anchor — ${fx.id} (${fx.type})`, async () => {
      const segs = parseRingsToSegments(fx.points)
      const segCount = segs.length / 4
      const [minX, minY, maxX, maxY] = bboxOfPoints(fx.points)

      const pole = await polylabel(segs, segCount, minX, minY, maxX, maxY, 1.0)

      // Interiority: `pole.distance` IS the signed distance evaluated at
      // (pole.x, pole.y) against these same segments (the exact value
      // `polylabel` converged on) -- positive means inside, by the same
      // crossing-number rule for every fixture, including the
      // self-intersecting spirals and the degenerate concave-2 ring.
      expect(pole.distance).toBeGreaterThan(0)

      // Clearance-optimality (BDFL ruling, supersedes coordinate equality
      // against the fixture's `expectedAnchor`): the anchor's clearance must
      // be within precision of the true maximum, not equal to a specific
      // coordinate. The 1.1 tolerance is the 1.0px CA-8 precision plus a
      // small allowance for the brute-force reference's own grid quantization.
      const dMax = bruteForceMaxClearance(
        segs,
        segCount,
        minX,
        minY,
        maxX,
        maxY
      )
      expect(dMax - pole.distance).toBeLessThanOrEqual(1.1)
    })
  }
})
