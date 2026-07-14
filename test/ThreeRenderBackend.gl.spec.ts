import { describe, it, expect, vi } from 'vitest'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { WebGL2NotSupportedError } from '../src/shared/errors'
import { MapEngine } from '../src/core/MapEngine'
import type { MapRenderer } from '../src/core/MapRenderer'
import { makeCanvas } from './testUtils'

function makeIndices(width: number, height: number): Uint32Array {
  return new Uint32Array(width * height).fill(0xffff)
}

function makePalette(sectorCount: number): Uint32Array {
  return new Uint32Array(sectorCount).fill(0xff0000)
}

describe('ThreeRenderBackend — Epic 1 Task 1.3 (F-3.3)', () => {
  it('constructs on a real WebGL2 canvas without error and uploads the index texture', () => {
    const canvas = makeCanvas()
    let backend: ThreeRenderBackend | undefined
    expect(() => {
      backend = new ThreeRenderBackend(
        canvas,
        2,
        2,
        4,
        4,
        makeIndices(4, 4),
        4,
        makePalette(4)
      )
    }).not.toThrow()
    expect(backend!.getIndexTexture()).not.toBeNull()
    backend!.dispose()
    canvas.remove()
  })

  it('throws WebGL2NotSupportedError when the canvas is already bound to a WebGL1 context', () => {
    const canvas = makeCanvas()
    // A canvas may only ever bind one context type — pre-binding webgl forces
    // the backend's own canvas.getContext('webgl2') call to return null.
    canvas.getContext('webgl')

    expect(() => {
      new ThreeRenderBackend(
        canvas,
        2,
        2,
        4,
        4,
        makeIndices(4, 4),
        4,
        makePalette(4)
      )
    }).toThrow(WebGL2NotSupportedError)

    canvas.remove()
  })

  it('re-uploads the index texture and marks MapRenderer dirty on webglcontextrestored', async () => {
    const canvas = makeCanvas()
    const engine = new MapEngine()
    try {
      await engine.loadMap({
        bitmapUrl: '/test/fixtures/test-4x4.png',
        definitionUrl: '/test/fixtures/test-4x4.json',
        canvas,
      })
      const renderer = engine['_renderer'] as MapRenderer
      const backend = renderer['_backend'] as ThreeRenderBackend
      const reuploadSpy = vi.spyOn(backend, 'reuploadIndexTexture')

      renderer._isDirty = false
      canvas.dispatchEvent(new Event('webglcontextrestored'))

      expect(reuploadSpy).toHaveBeenCalledTimes(1)
      expect(renderer._isDirty).toBe(true)
    } finally {
      engine.destroy()
      canvas.remove()
    }
  })
})
