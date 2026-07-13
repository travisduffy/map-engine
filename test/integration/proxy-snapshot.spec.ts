import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../../src/core/MapEngine'
import { SectorBitmapParser } from '../../src/sector/SectorBitmapParser'
import { SectorRegistry } from '../../src/sector/SectorRegistry'
import { makeCanvas } from '../testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('SharedRegistryProxy — snapshot coherence (Epic 3 Task 3.2)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('getBBox/getNeighbors/getCentroid are synchronous and match pre-transfer registry values immediately after loadMap()', async () => {
    // Independent ground-truth parse — never transferred, so its buffers stay live.
    const parser = new SectorBitmapParser()
    const { buffer, width, height } = await parser.parse(BITMAP_URL)
    const definition = await fetch(DEFINITION_URL).then(r => r.json())
    const groundTruth = new SectorRegistry(buffer, width, height, definition)

    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    for (const hexKey of groundTruth.getSectorKeys()) {
      // No `await` anywhere below — these must be plain synchronous calls.
      expect(engine.getBBox(hexKey)).toEqual(groundTruth.getBBox(hexKey))
      expect(engine.getCentroid(hexKey)).toEqual(
        groundTruth.getCentroid(hexKey)
      )
      expect(engine.getNeighbors(hexKey)).toEqual(
        groundTruth.getNeighbors(hexKey)
      )
    }
  })

  it('numeric-ID overloads of getBBox/getCentroid/getNeighbors work synchronously', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const hexBBox = engine.getBBox('ff0000')
    const hexCentroid = engine.getCentroid('ff0000')
    const hexNeighbors = engine.getNeighbors('ff0000')

    // 'ff0000' is always numeric ID 0 for this fixture (first definition entry).
    expect(engine.getBBox(0)).toEqual(hexBBox)
    expect(engine.getCentroid(0)).toEqual(hexCentroid)
    expect(engine.getNeighbors(0).length).toBe(hexNeighbors?.length)
  })
})
