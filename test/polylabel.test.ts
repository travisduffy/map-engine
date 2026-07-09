import { describe, it, expect } from 'vitest'
import { polylabel } from '../src/worker/polylabel'

/** Converts an open ring (last vertex != first) into a flat [x1,y1,x2,y2,...] segment array, closing it implicitly. */
function ringToSegments(points: Array<[number, number]>): Float64Array {
  const segs = new Float64Array(points.length * 4)
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[(i + 1) % points.length]
    segs[i * 4] = ax
    segs[i * 4 + 1] = ay
    segs[i * 4 + 2] = bx
    segs[i * 4 + 3] = by
  }
  return segs
}

function bboxOf(
  points: Array<[number, number]>
): [number, number, number, number] {
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

describe('polylabel — Epic 7 Task 7.1', () => {
  it('resolves a square to its center', async () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const segs = ringToSegments(points)
    const [minX, minY, maxX, maxY] = bboxOf(points)
    const pole = await polylabel(
      segs,
      points.length,
      minX,
      minY,
      maxX,
      maxY,
      1.0
    )
    // Precision 1.0 guarantees `distance` within 1.0 px of the true max (5);
    // it does not guarantee coordinate equality, so assert ranges, not exact values.
    expect(pole.x).toBeGreaterThan(3.5)
    expect(pole.x).toBeLessThan(6.5)
    expect(pole.y).toBeGreaterThan(3.5)
    expect(pole.y).toBeLessThan(6.5)
    expect(pole.distance).toBeGreaterThan(4)
    expect(pole.distance).toBeLessThanOrEqual(5)
  })

  it('resolves an unequal-arm L-shape to the interior of the wider arm', async () => {
    // Wide arm: x in [0,100], y in [0,40] (thickness 40, max inscribed radius 20).
    // Narrow arm: x in [0,20], y in [0,100] (thickness 20, max inscribed radius 10).
    // For an *equal*-width L the true pole sits on the inner-corner diagonal of
    // the joint rather than inside either arm -- these arms are deliberately
    // unequal so the pole is unambiguously inside the wider arm.
    const points: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 40],
      [20, 40],
      [20, 100],
      [0, 100],
    ]
    const segs = ringToSegments(points)
    const [minX, minY, maxX, maxY] = bboxOf(points)
    const pole = await polylabel(
      segs,
      points.length,
      minX,
      minY,
      maxX,
      maxY,
      1.0
    )

    // The pole must be the wide arm's radius (20), not the narrow arm's (10).
    expect(pole.distance).toBeGreaterThan(18)
    expect(pole.distance).toBeLessThanOrEqual(20)
    // ...and it must sit inside the wide arm's thickness band, not the narrow arm.
    expect(pole.y).toBeGreaterThan(10)
    expect(pole.y).toBeLessThan(30)
    expect(pole.x).toBeGreaterThan(10)
    expect(pole.x).toBeLessThan(90)
  })

  it('returns a deterministic single anchor for a symmetric multi-pole shape', async () => {
    // Two equal 40x40 squares (poles of radius 20 each, a tie) joined by a
    // thin 10-wide bridge (clearance 5, strictly worse than either square).
    const points: Array<[number, number]> = [
      [0, 0],
      [40, 0],
      [40, 40],
      [25, 40],
      [25, 80],
      [40, 80],
      [40, 120],
      [0, 120],
      [0, 80],
      [15, 80],
      [15, 40],
      [0, 40],
    ]
    const segs = ringToSegments(points)
    const [minX, minY, maxX, maxY] = bboxOf(points)

    const poleA = await polylabel(
      segs,
      points.length,
      minX,
      minY,
      maxX,
      maxY,
      1.0
    )
    const poleB = await polylabel(
      segs,
      points.length,
      minX,
      minY,
      maxX,
      maxY,
      1.0
    )

    // Determinism: identical inputs must produce a bit-identical result even
    // though the true optimum is a tied pair (max-distance tie broken by
    // first-found, per Task 7.1's documented rule).
    expect(poleB.x).toBe(poleA.x)
    expect(poleB.y).toBe(poleA.y)

    // The chosen anchor must be a genuine pole (radius ~20), not the bridge (~5).
    expect(poleA.distance).toBeGreaterThan(18)
    expect(poleA.distance).toBeLessThanOrEqual(20)
  })
})
