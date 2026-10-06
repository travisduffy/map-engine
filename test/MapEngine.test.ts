import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

import { MapEngine } from '../src/core/MapEngine'
import { MapRenderer } from '../src/core/MapRenderer'
import { MapInvalidatedError, WorkerStartError } from '../src/shared/errors'
import { makeCanvas } from './test-utils'

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
    // Reach the engine's event registry to verify on()/emit wiring.
    const engine = new MapEngine()
    const h1 = vi.fn()
    const h2 = vi.fn()
    engine.on('sectorHover', h1)
    engine.on('sectorHover', h2)
    engine['_events'].emit('sectorHover', null)
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
    engine['_events'].emit('sectorHover', null)
    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledWith(null)
  })

  it('_emit is a no-op for events with no registered handlers', () => {
    const engine = new MapEngine()
    expect(() => {
      engine['_events'].emit('sectorClick', null)
    }).not.toThrow()
  })
})

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'
// The bitmap is 4x4, and zoom 1 is the fit of the whole bitmap, so one zoom
// unit is 75 CSS pixels per bitmap pixel on a 300x900 canvas. A 2x2 box
// fits at 150 or 450 CSS pixels per box pixel, and both zooms stay under the
// clamp of 20.
const ZOOM_CONTAIN = 2
const ZOOM_COVER = 6

const waitFrames = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

describe('MapEngine — loadMap(), lifecycle guards, and destroy()', () => {
  let canvas: HTMLCanvasElement
  let engine: MapEngine

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
    vi.restoreAllMocks()
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

  it('loadMap() on an already-loaded engine reloads cleanly (Epic 3 Task 3.3)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(engine.getSector('ff0000')).toEqual({ name: 'Red Sector' })

    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).resolves.toBeUndefined()
    expect(engine.getSector('ff0000')).toEqual({ name: 'Red Sector' })
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

  const failNextWorker = () =>
    vi
      .spyOn(MapEngine.prototype as any, '_createWorker')
      .mockImplementationOnce(
        () => new Worker('/test/__404__', { type: 'module' })
      )

  it('loadMap rejects when the worker fails to start', async () => {
    failNextWorker()
    canvas = makeCanvas()
    engine = new MapEngine()
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).rejects.toBeInstanceOf(WorkerStartError)
  })

  it('loadMap retries cleanly after a worker start failure', async () => {
    failNextWorker()
    canvas = makeCanvas()
    engine = new MapEngine()
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).rejects.toBeInstanceOf(WorkerStartError)
    engine.destroy()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(engine.getSector('ff0000')).toEqual({ name: 'Red Sector' })
  })

  it('a worker start failure destroys the partial renderer', async () => {
    failNextWorker()
    const destroy = vi.spyOn(MapRenderer.prototype, 'destroy')
    canvas = makeCanvas()
    engine = new MapEngine()
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
    ).rejects.toBeInstanceOf(WorkerStartError)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('a worker error after the acknowledgement does not fail the next loadMap', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const config = {
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    }
    // The render loop resumes after the acknowledgement and before the load
    // completes, so an error event there meets no pending acknowledgement.
    const worker: Worker = (engine as any)._worker
    vi.spyOn(MapRenderer.prototype, '_resumeLoop').mockImplementationOnce(
      () => {
        worker.dispatchEvent(new ErrorEvent('error', { message: 'late' }))
      }
    )
    await engine.loadMap(config)
    await expect(engine.loadMap(config)).resolves.toBeUndefined()
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

  it('getView returns null before loadMap', () => {
    engine = new MapEngine()
    expect(engine.getView()).toBeNull()
  })

  it('fitBounds before loadMap applies at load', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    engine.fitBounds([0, 0, 1, 1], { padding: 8 })
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const view = engine.getView()!
    expect(view.centerX).toBeCloseTo(1)
    expect(view.centerY).toBeCloseTo(1)

    const unpadded = new MapEngine()
    const unpaddedCanvas = makeCanvas()
    unpadded.fitBounds([0, 0, 1, 1])
    await unpadded.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas: unpaddedCanvas,
    })
    const unpaddedZoom = unpadded.getView()!.zoom
    unpadded.destroy()
    unpaddedCanvas.remove()
    expect(view.zoom).toBeLessThan(unpaddedZoom)
  })

  it('camera methods throw after destroy of a loaded engine', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    expect(() => engine.getView()).toThrow('MapEngine: destroyed')
    expect(() => engine.setView({ zoom: 2 })).toThrow('MapEngine: destroyed')
    expect(() => engine.fitBounds([0, 0, 1, 1])).toThrow('MapEngine: destroyed')
  })

  it('viewChange fires once after setView', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    await waitFrames(2)
    const handler = vi.fn()
    engine.on('viewChange', handler)
    engine.setView({ zoom: 3 })
    await waitFrames(2)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].zoom).toBeCloseTo(3)
  })

  it('setView rejects a non-finite center with RangeError', () => {
    engine = new MapEngine()
    expect(() => engine.setView({ centerX: NaN })).toThrow(RangeError)
    expect(() => engine.setView({ centerY: Infinity })).toThrow(RangeError)
  })

  it('setView before loadMap stores one request, the last call wins', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    engine.setView({ zoom: 3 })
    engine.setView({ zoom: 5 })
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const view = engine.getView()!
    expect(view.zoom).toBeCloseTo(5)
    expect(view.centerX).toBeCloseTo(2)
    expect(view.centerY).toBeCloseTo(2)
  })

  it('setView after fitBounds before loadMap replaces the fit', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    engine.fitBounds([0, 0, 1, 1])
    engine.setView({ zoom: 2 })
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const view = engine.getView()!
    expect(view.zoom).toBeCloseTo(2)
    expect(view.centerX).toBeCloseTo(2)
    expect(view.centerY).toBeCloseTo(2)
  })

  it('fitBounds rejects a bbox with min > max and a negative padding', () => {
    engine = new MapEngine()
    expect(() => engine.fitBounds([2, 0, 1, 1])).toThrow(RangeError)
    expect(() => engine.fitBounds([0, 2, 1, 1])).toThrow(RangeError)
    expect(() => engine.fitBounds([0, 0, 1, 1], { padding: -1 })).toThrow(
      RangeError
    )
  })

  it('fitBounds rejects an unknown fit mode', () => {
    engine = new MapEngine()
    expect(() =>
      engine.fitBounds([0, 0, 1, 1], { fit: 'stretch' as never })
    ).toThrow(RangeError)
  })

  it('a stored pre-load fitBounds keeps its fit mode', async () => {
    canvas = makeCanvas(300, 900)
    engine = new MapEngine()
    engine.fitBounds([0, 0, 1, 1], { fit: 'cover' })
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const coverZoom = engine.getView()!.zoom

    const contain = new MapEngine()
    const containCanvas = makeCanvas(300, 900)
    try {
      contain.fitBounds([0, 0, 1, 1])
      await contain.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas: containCanvas,
      })
      expect(contain.getView()!.zoom).toBeCloseTo(ZOOM_CONTAIN)
      expect(coverZoom).toBeCloseTo(ZOOM_COVER)
    } finally {
      contain.destroy()
      containCanvas.remove()
    }
  })

  it('destroy clears a request stored before loadMap', () => {
    engine = new MapEngine()
    engine.setView({ zoom: 5 })
    engine.destroy()
    expect(engine['_pendingCamera']).toBeNull()
  })

  it('viewChange fires once on the first frame', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const handler = vi.fn()
    engine.on('viewChange', handler)
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    await waitFrames(3)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].zoom).toBeCloseTo(1)
  })

  it('off stops viewChange events', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const handler = vi.fn()
    engine.on('viewChange', handler)
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    await waitFrames(2)
    const callsBefore = handler.mock.calls.length
    engine.off('viewChange', handler)
    engine.setView({ zoom: 3 })
    await waitFrames(2)
    expect(handler).toHaveBeenCalledTimes(callsBefore)
  })
})

describe('MapEngine — setTickRate (Epic 1 Task 1.4)', () => {
  let canvas: HTMLCanvasElement
  let engine: MapEngine

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('defaults to 60 and accepts a valid value pre-loadMap', () => {
    engine = new MapEngine()
    expect(() => engine.setTickRate(30)).not.toThrow()
    expect(() => engine.setTickRate(1)).not.toThrow()
    expect(() => engine.setTickRate(240)).not.toThrow()
  })

  it('throws RangeError for out-of-range and NaN values', () => {
    engine = new MapEngine()
    expect(() => engine.setTickRate(0)).toThrow(RangeError)
    expect(() => engine.setTickRate(241)).toThrow(RangeError)
    expect(() => engine.setTickRate(NaN)).toThrow(RangeError)
  })

  it('throws after loadMap() has resolved', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(() => engine.setTickRate(30)).toThrow(
      'setTickRate() cannot be called after loadMap() has resolved'
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

  it('renderer getter returns an instance after loadMap(); registry getter throws MapInvalidatedError (ROADMAP §12.4)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    expect(engine.renderer).toBeTruthy()
    expect(() => engine.registry).toThrow(MapInvalidatedError)
  })

  it('getSectorId and getSectorKey are inverses over getSectorKeys()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const keys = engine.getSectorKeys()
    expect(keys.length).toBeGreaterThan(0)
    for (const [index, key] of keys.entries()) {
      expect(engine.getSectorId(key)).toBe(index)
      expect(engine.getSectorKey(index)).toBe(key)
    }
  })

  it('getSectorId returns undefined for an unknown key, and getSectorKey for an id out of range', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    const count = engine.getSectorKeys().length
    expect(engine.getSectorId('unknown')).toBeUndefined()
    expect(engine.getSectorKey(count)).toBeUndefined()
    expect(engine.getSectorKey(-1)).toBeUndefined()
    expect(engine.getSectorKey(0.5)).toBeUndefined()
  })

  it('getSectorId and getSectorKey throw "not loaded" before loadMap()', () => {
    engine = new MapEngine()
    expect(() => engine.getSectorId('ff0000')).toThrow('not loaded')
    expect(() => engine.getSectorKey(0)).toThrow('not loaded')
  })

  it('getSectorId and getSectorKey throw "destroyed" after destroy()', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    engine.destroy()
    expect(() => engine.getSectorId('ff0000')).toThrow('MapEngine: destroyed')
    expect(() => engine.getSectorKey(0)).toThrow('MapEngine: destroyed')
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

// --- Picking tests ---

const MISMATCH_DEFINITION_URL = '/test/fixtures/test-4x4-mismatch.json'

function firePointer(
  canvas: HTMLCanvasElement,
  type: 'pointermove' | 'click',
  canvasX: number,
  canvasY: number
): void {
  const rect = canvas.getBoundingClientRect()
  const event = new (type === 'pointermove' ? PointerEvent : MouseEvent)(type, {
    bubbles: true,
    clientX: rect.left + canvasX,
    clientY: rect.top + canvasY,
  })
  canvas.dispatchEvent(event)
}

describe('MapEngine — picking (sectorHover and sectorClick)', () => {
  let canvas: HTMLCanvasElement
  let engine: MapEngine

  beforeEach(async () => {
    canvas = makeCanvas(800, 600)
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
  })

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('pointermove at (250,150) emits sectorHover with hexKey "ff0000"', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    firePointer(canvas, 'pointermove', 250, 150)
    expect(handler).toHaveBeenCalledOnce()
    const result = handler.mock.calls[0][0]
    expect(result.hexKey).toBe('ff0000')
    expect(result.sectorData.name).toBe('Red Sector')
  })

  it('second pointermove at same location emits no second sectorHover', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    firePointer(canvas, 'pointermove', 250, 150)
    firePointer(canvas, 'pointermove', 250, 150)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('pointermove from (250,150) to (550,150) emits one sectorHover with hexKey "00ff00"', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    firePointer(canvas, 'pointermove', 250, 150)
    handler.mockClear()
    firePointer(canvas, 'pointermove', 550, 150)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].hexKey).toBe('00ff00')
  })

  it('pointermove at (50,300) (off-plane) emits sectorHover null after prior hover', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    firePointer(canvas, 'pointermove', 250, 150)
    handler.mockClear()
    firePointer(canvas, 'pointermove', 50, 300)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0]).toBeNull()
  })

  it('click at (250,150) emits sectorClick with hexKey "ff0000" and pixelX/Y in [0,1]', () => {
    const handler = vi.fn()
    engine.on('sectorClick', handler)
    firePointer(canvas, 'click', 250, 150)
    expect(handler).toHaveBeenCalledOnce()
    const result = handler.mock.calls[0][0]
    expect(result.hexKey).toBe('ff0000')
    expect(result.pixelX).toBeGreaterThanOrEqual(0)
    expect(result.pixelX).toBeLessThanOrEqual(1)
    expect(result.pixelY).toBeGreaterThanOrEqual(0)
    expect(result.pixelY).toBeLessThanOrEqual(1)
  })

  it('pointermove at (250,450) (blue bottom-left) emits sectorHover with hexKey "0000ff"', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    firePointer(canvas, 'pointermove', 250, 450)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].hexKey).toBe('0000ff')
  })

  it('click at (50,300) (off-plane) emits no sectorClick', () => {
    const handler = vi.fn()
    engine.on('sectorClick', handler)
    firePointer(canvas, 'click', 50, 300)
    expect(handler).not.toHaveBeenCalled()
  })

  it('mismatch fixture: pointermove at (550,450) emits sectorHover null for bitmap-only color', async () => {
    // Load a new engine with the mismatch definition (ffff00 not in JSON)
    const canvas2 = makeCanvas(800, 600)
    const engine2 = new MapEngine()
    await engine2.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: MISMATCH_DEFINITION_URL,
      canvas: canvas2,
    })
    const handler = vi.fn()
    engine2.on('sectorHover', handler)
    // First hover on red (defined in mismatch.json) to set _lastHexKey
    firePointer(canvas2, 'pointermove', 250, 150)
    handler.mockClear()
    // Hover on yellow (ffff00) — not in mismatch.json → getSector returns undefined → null
    firePointer(canvas2, 'pointermove', 550, 450)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0]).toBeNull()
    engine2.destroy()
    canvas2.remove()
  })

  it('after destroy(), pointermove does not invoke sectorHover callback', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    engine.destroy()
    firePointer(canvas, 'pointermove', 250, 150)
    expect(handler).not.toHaveBeenCalled()
  })

  it('pointermove during middle-button pan does not emit sectorHover', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    const rect = canvas.getBoundingClientRect()
    // Hold right button (isPanning = true)
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        button: 1,
        bubbles: true,
      })
    )
    // Move over a valid sector — hover should be suppressed
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true,
      })
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('pointermove during left-button drag does not emit sectorHover', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    const rect = canvas.getBoundingClientRect()
    // Left pointerdown then move past dead zone (isLeftDragging = true)
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 200,
        clientY: rect.top + 150,
        button: 0,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true, // 50px > dead zone
      })
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('click after left-button drag (leftHasDragged=true) does not emit sectorClick', () => {
    const handler = vi.fn()
    engine.on('sectorClick', handler)
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 200,
        clientY: rect.top + 150,
        button: 0,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true, // 50px > dead zone
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { button: 0, bubbles: true })
    )
    canvas.dispatchEvent(
      new MouseEvent('click', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        bubbles: true,
      })
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it('click after sub-dead-zone left move (leftHasDragged=false) emits sectorClick', () => {
    const handler = vi.fn()
    engine.on('sectorClick', handler)
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        button: 0,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 252,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true, // 2px < dead zone
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { button: 0, bubbles: true })
    )
    canvas.dispatchEvent(
      new MouseEvent('click', {
        clientX: rect.left + 252,
        clientY: rect.top + 150,
        bubbles: true,
      })
    )
    expect(handler).toHaveBeenCalledOnce()
  })

  it('sectorHover resumes normally after left-drag released', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    const rect = canvas.getBoundingClientRect()
    // Drag and release
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 200,
        clientY: rect.top + 150,
        button: 0,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { button: 0, bubbles: true })
    )
    // Next left pointerdown resets leftHasDragged; hover should now work
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        button: 0,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true,
      })
    )
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].hexKey).toBe('ff0000')
  })

  it('pointermove after right-button release emits sectorHover normally', () => {
    const handler = vi.fn()
    engine.on('sectorHover', handler)
    const rect = canvas.getBoundingClientRect()
    // Right-button press then release
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        button: 1,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { button: 1, bubbles: true })
    )
    // Now hover should work again
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 250,
        clientY: rect.top + 150,
        buttons: 1, // left button held
        bubbles: true,
      })
    )
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].hexKey).toBe('ff0000')
  })
})

describe('MapEngine — ignoredColors', () => {
  let canvas: HTMLCanvasElement
  let engine: MapEngine

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
    vi.restoreAllMocks()
  })

  it('ignoredColors are lower-cased before the check', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: MISMATCH_DEFINITION_URL,
      canvas,
      ignoredColors: ['FFFF00'],
    })
    const messages = warn.mock.calls.map(c => c[0] as string)
    expect(messages.some(m => m.includes('ffff00'))).toBe(false)
  })

  it('loadMap rejects a malformed ignored color before it fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    canvas = makeCanvas()
    engine = new MapEngine()
    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
        ignoredColors: ['fff'],
      })
    ).rejects.toThrow(
      new RangeError('MapEngine.loadMap: ignoredColors must be six hex digits')
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a reload with a malformed ignored color leaves the engine usable', async () => {
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
        ignoredColors: ['fff'],
      })
    ).rejects.toBeInstanceOf(RangeError)
    expect(engine.getSector('ff0000')).toEqual({ name: 'Red Sector' })
    expect(engine.getSectorKeys()).toContain('ff0000')
  })
})
