import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MapEngine } from '../src/MapEngine'
import type { MapRenderer } from '../src/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { parseColorToRgb } from '../src/internal/color'
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

  it('AC 1.3: two setSectorColor in one frame = one putImageData with bbox union and correct pixels', () => {
    const registry = engine['_registry']!
    // B-4: guard for inclusive-bounds assumption underlying every +1 in dirty-rect formula
    expect(registry.getBBox('ff0000')[2]).toBe(1) // maxX

    const spy = vi.spyOn(renderer['displayCtx'], 'putImageData')
    // Three.js Texture.needsUpdate is a write-only setter that increments .version;
    // capture version before the frame and assert it grew after flush.
    const versionBefore = (renderer['_backend'] as ThreeRenderBackend).texture
      .version

    engine.onFrame(() => {
      engine.setSectorColor('ff0000', 'blue')
      engine.setSectorColor('00ff00', 'red')
    })

    advanceFrame(renderer, 16)

    expect(spy).toHaveBeenCalledTimes(1)

    // ff0000 bbox: {0,0,1,1}; 00ff00 bbox: {2,0,3,1} → union {0,0,3,1}
    // putImageData(data, dx=0, dy=0, dirtyX=0, dirtyY=0, dirtyW=4, dirtyH=2)
    const call = spy.mock.calls[0]
    expect(call[1]).toBe(0) // dx
    expect(call[2]).toBe(0) // dy
    expect(call[3]).toBe(0) // dirtyX (minX)
    expect(call[4]).toBe(0) // dirtyY (minY)
    expect(call[5]).toBe(4) // dirtyWidth  (maxX - minX + 1 = 3 - 0 + 1)
    expect(call[6]).toBe(2) // dirtyHeight (maxY - minY + 1 = 1 - 0 + 1)

    const { r: br, g: bg, b: bb } = parseColorToRgb('blue')
    const { r: rr, g: rg, b: rb } = parseColorToRgb('red')
    const data = renderer['displayImageData'].data

    const ffOffset = registry.getSectorPixels('ff0000')![0] * 4
    expect(data[ffOffset]).toBe(br)
    expect(data[ffOffset + 1]).toBe(bg)
    expect(data[ffOffset + 2]).toBe(bb)

    const gfOffset = registry.getSectorPixels('00ff00')![0] * 4
    expect(data[gfOffset]).toBe(rr)
    expect(data[gfOffset + 1]).toBe(rg)
    expect(data[gfOffset + 2]).toBe(rb)

    expect(
      (renderer['_backend'] as ThreeRenderBackend).texture.version
    ).toBeGreaterThan(versionBefore)
  })

  it('AC 1.4: setSectorColor outside frame flushes immediately', () => {
    const spy = vi.spyOn(renderer['displayCtx'], 'putImageData')
    engine.setSectorColor('ff0000', 'blue')
    expect(spy).toHaveBeenCalledTimes(1)

    const { r, g, b } = parseColorToRgb('blue')
    const registry = engine['_registry']!
    const offset = registry.getSectorPixels('ff0000')![0] * 4
    const data = renderer['displayImageData'].data
    expect(data[offset]).toBe(r)
    expect(data[offset + 1]).toBe(g)
    expect(data[offset + 2]).toBe(b)
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

  it('AC 1.8: destroy inside callback — remaining callbacks fire; setSectorColor throws; flush is no-op', () => {
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

    const spy = vi.spyOn(renderer['displayCtx'], 'putImageData')
    advanceFrame(renderer, 16)

    expect(calls).toContain('cb1-done')
    expect(calls).toContain('cb2-before')
    expect(calls).not.toContain('cb2-after') // setSectorColor threw before this line
    expect(calls).toContain('cb3') // third callback still fired
    expect(spy).not.toHaveBeenCalled() // _pendingDirtyRect nulled by destroy — flush is no-op
  })

  it('AC 1.9: invalid color fills with black; clearRect resets singleton state', () => {
    const registry = engine['_registry']!
    const data = renderer['displayImageData'].data

    // Immediate path: set red then invalid → black (clearRect ensures singleton is reset)
    expect(() => engine.setSectorColor('ff0000', 'red')).not.toThrow()
    expect(() =>
      engine.setSectorColor('ff0000', '###not-valid###')
    ).not.toThrow()
    const ffOffset = registry.getSectorPixels('ff0000')![0] * 4
    expect(data[ffOffset]).toBe(0)
    expect(data[ffOffset + 1]).toBe(0)
    expect(data[ffOffset + 2]).toBe(0)

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
    const blOffset = registry.getSectorPixels('0000ff')![0] * 4
    expect(data[blOffset]).toBe(0)
    expect(data[blOffset + 1]).toBe(0)
    expect(data[blOffset + 2]).toBe(0)
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

  it('AC 1.11: error in callback does not stop subsequent callbacks; flush completes', () => {
    const calls: string[] = []
    const spy = vi.spyOn(renderer['displayCtx'], 'putImageData')

    engine.onFrame(() => calls.push('cb1'))
    engine.onFrame(() => {
      throw new Error('cb2 error')
    })
    engine.onFrame(() => {
      calls.push('cb3')
      engine.setSectorColor('ff0000', 'red') // gives flush work to do
    })

    advanceFrame(renderer, 16)
    expect(calls).toEqual(['cb1', 'cb3'])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('AC 1.12: immediate setSectorColor + in-frame resetSectorColor → pixels match sourceBuffer; one putImageData', () => {
    const registry = engine['_registry']!
    const data = renderer['displayImageData'].data
    const spy = vi.spyOn(renderer['displayCtx'], 'putImageData')

    // Immediate set (one putImageData)
    engine.setSectorColor('ff0000', 'red')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockClear()

    // In-frame reset
    engine.onFrame(() => {
      engine.resetSectorColor('ff0000')
    })
    advanceFrame(renderer, 16)

    expect(spy).toHaveBeenCalledTimes(1)

    // Pixels must match original ff0000 color (sourceBuffer disposed — use idToPackedRgb)
    const ffOffset = registry.getSectorPixels('ff0000')![0] * 4
    const packed = registry.idToPackedRgb[registry.getNumericId('ff0000')!]
    expect(data[ffOffset]).toBe((packed >>> 16) & 0xff) // R
    expect(data[ffOffset + 1]).toBe((packed >>> 8) & 0xff) // G
    expect(data[ffOffset + 2]).toBe(packed & 0xff) // B
  })
})
