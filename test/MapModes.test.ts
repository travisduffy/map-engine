import { describe, it, expect, vi, afterEach } from 'vitest'
import { MapEngine } from '../src/core/MapEngine'
import { ModeNotReadyError } from '../src/shared/errors'
import type { MapRenderer } from '../src/core/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { makeCanvas } from './testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('MapEngine map modes — Epic 4 Task 4.3 (CA-7)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('registerMapMode/setMapMode throw ModeNotReadyError before loadMap() resolves', () => {
    engine = new MapEngine()
    expect(() => engine.registerMapMode('dark', new Uint32Array(4))).toThrow(
      ModeNotReadyError
    )
    expect(() => engine.setMapMode('dark')).toThrow(ModeNotReadyError)
  })

  it('registerMapMode throws on duplicate id and on a colors-length mismatch', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const sectorCount = engine.getSectorKeys().length
    engine.registerMapMode('dark', new Uint32Array(sectorCount))
    expect(() =>
      engine.registerMapMode('dark', new Uint32Array(sectorCount))
    ).toThrow(/already registered/)
    expect(() =>
      engine.registerMapMode('bad-length', new Uint32Array(sectorCount + 1))
    ).toThrow(/colors\.length/)
  })

  it('setMapMode throws Error("Unknown map mode: <id>") on an unknown id', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(() => engine.setMapMode('nope')).toThrow('Unknown map mode: nope')
  })

  it('setMapMode(id) triggers exactly one render submit on the next rAF; repeat-id triggers zero', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()

    let capturedLoop: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      capturedLoop = cb
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const renderer = engine['_renderer'] as MapRenderer
    const backend = renderer['_backend'] as ThreeRenderBackend
    const sectorCount = engine.getSectorKeys().length
    engine.registerMapMode('dark', new Uint32Array(sectorCount).fill(0x202020))

    const tick = (): void => capturedLoop!(performance.now())

    tick() // drain the initial construction-time dirty flag

    const renderSpy = vi.spyOn(backend.getThreeRenderer(), 'render')
    const paletteSpy = vi.spyOn(
      backend as unknown as {
        updateUniforms: (u: Record<string, unknown>) => void
      },
      'updateUniforms'
    )

    engine.setMapMode('dark')
    tick()
    expect(renderSpy).toHaveBeenCalledTimes(1)
    expect(paletteSpy).toHaveBeenCalledTimes(1)

    renderSpy.mockClear()
    paletteSpy.mockClear()

    // Repeat-id: zero submits, zero uniform writes.
    engine.setMapMode('dark')
    tick()
    expect(renderSpy).not.toHaveBeenCalled()
    expect(paletteSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('loadMap() discards previously registered map modes (reload lifecycle)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const sectorCount = engine.getSectorKeys().length
    engine.registerMapMode('dark', new Uint32Array(sectorCount))

    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(() => engine.setMapMode('dark')).toThrow('Unknown map mode: dark')
  })

  it('dispose() discards previously registered map modes', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const sectorCount = engine.getSectorKeys().length
    engine.registerMapMode('dark', new Uint32Array(sectorCount))
    await engine.dispose()
    expect(engine['_mapModes'].size).toBe(0)
  })
})
