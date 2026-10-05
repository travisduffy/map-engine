import { describe, it, expect, afterEach, vi } from 'vitest'

import { MapEngine } from '../../src/core/MapEngine'
import { MapRenderer } from '../../src/core/MapRenderer'
import { MapInvalidatedError } from '../../src/shared/errors'
import { makeCanvas } from '../test-utils'
import type { SharedRegistryProxy } from '../../src/worker/SharedRegistryProxy'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'
const MISSING_DEFINITION_URL = '/test/fixtures/missing-4x4.json'

describe('Lifecycle invalidation — Epic 3 Task 3.3', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    vi.restoreAllMocks()
    engine?.destroy()
    canvas?.remove()
  })

  it('loadMap → in-flight proxy call → loadMap (reload) rejects the in-flight call with MapInvalidatedError', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const proxy = engine['_proxy'] as SharedRegistryProxy
    const inFlight = proxy.call('someFutureMethod')

    // Reload while the call above is still unresolved.
    const reload = engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(reload).resolves.toBeUndefined()
  })

  it('dispose() rejects in-flight proxy calls with MapInvalidatedError and terminates the Worker', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const proxy = engine['_proxy'] as SharedRegistryProxy
    const inFlight = proxy.call('someFutureMethod')

    await engine.dispose()

    await expect(inFlight).rejects.toBeInstanceOf(MapInvalidatedError)
    expect(() => engine.registry).toThrow('MapEngine: destroyed')
  })

  it('produces no unhandled-rejection warnings across reload + dispose', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (e: PromiseRejectionEvent): void => {
      unhandled.push(e.reason)
    }
    window.addEventListener('unhandledrejection', onUnhandled)

    try {
      canvas = makeCanvas()
      engine = new MapEngine()
      await engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })

      const proxy = engine['_proxy'] as SharedRegistryProxy
      const p1 = proxy.call('a').catch(() => {})
      const p2 = proxy.call('b').catch(() => {})

      await engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: DEFINITION_URL,
        canvas,
      })
      await Promise.all([p1, p2])
      await engine.dispose()

      // Let any stray unhandledrejection events settle.
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(unhandled).toHaveLength(0)
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  })

  it('dispose before loadMap terminates the worker', async () => {
    engine = new MapEngine()
    const terminate = vi.spyOn(engine['_worker'] as Worker, 'terminate')

    await engine.dispose()

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(engine['_worker']).toBeNull()
  })

  it('dispose during loadMap rejects the load and leaves no render loop', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const resumeLoop = vi.spyOn(MapRenderer.prototype, '_resumeLoop')

    const load = engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })
    await engine.dispose()

    await expect(load).rejects.toBeInstanceOf(MapInvalidatedError)
    expect(resumeLoop).not.toHaveBeenCalled()
    expect(() => engine.renderer).toThrow('not loaded')
    expect(engine['_worker']).toBeNull()
  })

  it('dispose during the bootstrap wait rejects the load and destroys the partial renderer', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const destroy = vi.spyOn(MapRenderer.prototype, 'destroy')
    const worker = engine['_worker'] as Worker
    const post = worker.postMessage.bind(worker)
    vi.spyOn(worker, 'postMessage').mockImplementation(
      (...args: Parameters<Worker['postMessage']>) => {
        post(...args)
        void engine.dispose()
      }
    )

    const load = engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    await expect(load).rejects.toBeInstanceOf(MapInvalidatedError)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('dispose during a reload of a loaded engine rejects the reload and allows a new load', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const config = {
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    }
    await engine.loadMap(config)

    const reload = engine.loadMap(config)
    await engine.dispose()

    await expect(reload).rejects.toBeInstanceOf(MapInvalidatedError)
    await expect(engine.loadMap(config)).resolves.toBeUndefined()
    expect(engine.renderer).toBeDefined()
  })

  it('loadMap after a cancelled load resolves', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const config = {
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    }

    const cancelled = engine.loadMap(config)
    await engine.dispose()
    await expect(cancelled).rejects.toBeInstanceOf(MapInvalidatedError)

    await expect(engine.loadMap(config)).resolves.toBeUndefined()
    expect(engine.renderer).toBeDefined()
  })

  it('a stale load does not clear the in-progress flag of a new load', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    const config = {
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    }

    const stale = engine.loadMap(config)
    await engine.dispose()
    const fresh = engine.loadMap(config)
    await expect(stale).rejects.toBeInstanceOf(MapInvalidatedError)

    await expect(engine.loadMap(config)).rejects.toThrow('already in progress')
    await expect(fresh).resolves.toBeUndefined()
  })

  it('a retry after a failed load keeps the handlers and the stored camera', async () => {
    canvas = makeCanvas(800, 600)
    engine = new MapEngine()
    const handler = vi.fn()
    engine.on('sectorClick', handler)
    engine.fitBounds([0, 0, 1, 1], { padding: 8 })

    await expect(
      engine.loadMap({
        bitmapUrl: BITMAP_URL,
        definitionUrl: MISSING_DEFINITION_URL,
        canvas,
      })
    ).rejects.toThrow()

    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + 250,
        clientY: rect.top + 150,
      })
    )
    expect(handler).toHaveBeenCalledOnce()
    expect(engine.getView()!.centerX).toBeCloseTo(1)
    expect(engine.getView()!.centerY).toBeCloseTo(1)
  })
})
