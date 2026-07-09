import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../../src/MapEngine'
import { CostsRequiredError, MapInvalidatedError } from '../../src/errors'
import { makeCanvas } from '../testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('MapEngine — Pathfinding (Epic 5 Task 5.3)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('rejects findPath with CostsRequiredError before setTraversalCosts has resolved', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await expect(engine.findPath(0, 1)).rejects.toBeInstanceOf(
      CostsRequiredError
    )
  })

  it('setTraversalCosts transfers the caller buffer (byteLength === 0 on Main post-call)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    const costs = new Uint8Array(sectorCount).fill(1)

    await engine.setTraversalCosts(costs)

    expect(costs.byteLength).toBe(0)
  })

  it('rejects setTraversalCosts given a sub-view (non-zero byteOffset) without transferring', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    const backing = new ArrayBuffer(sectorCount + 4)
    const subView = new Uint8Array(backing, 4, sectorCount)

    await expect(engine.setTraversalCosts(subView)).rejects.toThrow()
    expect(subView.byteLength).toBe(sectorCount) // never transferred
  })

  it('round-trips a real path through the Worker via loadMap() (not the synthetic grid-10k fixture)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setTraversalCosts(new Uint8Array(sectorCount).fill(1))

    const path = await engine.findPath(0, sectorCount - 1)

    expect(path).toBeInstanceOf(Uint16Array)
    expect(path[0]).toBe(0)
    expect(path[path.length - 1]).toBe(sectorCount - 1)
  })

  it('rejects an out-of-range sector id instead of indexing past scratch arrays', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setTraversalCosts(new Uint8Array(sectorCount).fill(1))

    // The 4-sector test map is fully connected -- there is no disconnected
    // pair to exercise a genuine PathNotFoundError without a synthetic
    // graph; Task 5.2's SpatialGraph unit tests cover that directly. This
    // asserts the Worker handler's out-of-range guard (pathfindingHandlers.ts)
    // rejects rather than silently indexing past the preallocated scratch
    // arrays.
    await expect(engine.findPath(0, sectorCount)).rejects.toThrow()
  })

  it('an in-flight findPath rejects with MapInvalidatedError on loadMap() reload', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setTraversalCosts(new Uint8Array(sectorCount).fill(1))

    const inFlight = engine.findPath(0, sectorCount - 1)
    const reload = engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(reload).resolves.toBeUndefined()
  })

  it('an in-flight findPath rejects with MapInvalidatedError on dispose()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    await engine.setTraversalCosts(new Uint8Array(sectorCount).fill(1))

    const inFlight = engine.findPath(0, sectorCount - 1)
    await engine.dispose()

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
  })
})
