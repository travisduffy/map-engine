import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MapRenderer } from '../src/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { SectorRegistry } from '../src/SectorRegistry'
import type { SectorDefinitionFile } from '../src/types'
import { makeCanvas } from './testUtils'

function make4x4Buffer(): Uint8ClampedArray {
  // prettier-ignore
  return new Uint8ClampedArray([
    255, 0, 0, 255,   255, 0, 0, 255,   0, 255, 0, 255,   0, 255, 0, 255,
    255, 0, 0, 255,   255, 0, 0, 255,   0, 255, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   0, 0, 255, 255,   255, 255, 0, 255,   255, 255, 0, 255,
    0, 0, 255, 255,   0, 0, 255, 255,   255, 255, 0, 255,   255, 255, 0, 255,
  ])
}

const definition: SectorDefinitionFile = {
  ff0000: { name: 'Red Sector' },
  '00ff00': { name: 'Green Sector' },
  '0000ff': { name: 'Blue Sector' },
  ffff00: { name: 'Yellow Sector' },
}

describe('Render Gating (A1)', () => {
  let canvas: HTMLCanvasElement
  let registry: SectorRegistry
  let renderer: MapRenderer
  let capturedLoop: FrameRequestCallback

  beforeEach(() => {
    canvas = makeCanvas()
    registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      capturedLoop = cb
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    renderer = new MapRenderer(canvas, registry)
  })

  afterEach(() => {
    renderer?.destroy()
    canvas?.remove()
    vi.restoreAllMocks()
  })

  function tick(): void {
    capturedLoop(performance.now())
  }

  it('renders on the first tick (_dirty starts true)', () => {
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('skips render on 10 consecutive no-op ticks after first frame', () => {
    tick() // initial frame — dirty, renders, clears _dirty
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    for (let i = 0; i < 10; i++) tick()
    expect(spy).not.toHaveBeenCalled()
  })

  it('renders exactly once after pan sets dirty via InputController.onDirty', () => {
    tick() // initial frame
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 1,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 150,
        clientY: 100,
        bubbles: true,
      })
    )
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not render again after pan-triggered tick clears dirty', () => {
    tick() // initial frame
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 1,
        bubbles: true,
      })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 150,
        clientY: 100,
        bubbles: true,
      })
    )
    tick() // renders — dirty set by pan
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick() // no-op — dirty cleared by previous tick
    expect(spy).not.toHaveBeenCalled()
  })

  it('renders after setSectorColor sets dirty', () => {
    tick() // initial frame
    renderer.setSectorColor('ff0000', '#0000ff')
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('renders after resetSectorColor sets dirty', () => {
    tick() // initial frame
    renderer.resetSectorColor('ff0000')
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('renders after _flushPendingDirty sets dirty (in-tick patch path)', () => {
    tick() // initial frame
    renderer['_patchSectorPixels']('ff0000', 0, 0, 255)
    renderer['_flushPendingDirty']()
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('renders only once when multiple mutations share a tick', () => {
    tick() // initial frame
    renderer.setSectorColor('ff0000', '#0000ff')
    renderer.setSectorColor('00ff00', '#ff0000')
    const spy = vi.spyOn(
      (renderer['_backend'] as ThreeRenderBackend).getThreeRenderer(),
      'render'
    )
    tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
