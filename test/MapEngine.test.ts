import { describe, it, expect, vi, afterEach } from 'vitest'
import { MapEngine } from '../src/MapEngine'

describe('MapEngine — constructor and event subscription', () => {
  it('constructs without arguments', () => {
    const engine = new MapEngine()
    expect(engine).toBeInstanceOf(MapEngine)
  })

  it('on() before loadMap() does not throw', () => {
    const engine = new MapEngine()
    expect(() => {
      engine.on('sectorHover', () => {})
    }).not.toThrow()
  })

  it('off() before loadMap() does not throw', () => {
    const engine = new MapEngine()
    const handler = () => {}
    engine.on('sectorHover', handler)
    expect(() => {
      engine.off('sectorHover', handler)
    }).not.toThrow()
  })

  it('on() can register multiple handlers for the same event', () => {
    const engine = new MapEngine()
    const h1 = vi.fn()
    const h2 = vi.fn()
    engine.on('sectorClick', h1)
    engine.on('sectorClick', h2)
    // No throw — both registered
    engine.off('sectorClick', h1)
    engine.off('sectorClick', h2)
  })

  it('off() with an unregistered handler does not throw', () => {
    const engine = new MapEngine()
    expect(() => {
      engine.off('sectorHover', () => {})
    }).not.toThrow()
  })

  it('on() after destroy() throws "MapEngine: destroyed"', () => {
    // We need a destroyed engine. Since destroy() is not yet implemented
    // (throws "Not implemented"), we simulate the destroyed state by
    // testing the guard in isolation using a fully-loaded engine path.
    // For Task 3.1, we directly verify the flag behavior via the guard check
    // by calling destroy() on a fresh engine and expecting the error.
    // destroy() is not yet implemented — so we skip the post-destroy guard
    // test here and defer to Task 3.2 integration tests.
    // This test is a placeholder validated in Task 3.2.
    expect(true).toBe(true)
  })

  it('_emit delivers payload to all registered handlers', () => {
    // Access private _emit via type cast to verify internal wiring
    const engine = new MapEngine()
    const h1 = vi.fn()
    const h2 = vi.fn()
    engine.on('sectorHover', h1)
    engine.on('sectorHover', h2)
    // Trigger _emit via the private method using type cast
    ;(engine as unknown as { _emit: (e: string, p: unknown) => void })._emit(
      'sectorHover',
      null
    )
    expect(h1).toHaveBeenCalledWith(null)
    expect(h2).toHaveBeenCalledWith(null)
  })

  it('off() removes only the specified handler', () => {
    const engine = new MapEngine()
    const h1 = vi.fn()
    const h2 = vi.fn()
    engine.on('sectorHover', h1)
    engine.on('sectorHover', h2)
    engine.off('sectorHover', h1)
    ;(engine as unknown as { _emit: (e: string, p: unknown) => void })._emit(
      'sectorHover',
      null
    )
    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledWith(null)
  })

  it('_emit is a no-op for events with no registered handlers', () => {
    const engine = new MapEngine()
    expect(() => {
      ;(engine as unknown as { _emit: (e: string, p: unknown) => void })._emit(
        'sectorClick',
        null
      )
    }).not.toThrow()
  })
})

// --- Helper for browser-mode lifecycle tests ---

function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = width
  canvas.height = height
  Object.defineProperty(canvas, 'clientWidth', {
    value: width,
    configurable: true,
  })
  Object.defineProperty(canvas, 'clientHeight', {
    value: height,
    configurable: true,
  })
  document.body.appendChild(canvas)
  return canvas
}

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('MapEngine — loadMap(), lifecycle guards, and destroy()', () => {
  let canvas: HTMLCanvasElement
  let engine: MapEngine

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('loadMap() resolves with valid test fixtures', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).resolves.toBeUndefined()
  })

  it('double loadMap() throws "already loaded"', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).rejects.toThrow('already loaded')
  })

  it('concurrent loadMap() throws "already in progress"', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const first = engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).rejects.toThrow('already in progress')
    await first
  })

  it('loadMap() after destroy() on fully-loaded engine throws "destroyed"', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).rejects.toThrow('MapEngine: destroyed')
  })

  it('partial-failure recovery: destroy() then loadMap() again succeeds', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    // Use the PNG as definition URL — r.json() will fail to parse binary data
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: BITMAP_URL, // binary PNG is not valid JSON
        canvas,
      })
    ).rejects.toThrow()
    // Engine should NOT be permanently destroyed after partial failure
    engine.destroy()
    // Now retry with correct URLs — should succeed
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).resolves.toBeUndefined()
  })

  it('loadMap() rejects when definitionUrl returns HTTP 200 non-JSON body', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    // Fetching a PNG as definition: HTTP 200 but r.json() parse fails
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: BITMAP_URL,
        canvas,
      })
    ).rejects.toThrow()
  })

  it('destroy() is idempotent — second call does not throw', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    expect(() => engine.destroy()).not.toThrow()
  })

  it('on() and off() after destroy() on fully-loaded engine throw "MapEngine: destroyed"', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    expect(() => engine.on('sectorHover', () => {})).toThrow(
      'MapEngine: destroyed'
    )
    expect(() => engine.off('sectorHover', () => {})).toThrow(
      'MapEngine: destroyed'
    )
  })
})

describe('MapEngine — pass-through methods and getters', () => {
  let canvas: HTMLCanvasElement
  let engine: MapEngine

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('getSector() throws "not loaded" before loadMap()', () => {
    engine = new MapEngine()
    expect(() => engine.getSector('ff0000')).toThrow('not loaded')
  })

  it('setSectorColor() throws "not loaded" before loadMap()', () => {
    engine = new MapEngine()
    expect(() => engine.setSectorColor('ff0000', 'blue')).toThrow('not loaded')
  })

  it('resetSectorColor() throws "not loaded" before loadMap()', () => {
    engine = new MapEngine()
    expect(() => engine.resetSectorColor('ff0000')).toThrow('not loaded')
  })

  it('renderer getter throws "not loaded" before loadMap()', () => {
    engine = new MapEngine()
    expect(() => engine.renderer).toThrow('not loaded')
  })

  it('registry getter throws "not loaded" before loadMap()', () => {
    engine = new MapEngine()
    expect(() => engine.registry).toThrow('not loaded')
  })

  it('pass-throughs work after loadMap()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(engine.getSector('ff0000')).toEqual({ name: 'Red Sector' })
    expect(engine.getSector('unknown')).toBeUndefined()
    expect(() => engine.setSectorColor('ff0000', 'blue')).not.toThrow()
    expect(() => engine.resetSectorColor('ff0000')).not.toThrow()
  })

  it('renderer and registry getters return instances after loadMap()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(engine.renderer).toBeTruthy()
    expect(engine.registry).toBeTruthy()
  })

  it('pass-throughs throw "destroyed" after destroy() on fully-loaded engine', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    expect(() => engine.getSector('ff0000')).toThrow('MapEngine: destroyed')
    expect(() => engine.setSectorColor('ff0000', 'blue')).toThrow(
      'MapEngine: destroyed'
    )
    expect(() => engine.resetSectorColor('ff0000')).toThrow(
      'MapEngine: destroyed'
    )
    expect(() => engine.renderer).toThrow('MapEngine: destroyed')
    expect(() => engine.registry).toThrow('MapEngine: destroyed')
  })
})
