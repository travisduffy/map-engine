import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../../src/MapEngine'
import { MapInvalidatedError } from '../../src/errors'
import type { SharedRegistryProxy } from '../../src/worker/SharedRegistryProxy'
import { makeCanvas } from '../testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('Lifecycle invalidation — Epic 3 Task 3.3', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
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
})
