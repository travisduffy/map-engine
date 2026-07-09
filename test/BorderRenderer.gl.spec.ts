import { describe, it, expect, vi, afterEach } from 'vitest'
import { MapEngine } from '../src/MapEngine'
import type { MapRenderer } from '../src/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { makeCanvas } from './testUtils'

const BORDERS_BITMAP = '/test/fixtures/borders/maps/two-adjacent-groups.png'
const BORDERS_DEFINITION =
  '/test/fixtures/borders/maps/two-adjacent-groups.json'

function readAllPixels(
  renderer: MapRenderer,
  canvas: HTMLCanvasElement
): Uint8Array {
  const backend = renderer['_backend'] as ThreeRenderBackend
  backend.render(renderer.scene, renderer.camera)
  const gl = backend.getThreeRenderer().getContext() as WebGL2RenderingContext
  const w = canvas.width
  const h = canvas.height
  const pixels = new Uint8Array(w * h * 4)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  return pixels
}

/** Count of pixels whose RGB differs between two same-sized readbacks. */
function countDiffPixels(a: Uint8Array, b: Uint8Array): number {
  let diff = 0
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff++
  }
  return diff
}

describe('BorderRenderer + GPU VBO — Epic 8 Task 8.3 (CA-6, F-C.9)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
    vi.restoreAllMocks()
  })

  it('draws border segments after recomputeBorders() resolves (readPixels along the known border)', async () => {
    canvas = makeCanvas(400, 400)
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BORDERS_BITMAP,
      definitionUrl: BORDERS_DEFINITION,
      canvas,
    })
    const renderer = engine['_renderer'] as MapRenderer
    renderer._pauseLoop()

    // The border sits exactly on a sector boundary, so on this software
    // (SwiftShader/ANGLE) rasterizer it comes back as a partial-coverage
    // blend of the black line material with each side's fill color (e.g.
    // (128,0,0)/(0,128,0)) rather than pure (0,0,0) -- line antialiasing is
    // applied regardless of the renderer's `antialias: false` context option.
    // Assert on pixel-level CHANGE instead of an assumed exact color: the
    // "before" reading is only the two pure sector colors; any pixel that
    // differs in the "after" reading can only be the new border line.
    const before = readAllPixels(renderer, canvas)

    await engine.setParentMapping(new Uint16Array([0, 1]), 2)
    await engine.recomputeBorders()

    const after = readAllPixels(renderer, canvas)

    expect(countDiffPixels(before, after)).toBeGreaterThan(0)
  })

  it('sets renderer._dirty and renders exactly once on the next rAF after resolution', async () => {
    // Mocked rAF (test/RenderGating.test.ts pattern) -- installed BEFORE
    // loadMap() constructs the real MapRenderer, since its constructor calls
    // requestAnimationFrame(this._loop) directly. advanceFrame-style direct
    // hook invocation would bypass the dirty-gated render path entirely, so
    // this test drives the captured rAF callback instead.
    let capturedLoop: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      capturedLoop = cb
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BORDERS_BITMAP,
      definitionUrl: BORDERS_DEFINITION,
      canvas,
    })

    const renderer = engine['_renderer'] as MapRenderer
    const backend = renderer['_backend'] as ThreeRenderBackend
    const renderSpy = vi.spyOn(backend.getThreeRenderer(), 'render')

    // Drain the priming frame left over from loadMap()'s bootstrap
    // round-trip so the border resolution's own dirty-set is observed in
    // isolation.
    capturedLoop!(performance.now())
    renderSpy.mockClear()
    renderer._dirty = false

    await engine.setParentMapping(new Uint16Array([0, 1]), 2)
    await engine.recomputeBorders()

    expect(renderer._dirty).toBe(true)
    capturedLoop!(performance.now())
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it('getBorderSegments() returns the retained private copy, unaffected by bounce-back', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BORDERS_BITMAP,
      definitionUrl: BORDERS_DEFINITION,
      canvas,
    })
    await engine.setParentMapping(new Uint16Array([0, 1]), 2)
    await engine.recomputeBorders()

    const before = engine.getBorderSegments()!.slice()
    expect(before.length).toBeGreaterThan(0)

    // Drive one real frame via the actual `_loop` (bracket access -- private)
    // so the composite `_postRenderHook` bounces the pooled buffer back to
    // the Worker, detaching it. The retained copy must be immune.
    const renderer = engine['_renderer'] as MapRenderer
    renderer['_loop']()

    expect(engine.getBorderSegments()).toEqual(before)
  })

  it('setBordersVisible() toggles the drawn LineSegments without recomputing', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BORDERS_BITMAP,
      definitionUrl: BORDERS_DEFINITION,
      canvas,
    })
    await engine.setParentMapping(new Uint16Array([0, 1]), 2)
    await engine.recomputeBorders()

    const renderer = engine['_renderer'] as MapRenderer
    const borderRenderer = renderer['_borderRenderer'] as {
      lineSegments: { visible: boolean }
    }
    expect(borderRenderer.lineSegments.visible).toBe(true) // default

    engine.setBordersVisible(false)
    expect(borderRenderer.lineSegments.visible).toBe(false)

    engine.setBordersVisible(true)
    expect(borderRenderer.lineSegments.visible).toBe(true)
  })

  it('setBordersVisible() is a safe no-op before any border has been computed, and the choice is remembered', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BORDERS_BITMAP,
      definitionUrl: BORDERS_DEFINITION,
      canvas,
    })

    expect(() => engine.setBordersVisible(false)).not.toThrow()

    await engine.setParentMapping(new Uint16Array([0, 1]), 2)
    await engine.recomputeBorders()

    const renderer = engine['_renderer'] as MapRenderer
    const borderRenderer = renderer['_borderRenderer'] as {
      lineSegments: { visible: boolean }
    }
    // The pre-computation hide choice was remembered and applied on
    // BorderRenderer's lazy construction.
    expect(borderRenderer.lineSegments.visible).toBe(false)
  })
})
