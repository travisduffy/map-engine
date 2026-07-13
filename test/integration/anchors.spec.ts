import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../../src/core/MapEngine'
import { MapInvalidatedError } from '../../src/shared/errors'
import type { SectorRegistry } from '../../src/sector/SectorRegistry'
import { makeCanvas } from '../testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('MapEngine — Anchors (Epic 7 Task 7.2)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('computes a strictly-interior anchor for every sector (all 4 touch the bitmap edge)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await engine.computeAnchors()

    const keys = engine.getSectorKeys()
    // Main's only live copy post-bootstrap-detach (bracket access mirrors
    // the FrameHook.test.ts / bootstrap-transfer.spec.ts precedent — the
    // public `engine.registry` getter always throws MapInvalidatedError
    // once the bootstrap transfer has run).
    const registry = engine['_registry'] as SectorRegistry
    const width = registry.width

    for (let id = 0; id < keys.length; id++) {
      const [ax, ay] = engine.getAnchor(id)
      const owner = registry.pixelIndicesMirror[ay * width + ax]
      expect(owner).toBe(id)
    }
  })

  it('throws a plain Error (not a canonical subclass) from getAnchor before the first computeAnchors() resolution', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    let caught: unknown
    try {
      engine.getAnchor(0)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    // Exactly `Error`, not one of the canonical subclasses (MappingRequiredError etc.) --
    // no canonical error class is assigned to this precondition (PRD, Epic 7 Task 7.2 ruling).
    expect((caught as Error).constructor).toBe(Error)
  })

  it('rejects an out-of-range sectorId with RangeError after computeAnchors() resolves', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await engine.computeAnchors()
    const sectorCount = engine.getSectorKeys().length
    expect(() => engine.getAnchor(sectorCount)).toThrow(RangeError)
  })

  it('an in-flight computeAnchors rejects with MapInvalidatedError on loadMap() reload', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const inFlight = engine.computeAnchors()
    const reload = engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(reload).resolves.toBeUndefined()
  })

  it('an in-flight computeAnchors rejects with MapInvalidatedError on dispose()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const inFlight = engine.computeAnchors()
    await engine.dispose()

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
  })
})
