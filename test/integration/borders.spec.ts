import { describe, it, expect, afterEach } from 'vitest'

import { MapEngine } from '../../src/core/MapEngine'
import {
  MappingRequiredError,
  MapInvalidatedError,
} from '../../src/shared/errors'
import { makeCanvas } from '../test-utils'
import type { WorkerMessage } from '../../src/shared/types'

interface PerimeterFixture {
  mapImage: string
  definition: string
  parentMapping: number[]
  maxGroups: number
  expectedEdgeCount: number
  expectedEdges: [number, number, number, number][]
}

const fixtures: PerimeterFixture[] = await fetch(
  '/test/fixtures/borders/perimeter-cases.json'
).then(r => r.json())

const TEST4X4_BITMAP = '/test/fixtures/test-4x4.png'
const TEST4X4_DEFINITION = '/test/fixtures/test-4x4.json'

/** Unpacks a flat `[x1,y1,x2,y2, ...]` array into an array of 4-tuples, sorted for order-independent comparison. */
function toSortedSegments(flat: Float32Array): number[][] {
  const segs: number[][] = []
  for (let i = 0; i < flat.length; i += 4) {
    segs.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]])
  }
  segs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
  return segs
}

describe('MapEngine — Borders (Epic 8 Task 8.2/8.3, CA-6)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  for (const fx of fixtures) {
    it(`produces edge-exact border segments — ${fx.mapImage}`, async () => {
      canvas = makeCanvas()
      engine = new MapEngine()
      await engine.loadMap({
        bitmapUrl: fx.mapImage,
        definitionUrl: fx.definition,
        canvas,
      })

      await engine.setParentMapping(
        new Uint16Array(fx.parentMapping),
        fx.maxGroups
      )
      await engine.recomputeBorders()

      const segments = engine.getBorderSegments()
      expect(segments).not.toBeNull()
      expect(segments!.length / 4).toBe(fx.expectedEdgeCount)
      expect(toSortedSegments(segments!)).toEqual(
        toSortedSegments(new Float32Array(fx.expectedEdges.flat()))
      )
    })
  }

  it('getBorderSegments() returns null before the first recomputeBorders() resolution', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    expect(engine.getBorderSegments()).toBeNull()
  })

  it('getBorderSegments() returns Float32Array(0) (not null) after a zero-edge sentinel resolution', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0xffff), 1)
    await engine.recomputeBorders()

    const segments = engine.getBorderSegments()
    expect(segments).not.toBeNull()
    expect(segments!.length).toBe(0)
  })

  it('rejects recomputeBorders with MappingRequiredError before setParentMapping has resolved', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    await expect(engine.recomputeBorders()).rejects.toBeInstanceOf(
      MappingRequiredError
    )
  })

  it('recomputeBorders does not require aggregateGroups() to have run', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)
    // Deliberately no aggregateGroups() call.
    await expect(engine.recomputeBorders()).resolves.toBeUndefined()
  })

  it('coalesces N concurrent calls into <=2 Worker computations, sharing resolution', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)

    const worker = engine['_worker'] as Worker
    let borderEdgeMessages = 0
    const counter = (e: MessageEvent<WorkerMessage>): void => {
      if (e.data.type === 'borderEdges') borderEdgeMessages++
    }
    worker.addEventListener('message', counter)

    const calls = [
      engine.recomputeBorders(),
      engine.recomputeBorders(),
      engine.recomputeBorders(),
      engine.recomputeBorders(),
      engine.recomputeBorders(),
    ]

    // Every caller after the first shares the exact same coalesced Promise.
    expect(calls[1]).toBe(calls[2])
    expect(calls[2]).toBe(calls[3])
    expect(calls[3]).toBe(calls[4])

    await Promise.all(calls)
    worker.removeEventListener('message', counter)

    expect(borderEdgeMessages).toBeLessThanOrEqual(2)
  })

  it('a rejecting queued computation rejects every caller sharing it', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })
    // Deliberately never call setParentMapping -- every recomputeBorders()
    // call rejects with MappingRequiredError.

    const calls = [engine.recomputeBorders(), engine.recomputeBorders()]
    await expect(calls[0]).rejects.toBeInstanceOf(MappingRequiredError)
    await expect(calls[1]).rejects.toBeInstanceOf(MappingRequiredError)
  })

  it('a later recomputeBorders() reflects a mapping change made after the previous resolution', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: '/test/fixtures/borders/maps/two-adjacent-groups.png',
      definitionUrl: '/test/fixtures/borders/maps/two-adjacent-groups.json',
      canvas,
    })

    await engine.setParentMapping(new Uint16Array([0, 1]), 2)
    await engine.recomputeBorders()
    expect(engine.getBorderSegments()!.length / 4).toBe(4) // shared boundary

    // Fold both sectors into the same group -- the boundary should vanish.
    await engine.setParentMapping(new Uint16Array([0, 0]), 1)
    await engine.recomputeBorders()
    expect(engine.getBorderSegments()!.length / 4).toBe(0)
  })

  it('an in-flight recomputeBorders rejects with MapInvalidatedError on loadMap() reload', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)

    const inFlight = engine.recomputeBorders()
    const reload = engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(reload).resolves.toBeUndefined()
  })

  it('an in-flight recomputeBorders rejects with MapInvalidatedError on dispose()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)

    const inFlight = engine.recomputeBorders()
    await engine.dispose()

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
  })

  it('a queued (not yet dispatched) recomputeBorders rejects with MapInvalidatedError on dispose()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)

    const inFlight = engine.recomputeBorders()
    const queued = engine.recomputeBorders()
    await engine.dispose()

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(queued).rejects.toBeInstanceOf(MapInvalidatedError)
  })
})
