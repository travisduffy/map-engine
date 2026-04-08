import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { MapRenderer } from '../src/MapRenderer'
import { SectorRegistry } from '../src/SectorRegistry'
import type { SectorDefinitionFile } from '../src/types'

// 4×4 RGBA buffer — same layout as SectorRegistry tests
function make4x4Buffer(): Uint8ClampedArray {
  // prettier-ignore
  return new Uint8ClampedArray([
    // row 0
    255, 0, 0, 255,   255, 0, 0, 255,   0, 255, 0, 255,   0, 255, 0, 255,
    // row 1
    255, 0, 0, 255,   255, 0, 0, 255,   0, 255, 0, 255,   0, 255, 0, 255,
    // row 2
    0, 0, 255, 255,   0, 0, 255, 255,   255, 255, 0, 255,   255, 255, 0, 255,
    // row 3
    0, 0, 255, 255,   0, 0, 255, 255,   255, 255, 0, 255,   255, 255, 0, 255,
  ])
}

const definition: SectorDefinitionFile = {
  ff0000: { name: 'Red Sector' },
  '00ff00': { name: 'Green Sector' },
  '0000ff': { name: 'Blue Sector' },
  ffff00: { name: 'Yellow Sector' },
}

function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  // Force clientWidth/clientHeight by setting actual size too
  canvas.width = width
  canvas.height = height
  Object.defineProperty(canvas, 'clientWidth', {
    value: width,
    configurable: true,
  })
  Object.defineProperty(canvas, 'clientHeight', {
    value: height,
    configurable: true,
  })
  document.body.appendChild(canvas)
  return canvas
}

describe('MapRenderer', () => {
  let canvas: HTMLCanvasElement
  let registry: SectorRegistry
  let renderer: MapRenderer

  beforeEach(() => {
    canvas = makeCanvas(800, 600)
    registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
  })

  afterEach(() => {
    renderer?.destroy()
    canvas.remove()
  })

  it('throws when canvas has zero clientWidth', () => {
    const zeroCanvas = document.createElement('canvas')
    Object.defineProperty(zeroCanvas, 'clientWidth', {
      value: 0,
      configurable: true,
    })
    Object.defineProperty(zeroCanvas, 'clientHeight', {
      value: 600,
      configurable: true,
    })
    document.body.appendChild(zeroCanvas)
    expect(() => new MapRenderer(zeroCanvas, registry)).toThrow(
      'MapEngine: canvas has zero dimensions'
    )
    zeroCanvas.remove()
  })

  it('throws when canvas has zero clientHeight', () => {
    const zeroCanvas = document.createElement('canvas')
    Object.defineProperty(zeroCanvas, 'clientWidth', {
      value: 800,
      configurable: true,
    })
    Object.defineProperty(zeroCanvas, 'clientHeight', {
      value: 0,
      configurable: true,
    })
    document.body.appendChild(zeroCanvas)
    expect(() => new MapRenderer(zeroCanvas, registry)).toThrow(
      'MapEngine: canvas has zero dimensions'
    )
    zeroCanvas.remove()
  })

  it('error message matches spec exactly', () => {
    const zeroCanvas = document.createElement('canvas')
    Object.defineProperty(zeroCanvas, 'clientWidth', {
      value: 0,
      configurable: true,
    })
    Object.defineProperty(zeroCanvas, 'clientHeight', {
      value: 0,
      configurable: true,
    })
    document.body.appendChild(zeroCanvas)
    expect(() => new MapRenderer(zeroCanvas, registry)).toThrow(
      'MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM and has non-zero CSS dimensions before calling loadMap()'
    )
    zeroCanvas.remove()
  })

  describe('after construction', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('canvas has non-zero dimensions after construction', () => {
      expect(canvas.width).toBeGreaterThan(0)
      expect(canvas.height).toBeGreaterThan(0)
    })

    it('scene is a THREE.Scene', () => {
      expect(renderer.scene).toBeInstanceOf(THREE.Scene)
    })

    it('camera is a THREE.OrthographicCamera', () => {
      expect(renderer.camera).toBeInstanceOf(THREE.OrthographicCamera)
    })

    it('mesh is a THREE.Mesh added to the scene', () => {
      expect(renderer.mesh).toBeInstanceOf(THREE.Mesh)
      expect(renderer.scene.children).toContain(renderer.mesh)
    })

    it('renderer is a THREE.WebGLRenderer', () => {
      expect(renderer.renderer).toBeInstanceOf(THREE.WebGLRenderer)
    })

    it('PlaneGeometry UV at vertex 0 is u≈0.0, v≈1.0 (Three.js bottom-left UV origin)', () => {
      const geo = renderer.mesh.geometry as THREE.BufferGeometry
      const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute
      // Three.js PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right
      // Vertex 0 = top-left → UV (0, 1)
      expect(uvAttr.getX(0)).toBeCloseTo(0.0, 5)
      expect(uvAttr.getY(0)).toBeCloseTo(1.0, 5)
    })

    it('camera zoom is 1.0 at construction', () => {
      expect(renderer.camera.zoom).toBe(1.0)
    })

    it('camera position is at (0, 0, 1)', () => {
      expect(renderer.camera.position.x).toBe(0)
      expect(renderer.camera.position.y).toBe(0)
      expect(renderer.camera.position.z).toBe(1)
    })

    it('render loop fires at least one frame', async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      expect(renderer.renderer.info.render.frame).toBeGreaterThanOrEqual(1)
    })

    it('camera uses contain framing — 800×600 canvas with 4×4 bitmap (square) → frustum wider than tall', () => {
      // canvasAspect = 800/600 ≈ 1.333; bitmapAspect = 4/4 = 1.0
      // canvasAspect >= bitmapAspect → frustumHalfH = 2, frustumHalfW = 2 * 1.333... ≈ 2.667
      expect(renderer.camera.top).toBeCloseTo(2, 5)
      expect(renderer.camera.bottom).toBeCloseTo(-2, 5)
    })
  })

  describe('display canvas and texture (Task 2.2)', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('displayCtx is a non-null OffscreenCanvasRenderingContext2D', () => {
      expect(renderer.displayCtx).toBeTruthy()
      // OffscreenCanvasRenderingContext2D does not have a named constructor to instanceof-check,
      // but we can verify it has the expected API
      expect(typeof renderer.displayCtx.putImageData).toBe('function')
      expect(typeof renderer.displayCtx.getImageData).toBe('function')
    })

    it('displayImageData has the correct dimensions', () => {
      expect(renderer.displayImageData.width).toBe(registry.width)
      expect(renderer.displayImageData.height).toBe(registry.height)
    })

    it('displayImageData reflects the source bitmap colors on construction', () => {
      // Pixel (0,0) in the 4×4 buffer = red (255,0,0,255)
      const data = renderer.displayImageData.data
      expect(data[0]).toBe(255) // r
      expect(data[1]).toBe(0) // g
      expect(data[2]).toBe(0) // b
      expect(data[3]).toBe(255) // a
    })

    it('displayImageData is a separate copy from registry.sourceBuffer', () => {
      // Mutate displayImageData.data
      renderer.displayImageData.data[0] = 42
      // registry.sourceBuffer must be unchanged
      expect(registry.sourceBuffer[0]).toBe(255)
    })

    it('mutating registry.sourceBuffer does not affect displayImageData', () => {
      // Cast away readonly to simulate a mutation attempt
      ;(registry.sourceBuffer as Uint8ClampedArray)[0] = 99
      expect(renderer.displayImageData.data[0]).toBe(255)
      // Restore
      ;(registry.sourceBuffer as Uint8ClampedArray)[0] = 255
    })

    it('material.map is assigned (texture is wired into material)', () => {
      expect(renderer.material.map).not.toBeNull()
    })
  })

  describe('color mutation (Tasks 2.3 / 2.4)', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    // ── setSectorColor ────────────────────────────────────────────────────────

    it('setSectorColor writes the correct RGB to all sector pixels', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      const data = renderer.displayCtx.getImageData(0, 0, 4, 4).data
      // pixel (0,0) → flat index 0 → byte offset 0
      expect(data[0]).toBe(0)
      expect(data[1]).toBe(0)
      expect(data[2]).toBe(255)
      expect(data[3]).toBe(255)
      // pixel (1,1) → flat index 5 → byte offset 20
      expect(data[20]).toBe(0)
      expect(data[21]).toBe(0)
      expect(data[22]).toBe(255)
      expect(data[23]).toBe(255)
    })

    it('setSectorColor does not mutate an adjacent sector', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      const data = renderer.displayCtx.getImageData(0, 0, 4, 4).data
      // pixel (2,0) belongs to green sector — must remain green
      const offset = 2 * 4 // x=2, y=0
      expect(data[offset]).toBe(0)
      expect(data[offset + 1]).toBe(255)
      expect(data[offset + 2]).toBe(0)
      expect(data[offset + 3]).toBe(255)
    })

    it('setSectorColor does not mutate registry.sourceBuffer', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      // pixel (0,0) in sourceBuffer must still be red
      expect(registry.sourceBuffer[0]).toBe(255)
      expect(registry.sourceBuffer[1]).toBe(0)
      expect(registry.sourceBuffer[2]).toBe(0)
      expect(registry.sourceBuffer[3]).toBe(255)
    })

    it('setSectorColor: unknown hex key emits console.warn and does not throw', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => renderer.setSectorColor('aabbcc', '#ff0000')).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        '[MapEngine] setSectorColor: sector has no pixel data'
      )
      warn.mockRestore()
    })

    it('setSectorColor: zero-pixel sector (in definition, not in bitmap) emits console.warn and does not throw', () => {
      // Build a registry with an extra definition entry that has no bitmap pixels
      const defWithGhost = {
        ...definition,
        aabbcc: { name: 'Ghost Sector' },
      }
      const regWithGhost = new SectorRegistry(
        make4x4Buffer(),
        4,
        4,
        defWithGhost
      )
      const ghostRenderer = new MapRenderer(canvas, regWithGhost)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() =>
        ghostRenderer.setSectorColor('aabbcc', '#ff0000')
      ).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        '[MapEngine] setSectorColor: sector has no pixel data'
      )
      warn.mockRestore()
      ghostRenderer.destroy()
    })

    it('setSectorColor: invalid CSS color does not throw', () => {
      expect(() =>
        renderer.setSectorColor('ff0000', 'not-a-valid-color')
      ).not.toThrow()
    })

    // ── resetSectorColor ──────────────────────────────────────────────────────

    it('resetSectorColor restores original RGB after setSectorColor', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      renderer.resetSectorColor('ff0000')
      const data = renderer.displayCtx.getImageData(0, 0, 4, 4).data
      // pixel (0,0) must be back to red
      expect(data[0]).toBe(255)
      expect(data[1]).toBe(0)
      expect(data[2]).toBe(0)
      expect(data[3]).toBe(255)
      // pixel (1,1) too
      expect(data[20]).toBe(255)
      expect(data[21]).toBe(0)
      expect(data[22]).toBe(0)
      expect(data[23]).toBe(255)
    })

    it('resetSectorColor does not mutate registry.sourceBuffer', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      renderer.resetSectorColor('ff0000')
      expect(registry.sourceBuffer[0]).toBe(255)
      expect(registry.sourceBuffer[1]).toBe(0)
      expect(registry.sourceBuffer[2]).toBe(0)
      expect(registry.sourceBuffer[3]).toBe(255)
    })

    it('resetSectorColor: unknown hex key emits console.warn and does not throw', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => renderer.resetSectorColor('aabbcc')).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        '[MapEngine] resetSectorColor: sector has no pixel data'
      )
      warn.mockRestore()
    })
  })

  describe('destroy', () => {
    it('does not throw', () => {
      renderer = new MapRenderer(canvas, registry)
      expect(() => renderer.destroy()).not.toThrow()
    })
  })
})
