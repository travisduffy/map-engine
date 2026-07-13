import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MapEngine } from '../src/core/MapEngine'
import type { MapRenderer } from '../src/core/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { parseColorToRgb } from '../src/shared/color'
import { makeCanvas, advanceFrame } from './testUtils'

describe('FrameHook — Epic 1', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement
  let renderer: MapRenderer

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: '/test/fixtures/test-4x4.png',
      definitionUrl: '/test/fixtures/test-4x4.json',
      canvas,
    })
    renderer = engine['_renderer'] as MapRenderer
    cancelAnimationFrame(renderer['_animFrameId'])
  })

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
    vi.useRealTimers()
  })

  it('AC 1.1: registers callbacks in order; offFrame removes; unregistered no-op', () => {
    const calls: number[] = []
    const cb1 = () => calls.push(1)
    const cb2 = () => calls.push(2)
    const cb3 = () => calls.push(3)

    engine.onFrame(cb1)
    engine.onFrame(cb2)
    engine.onFrame(cb3)

    advanceFrame(renderer, 16)
    expect(calls).toEqual([1, 2, 3])

    calls.length = 0
    engine.offFrame(cb2)
    advanceFrame(renderer, 16)
    expect(calls).toEqual([1, 3])

    expect(() => engine.offFrame(() => {})).not.toThrow()
  })

  it('AC 1.2: first frame dt === 0; subsequent frames use elapsed time; late-registered callback gets real dt', () => {
    const dts: number[] = []
    engine.onFrame(dt => dts.push(dt))

    advanceFrame(renderer, 1)
    expect(dts[0]).toBe(0)

    advanceFrame(renderer, 1000)
    expect(dts[1]).toBe(1.0)

    // Callback registered after frame 0 still gets real dt on next frame (not 0)
    const lateDts: number[] = []
    engine.onFrame(dt => lateDts.push(dt))
    advanceFrame(renderer, 1000)
    expect(lateDts[0]).toBe(1.0)
  })

  it('AC 1.3 (Epic 4 B2): two setSectorColor in one frame each patch their sector LUT entry', () => {
    const registry = engine['_registry']!
    const backend = renderer['_backend'] as ThreeRenderBackend
    const spy = vi.spyOn(backend, 'writePaletteEntry')

    engine.onFrame(() => {
      engine.setSectorColor('ff0000', 'blue')
      engine.setSectorColor('00ff00', 'red')
    })

    advanceFrame(renderer, 16)

    expect(spy).toHaveBeenCalledTimes(2)

    const { r: br, g: bg, b: bb } = parseColorToRgb('blue')
    const { r: rr, g: rg, b: rb } = parseColorToRgb('red')
    expect(spy).toHaveBeenNthCalledWith(
      1,
      registry.getNumericId('ff0000'),
      br,
      bg,
      bb
    )
    expect(spy).toHaveBeenNthCalledWith(
      2,
      registry.getNumericId('00ff00'),
      rr,
      rg,
      rb
    )
  })

  it('AC 1.4 (Epic 4 B2): setSectorColor outside a frame patches the LUT entry immediately', () => {
    const registry = engine['_registry']!
    const backend = renderer['_backend'] as ThreeRenderBackend
    const spy = vi.spyOn(backend, 'writePaletteEntry')

    engine.setSectorColor('ff0000', 'blue')

    const { r, g, b } = parseColorToRgb('blue')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(registry.getNumericId('ff0000'), r, g, b)
  })

  it('AC 1.5: onFrame/offFrame are no-ops after destroy', () => {
    engine.destroy()
    const cb = vi.fn()
    expect(() => engine.onFrame(cb)).not.toThrow()
    expect(() => engine.offFrame(cb)).not.toThrow()
  })

  it('AC 1.6: callback calling offFrame(itself) does not corrupt subsequent callbacks', () => {
    const calls: string[] = []
    const cb1 = () => {
      engine.offFrame(cb1)
      calls.push('cb1')
    }
    const cb2 = () => calls.push('cb2')

    engine.onFrame(cb1)
    engine.onFrame(cb2)

    advanceFrame(renderer, 16)
    expect(calls).toEqual(['cb1', 'cb2'])

    calls.length = 0
    advanceFrame(renderer, 16)
    // cb1 removed itself — only cb2 fires
    expect(calls).toEqual(['cb2'])
  })

  it('AC 1.8: destroy inside callback — remaining callbacks fire; setSectorColor throws', () => {
    const calls: string[] = []

    engine.onFrame(() => {
      engine.destroy()
      calls.push('cb1-done')
    })
    engine.onFrame(() => {
      calls.push('cb2-before')
      // setSectorColor throws 'MapEngine: destroyed', caught by hook's per-callback try/catch
      engine.setSectorColor('ff0000', 'red')
      calls.push('cb2-after') // NOT reached
    })
    engine.onFrame(() => {
      calls.push('cb3')
    })

    advanceFrame(renderer, 16)

    expect(calls).toContain('cb1-done')
    expect(calls).toContain('cb2-before')
    expect(calls).not.toContain('cb2-after') // setSectorColor threw before this line
    expect(calls).toContain('cb3') // third callback still fired
  })

  it('AC 1.9 (Epic 4 B2): invalid color patches the LUT entry with black', () => {
    const registry = engine['_registry']!
    const backend = renderer['_backend'] as ThreeRenderBackend
    const spy = vi.spyOn(backend, 'writePaletteEntry')

    // Immediate path: set red then invalid → black
    expect(() => engine.setSectorColor('ff0000', 'red')).not.toThrow()
    expect(() =>
      engine.setSectorColor('ff0000', '###not-valid###')
    ).not.toThrow()
    expect(spy).toHaveBeenLastCalledWith(
      registry.getNumericId('ff0000'),
      0,
      0,
      0
    )

    // In-tick path
    let threw = false
    engine.onFrame(() => {
      try {
        engine.setSectorColor('0000ff', '###not-valid###')
      } catch {
        threw = true
      }
    })
    advanceFrame(renderer, 16)
    expect(threw).toBe(false)
    expect(spy).toHaveBeenLastCalledWith(
      registry.getNumericId('0000ff'),
      0,
      0,
      0
    )
  })

  it('AC 1.10: color utility import isolation', async () => {
    const [srText, sbpText, colorText] = await Promise.all([
      fetch('/src/SectorRegistry.ts').then(r => r.text()),
      fetch('/src/SectorBitmapParser.ts').then(r => r.text()),
      fetch('/src/internal/color.ts').then(r => r.text()),
    ])
    expect(srText).not.toMatch(/internal\/color/)
    expect(sbpText).not.toMatch(/internal\/color/)
    expect(colorText).not.toMatch(/SectorRegistry|SectorBitmapParser/)
  })

  it('AC 1.11 (Epic 4 B2): error in callback does not stop subsequent callbacks; LUT patch still applied', () => {
    const registry = engine['_registry']!
    const backend = renderer['_backend'] as ThreeRenderBackend
    const calls: string[] = []
    const spy = vi.spyOn(backend, 'writePaletteEntry')

    engine.onFrame(() => calls.push('cb1'))
    engine.onFrame(() => {
      throw new Error('cb2 error')
    })
    engine.onFrame(() => {
      calls.push('cb3')
      engine.setSectorColor('ff0000', 'red')
    })

    advanceFrame(renderer, 16)
    expect(calls).toEqual(['cb1', 'cb3'])
    const { r, g, b } = parseColorToRgb('red')
    expect(spy).toHaveBeenCalledWith(registry.getNumericId('ff0000'), r, g, b)
  })

  it('AC 1.12 (Epic 4 B2): immediate setSectorColor + in-frame resetSectorColor → LUT entry matches idToPackedRgb', () => {
    const registry = engine['_registry']!
    const backend = renderer['_backend'] as ThreeRenderBackend
    const spy = vi.spyOn(backend, 'writePaletteEntry')

    // Immediate set
    engine.setSectorColor('ff0000', 'red')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockClear()

    // In-frame reset
    engine.onFrame(() => {
      engine.resetSectorColor('ff0000')
    })
    advanceFrame(renderer, 16)

    expect(spy).toHaveBeenCalledTimes(1)

    // Must match original ff0000 color (sourceBuffer disposed — use idToPackedRgb)
    const numId = registry.getNumericId('ff0000')!
    const packed = registry.idToPackedRgb[numId]
    expect(spy).toHaveBeenCalledWith(
      numId,
      (packed >>> 16) & 0xff,
      (packed >>> 8) & 0xff,
      packed & 0xff
    )
  })
})
