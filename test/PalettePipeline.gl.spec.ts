import { describe, it, expect, vi } from 'vitest'
import { SectorBitmapParser } from '../src/SectorBitmapParser'
import { SectorRegistry } from '../src/SectorRegistry'
import { MapRenderer } from '../src/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { makeCanvas } from './testUtils'

async function buildRegistry(): Promise<SectorRegistry> {
  const parser = new SectorBitmapParser()
  const { buffer, width, height } = await parser.parse(
    '/test/fixtures/test-4x4.png'
  )
  const definition = await fetch('/test/fixtures/test-4x4.json').then(r =>
    r.json()
  )
  return new SectorRegistry(buffer, width, height, definition)
}

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

function countColor(
  pixels: Uint8Array,
  r: number,
  g: number,
  b: number
): number {
  let count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b) count++
  }
  return count
}

describe('GPU palette pipeline — Epic 4 Task 4.1', () => {
  it('a palette swap changes every sector pixel in one frame (gl.readPixels)', async () => {
    const registry = await buildRegistry()
    const canvas = makeCanvas(400, 400)
    let renderer: MapRenderer | undefined
    try {
      renderer = new MapRenderer(canvas, registry)
      renderer._pauseLoop()

      const before = readAllPixels(renderer, canvas)
      expect(countColor(before, 0xff, 0x00, 0x00)).toBeGreaterThan(0) // red
      expect(countColor(before, 0x00, 0xff, 0x00)).toBeGreaterThan(0) // green
      expect(countColor(before, 0x00, 0x00, 0xff)).toBeGreaterThan(0) // blue
      expect(countColor(before, 0xff, 0xff, 0x00)).toBeGreaterThan(0) // yellow

      const sectorCount = registry.idToHex.length
      renderer.setPalette(new Uint32Array(sectorCount).fill(0x808080))

      const after = readAllPixels(renderer, canvas)
      expect(countColor(after, 0xff, 0x00, 0x00)).toBe(0)
      expect(countColor(after, 0x00, 0xff, 0x00)).toBe(0)
      expect(countColor(after, 0x00, 0x00, 0xff)).toBe(0)
      expect(countColor(after, 0xff, 0xff, 0x00)).toBe(0)
      expect(countColor(after, 0x80, 0x80, 0x80)).toBeGreaterThan(0)
    } finally {
      renderer?.destroy()
      canvas.remove()
    }
  })

  it('palette swaps write only the palette LUT — zero index-texture re-uploads across 10 swaps', async () => {
    const registry = await buildRegistry()
    const canvas = makeCanvas(400, 400)
    let renderer: MapRenderer | undefined
    try {
      renderer = new MapRenderer(canvas, registry)
      renderer._pauseLoop()
      const backend = renderer['_backend'] as ThreeRenderBackend
      const indexVersionBefore = backend['_indexTexture'].version
      const sectorCount = registry.idToHex.length

      for (let i = 0; i < 10; i++) {
        backend._setPaletteUniformDirect(new Uint32Array(sectorCount).fill(i))
        backend.render(renderer.scene, renderer.camera)
      }

      expect(backend['_indexTexture'].version).toBe(indexVersionBefore)
    } finally {
      renderer?.destroy()
      canvas.remove()
    }
  })

  it('sectorCount above MAX_TEXTURE_SIZE wraps the palette LUT into a 2D layout', () => {
    const canvas = makeCanvas(64, 64)
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
    const originalGetParameter = gl.getParameter.bind(gl)
    vi.spyOn(gl, 'getParameter').mockImplementation((pname: number) => {
      if (pname === gl.MAX_TEXTURE_SIZE) return 4
      return originalGetParameter(pname)
    })

    const sectorCount = 10 // > mocked MAX_TEXTURE_SIZE of 4 → must wrap to 2D
    const pixelIndices = new Uint32Array(16).fill(0xffff)
    const initialPalette = new Uint32Array(sectorCount).fill(0xff0000)

    const backend = new ThreeRenderBackend(
      canvas,
      2,
      2,
      4,
      4,
      pixelIndices,
      sectorCount,
      initialPalette
    )
    expect(backend.material.uniforms.paletteWidth.value).toBe(4)
    backend.dispose()
    canvas.remove()
  })
})
