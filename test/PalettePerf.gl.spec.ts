import { describe, it, expect } from 'vitest'

import { MapRenderer } from '../src/core/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { SectorBitmapParser } from '../src/sector/SectorBitmapParser'
import { SectorRegistry } from '../src/sector/SectorRegistry'
import { makeCanvas } from './test-utils'

/**
 * B2 performance gate (Epic 4 Task 4.2): median full-map palette swap on
 * `test/fixtures/maps/large.png` (4096×4096, single-sector) rendered to a
 * 1920×1080 canvas — representative full-viewport fragment-shader cost.
 * Logs the renderer string + median so the result can be captured into
 * `bench/baselines.json` (ROADMAP §12.2: perf gates run locally/GPU-runner;
 * CI applies a 5.0× software-rendering tolerance).
 */
describe('B2 performance gate — Epic 4 Task 4.2', () => {
  it('median of 10 full-map palette swaps completes in a bounded time', async () => {
    const parser = new SectorBitmapParser()
    const { buffer, width, height } = await parser.parse(
      '/test/fixtures/maps/large.png'
    )
    const definition = { ffffff: { name: 'All' } }
    const registry = new SectorRegistry(buffer, width, height, definition)

    const canvas = makeCanvas(1920, 1080)
    let renderer: MapRenderer | undefined
    try {
      renderer = new MapRenderer(canvas, registry)
      renderer._pauseLoop()
      const backend = renderer['_backend'] as ThreeRenderBackend
      const gl = backend
        .getThreeRenderer()
        .getContext() as WebGL2RenderingContext
      // gl.RENDERER is masked by default ("WebKit WebGL"); the debug
      // extension exposes the real (unmasked) renderer string needed to
      // detect software rendering (SwiftShader/llvmpipe) for the tolerance.
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      const rendererString = debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))

      // Warm up (shader compile, first-frame allocations) before timing.
      backend.render(renderer.scene, renderer.camera)

      const samples: number[] = []
      for (let i = 0; i < 10; i++) {
        const start = performance.now()
        backend._setPaletteUniformDirect(new Uint32Array([i]))
        backend.render(renderer.scene, renderer.camera)
        samples.push(performance.now() - start)
      }

      samples.sort((a, b) => a - b)
      const median = samples[Math.floor(samples.length / 2)]

      const isSoftwareRendered = /swiftshader|llvmpipe|software/i.test(
        rendererString
      )
      const toleranceMs = isSoftwareRendered ? 5.0 : 1.0

      console.log(
        `[bench:palette-swap] renderer="${rendererString}" median=${median.toFixed(3)}ms samples=${JSON.stringify(samples.map(s => Number(s.toFixed(3))))}`
      )

      expect(median).toBeLessThan(toleranceMs)
    } finally {
      renderer?.destroy()
      canvas.remove()
    }
  })
})
