import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../src/core/MapEngine'
import { makeCanvas } from './testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'
const MISMATCH_DEFINITION_URL = '/test/fixtures/test-4x4-mismatch.json'

describe('MapEngine.pick() — Epic 3 Task 3.4', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('resolves null before a successful loadMap()', async () => {
    engine = new MapEngine()
    await expect(
      engine.pick({ clientX: 100, clientY: 100 })
    ).resolves.toBeNull()
  })

  it('resolves a correct PickResult for a valid sector (hex key via idToHex)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const rect = canvas.getBoundingClientRect()
    // Top-left quadrant of the 4x4 fixture is red (ff0000).
    const result = await engine.pick({
      clientX: rect.left + rect.width * 0.25,
      clientY: rect.top + rect.height * 0.25,
    })

    expect(result).not.toBeNull()
    expect(result!.hexKey).toBe('ff0000')
    expect(result!.sectorData).toEqual({ name: 'Red Sector' })
    expect(result!.pixelX).toBeGreaterThanOrEqual(0)
    expect(result!.pixelY).toBeGreaterThanOrEqual(0)
  })

  it('resolves null for a bitmap-only (void/unmapped) pixel', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: MISMATCH_DEFINITION_URL,
      canvas,
    })

    const rect = canvas.getBoundingClientRect()
    // Bottom-right quadrant (yellow, ffff00) has no entry in the mismatch definition.
    const result = await engine.pick({
      clientX: rect.left + rect.width * 0.75,
      clientY: rect.top + rect.height * 0.75,
    })

    expect(result).toBeNull()
  })

  it('resolves null on a mesh-miss (ray does not hit the map plane)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const result = await engine.pick({ clientX: -9999, clientY: -9999 })
    expect(result).toBeNull()
  })

  it('rejects after destroy()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    await expect(engine.pick({ clientX: 0, clientY: 0 })).rejects.toThrow(
      'MapEngine: destroyed'
    )
  })
})
