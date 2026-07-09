import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../../src/MapEngine'
import { MappingRequiredError, MapInvalidatedError } from '../../src/errors'
import { makeCanvas } from '../testUtils'

interface RegionFixture {
  mapImage: string
  definition: string
  parentMapping: number[]
  maxGroups: number
  expectedGroupBBoxes: [number, number, number, number][]
}

const fixtures: RegionFixture[] = await fetch(
  '/test/fixtures/mappings/regions.json'
).then(r => r.json())

const TEST4X4_BITMAP = '/test/fixtures/test-4x4.png'
const TEST4X4_DEFINITION = '/test/fixtures/test-4x4.json'

describe('MapEngine — Aggregation (Epic 6 Task 6.3)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  for (const fx of fixtures) {
    it(`produces per-coordinate-exact group bboxes — ${fx.mapImage}`, async () => {
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
      await engine.aggregateGroups()

      for (let g = 0; g < fx.maxGroups; g++) {
        expect(engine.getGroupBBox(g)).toEqual(fx.expectedGroupBBoxes[g])
      }
    })
  }

  it('rejects aggregateGroups with MappingRequiredError before setParentMapping has resolved', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    await expect(engine.aggregateGroups()).rejects.toBeInstanceOf(
      MappingRequiredError
    )
  })

  it('throws MappingRequiredError from getGroupBBox before the first aggregateGroups() resolution', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    expect(() => engine.getGroupBBox(0)).toThrow(MappingRequiredError)

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)
    // setParentMapping alone is not enough -- still before aggregateGroups().
    expect(() => engine.getGroupBBox(0)).toThrow(MappingRequiredError)
  })

  it('setParentMapping transfers the caller buffer (byteLength === 0 on Main post-call)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    const mapping = new Uint16Array(sectorCount).fill(0)
    await engine.setParentMapping(mapping, 1)

    expect(mapping.byteLength).toBe(0)
  })

  it('rejects setParentMapping given a sub-view (non-zero byteOffset) without transferring', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    const backing = new ArrayBuffer(sectorCount * 2 + 4)
    const subView = new Uint16Array(backing, 4, sectorCount)

    await expect(engine.setParentMapping(subView, 1)).rejects.toThrow()
    expect(subView.byteLength).toBe(sectorCount * 2) // never transferred
  })

  it('rejects setParentMapping given a group id that is neither 0xFFFF nor < maxGroups (no silent OOB write)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    const mapping = new Uint16Array(sectorCount).fill(5) // maxGroups below is 1
    await expect(engine.setParentMapping(mapping, 1)).rejects.toThrow()
  })

  it('getGroupBBox throws RangeError for a negative or out-of-range groupId', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 2)
    await engine.aggregateGroups()

    expect(() => engine.getGroupBBox(-1)).toThrow(RangeError)
    expect(() => engine.getGroupBBox(2)).toThrow(RangeError)
  })

  it('an in-flight aggregateGroups rejects with MapInvalidatedError on loadMap() reload', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setParentMapping(new Uint16Array(sectorCount).fill(0), 1)

    const inFlight = engine.aggregateGroups()
    const reload = engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(reload).resolves.toBeUndefined()
  })

  it('an in-flight setParentMapping rejects with MapInvalidatedError on dispose()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: TEST4X4_BITMAP,
      definitionUrl: TEST4X4_DEFINITION,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    const inFlight = engine.setParentMapping(
      new Uint16Array(sectorCount).fill(0),
      1
    )
    await engine.dispose()

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
  })
})
