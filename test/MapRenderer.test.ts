import * as THREE from 'three'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { MapRenderer } from '../src/core/MapRenderer'
import { NullRenderBackend } from '../src/render/NullRenderBackend'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { SectorRegistry } from '../src/sector/SectorRegistry'
import type { SectorDefinitionFile } from '../src/shared/types'

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
      const backend = renderer['_backend'] as ThreeRenderBackend
      expect(backend.getThreeRenderer()).toBeInstanceOf(THREE.WebGLRenderer)
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
      const backend = renderer['_backend'] as ThreeRenderBackend
      expect(
        backend.getThreeRenderer().info.render.frame
      ).toBeGreaterThanOrEqual(1)
    })

    it('camera uses contain framing — 800×600 canvas with 4×4 bitmap (square) → frustum wider than tall', () => {
      // canvasAspect = 800/600 ≈ 1.333; bitmapAspect = 4/4 = 1.0
      // canvasAspect >= bitmapAspect → frustumHalfH = 2, frustumHalfW = 2 * 1.333... ≈ 2.667
      expect(renderer.camera.top).toBeCloseTo(2, 5)
      expect(renderer.camera.bottom).toBeCloseTo(-2, 5)
    })
  })

  describe('backend construction (Epic 4 B2)', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('registry.sourceBuffer is null after construction (PR-1 memory disposal)', () => {
      expect(registry.sourceBuffer).toBeNull()
    })

    it('material uniforms wire the index and palette LUT textures', () => {
      const backend = renderer['_backend'] as ThreeRenderBackend
      expect(backend.material.uniforms.indexTex.value).not.toBeNull()
      expect(backend.material.uniforms.paletteTex.value).not.toBeNull()
      expect(backend.material.uniforms.sectorCount.value).toBe(
        registry.idToHex.length
      )
    })
  })

  describe('color mutation (Epic 4 B2 — palette LUT)', () => {
    let backend: NullRenderBackend

    beforeEach(() => {
      backend = new NullRenderBackend(
        registry.pixelIndices,
        registry.width,
        registry.height
      )
      renderer = new MapRenderer(
        canvas,
        registry,
        undefined,
        undefined,
        undefined,
        backend
      )
    })

    // ── setSectorColor ────────────────────────────────────────────────────────

    it('setSectorColor writes the correct RGB to the sector numeric LUT entry', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      const numId = registry.getNumericId('ff0000')!
      expect(backend.getPaletteEntry(numId)).toEqual([0, 0, 255])
    })

    it('setSectorColor does not mutate an adjacent sector entry', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      const greenId = registry.getNumericId('00ff00')!
      expect(backend.getPaletteEntry(greenId)).toBeUndefined()
    })

    it('setSectorColor: registry.sourceBuffer remains null (PR-1 — not mutated)', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      expect(registry.sourceBuffer).toBeNull()
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

    it('resetSectorColor restores the original RGB after setSectorColor', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      renderer.resetSectorColor('ff0000')
      const numId = registry.getNumericId('ff0000')!
      const packed = registry.idToPackedRgb[numId]
      expect(backend.getPaletteEntry(numId)).toEqual([
        (packed >>> 16) & 0xff,
        (packed >>> 8) & 0xff,
        packed & 0xff,
      ])
    })

    it('resetSectorColor: registry.sourceBuffer remains null (PR-1 — not mutated)', () => {
      renderer.setSectorColor('ff0000', '#0000ff')
      renderer.resetSectorColor('ff0000')
      expect(registry.sourceBuffer).toBeNull()
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

  describe('middle-button pan (CA-3)', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('middle-button drag rightward decreases camera.position.x', () => {
      const before = renderer.camera.position.x
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
      expect(renderer.camera.position.x).toBeLessThan(before)
    })

    it('middle-button drag downward increases camera.position.y', () => {
      const before = renderer.camera.position.y
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
          clientX: 100,
          clientY: 150,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.y).toBeGreaterThan(before)
    })

    it('left-button pointerdown does not start pan', () => {
      const before = renderer.camera.position.x
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0, // left button — must not trigger pan
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(before)
    })

    it('pointermove without any pointerdown does not move camera', () => {
      const before = renderer.camera.position.x
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 100,
          clientY: 100,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(before)
    })

    it('middle-button pointerup stops pan', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 1,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { button: 1, bubbles: true })
      )
      const after = renderer.camera.position.x
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(after)
    })

    it('pan does not start before dead zone — camera stationary after 2 CSS px move', () => {
      const before = renderer.camera.position.x
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
          clientX: 102,
          clientY: 100,
          buttons: 4, // middle button bitmask
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(before)
    })

    it('isPanning is true while middle button held', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 1,
          bubbles: true,
        })
      )
      expect(renderer.isPanning).toBe(true)
    })

    it('isPanning is false after middle-button pointerup', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 1,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { button: 1, bubbles: true })
      )
      expect(renderer.isPanning).toBe(false)
    })

    it('isPanning is false after left-button pointerdown (left does not trigger pan)', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0, // left button — must not trigger pan
          bubbles: true,
        })
      )
      expect(renderer.isPanning).toBe(false)
    })

    it('pointercancel resets pan state — subsequent move does not pan', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 1,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
      const after = renderer.camera.position.x
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(after)
    })

    it('clampPan clamps camera.position.x to bitmap + 10% margin', () => {
      renderer.camera.position.x = registry.width * 2
      renderer.clampPan()
      const maxX = registry.width / 2 + registry.width * 0.1
      expect(renderer.camera.position.x).toBeLessThanOrEqual(maxX)
    })

    it('clampPan clamps camera.position.y to bitmap + 10% margin', () => {
      renderer.camera.position.y = registry.height * 2
      renderer.clampPan()
      const maxY = registry.height / 2 + registry.height * 0.1
      expect(renderer.camera.position.y).toBeLessThanOrEqual(maxY)
    })

    it('clampPan clamps negative x', () => {
      renderer.camera.position.x = -registry.width * 2
      renderer.clampPan()
      const minX = -(registry.width / 2 + registry.width * 0.1)
      expect(renderer.camera.position.x).toBeGreaterThanOrEqual(minX)
    })
  })

  describe('scroll-wheel zoom (Task 2.6)', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('wheel with deltaY: -100 increases camera.zoom', () => {
      const before = renderer.camera.zoom
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true })
      )
      expect(renderer.camera.zoom).toBeGreaterThan(before)
    })

    it('wheel with deltaY: +100 decreases camera.zoom', () => {
      const before = renderer.camera.zoom
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 100, bubbles: true })
      )
      expect(renderer.camera.zoom).toBeLessThan(before)
    })

    it('zoom clamps at max 20.0 — further zoom-in does not exceed 20', () => {
      renderer.camera.zoom = 20.0
      renderer.camera.updateProjectionMatrix()
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true })
      )
      expect(renderer.camera.zoom).toBe(20.0)
    })

    it('zoom clamps at min 0.5 — further zoom-out does not go below 0.5', () => {
      renderer.camera.zoom = 0.5
      renderer.camera.updateProjectionMatrix()
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 100, bubbles: true })
      )
      expect(renderer.camera.zoom).toBe(0.5)
    })

    it('clampPan is called after zoom — out-of-bounds pan position is corrected', () => {
      renderer.camera.position.x = registry.width * 2
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true })
      )
      const maxX = registry.width / 2 + registry.width * 0.1
      expect(renderer.camera.position.x).toBeLessThanOrEqual(maxX)
    })

    it('wheel zooms toward cursor — camera offset applied when cursor is right of center', () => {
      // Camera starts at (0,0). Zoom in with cursor right of canvas center.
      // ndcX > 0 → camera.position.x must increase (world under cursor stays fixed).
      const cursorX = canvas.clientWidth / 2 + 100 // right of center → ndcX > 0
      const cursorY = canvas.clientHeight / 2
      const before = renderer.camera.position.x
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: cursorX,
          clientY: cursorY,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBeGreaterThan(before)
    })

    it('wheel zooms toward cursor — no offset when cursor is exactly at canvas center', () => {
      // ndcX === 0, ndcY === 0 → delta is zero → camera position unchanged
      const cursorX = canvas.clientWidth / 2
      const cursorY = canvas.clientHeight / 2
      const before = renderer.camera.position.x
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: cursorX,
          clientY: cursorY,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(before)
    })
  })

  describe('left-button drag tracking (CA-3)', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('isLeftDragging is false at construction', () => {
      expect(renderer.isLeftDragging).toBe(false)
    })

    it('leftHasDragged is false at construction', () => {
      expect(renderer.leftHasDragged).toBe(false)
    })

    it('isLeftDragging false after sub-dead-zone move (2px)', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 102,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      expect(renderer.isLeftDragging).toBe(false)
    })

    it('isLeftDragging true after super-dead-zone move (10px)', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 110,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      expect(renderer.isLeftDragging).toBe(true)
    })

    it('leftHasDragged true and sticky after super-dead-zone move', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 110,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      expect(renderer.leftHasDragged).toBe(true)
    })

    it('leftHasDragged persists after pointerup (sticky — survives synthesized click)', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 110,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, bubbles: true })
      )
      expect(renderer.leftHasDragged).toBe(true)
    })

    it('isLeftDragging is false after pointerup', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 110,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, bubbles: true })
      )
      expect(renderer.isLeftDragging).toBe(false)
    })

    it('leftHasDragged resets to false on next left pointerdown', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 110,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { button: 0, bubbles: true })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 200,
          clientY: 200,
          button: 0,
          bubbles: true,
        })
      )
      expect(renderer.leftHasDragged).toBe(false)
    })

    it('pointercancel resets left drag state — subsequent move does not set isLeftDragging', () => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          bubbles: true,
        })
      )
      expect(renderer.isLeftDragging).toBe(false)
    })

    it('left-button drag does not affect camera position (no pan)', () => {
      const before = renderer.camera.position.x
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(before)
    })
  })

  describe('touch pan and pinch zoom', () => {
    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    const touch = (
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number
    ) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerType: 'touch',
          pointerId,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
          bubbles: true,
        })
      )

    it('one-finger touch drag moves the view', () => {
      const before = renderer.camera.position.x
      touch('pointerdown', 1, 100, 100)
      touch('pointermove', 1, 150, 100)
      expect(renderer.camera.position.x).toBeLessThan(before)
    })

    it('one-finger touch move inside the dead zone does not pan', () => {
      const before = renderer.camera.position.x
      touch('pointerdown', 1, 100, 100)
      touch('pointermove', 1, 102, 100)
      expect(renderer.camera.position.x).toBe(before)
    })

    it('two-finger pinch out increases camera.zoom', () => {
      const before = renderer.camera.zoom
      touch('pointerdown', 1, 350, 300)
      touch('pointerdown', 2, 450, 300)
      touch('pointermove', 2, 550, 300)
      expect(renderer.camera.zoom).toBeGreaterThan(before)
    })

    it('two-finger pinch in decreases camera.zoom', () => {
      const before = renderer.camera.zoom
      touch('pointerdown', 1, 250, 300)
      touch('pointerdown', 2, 550, 300)
      touch('pointermove', 2, 450, 300)
      expect(renderer.camera.zoom).toBeLessThan(before)
    })

    it('lifting one finger of a pinch does not jump the view', () => {
      touch('pointerdown', 1, 350, 300)
      touch('pointerdown', 2, 450, 300)
      touch('pointermove', 1, 400, 300)
      touch('pointerup', 2, 450, 300)
      const before = renderer.camera.position.clone()
      touch('pointermove', 1, 401, 300)
      expect(renderer.camera.position.x).toBe(before.x)
      expect(renderer.camera.position.y).toBe(before.y)
      touch('pointermove', 1, 460, 300)
      expect(renderer.camera.position.x).toBeLessThan(before.x)
    })

    it('a pinch with no move sets leftHasDragged', () => {
      touch('pointerdown', 1, 350, 300)
      touch('pointerdown', 2, 450, 300)
      touch('pointerup', 2, 450, 300)
      touch('pointerup', 1, 350, 300)
      expect(renderer.leftHasDragged).toBe(true)
    })

    it('pointercancel of a touch ends the gesture', () => {
      touch('pointerdown', 1, 100, 100)
      touch('pointermove', 1, 150, 100)
      canvas.dispatchEvent(
        new PointerEvent('pointercancel', {
          pointerType: 'touch',
          pointerId: 1,
          bubbles: true,
        })
      )
      expect(renderer.isPanning).toBe(false)
      const before = renderer.camera.position.x
      touch('pointermove', 1, 200, 100)
      expect(renderer.camera.position.x).toBe(before)
    })

    it('a third finger changes neither zoom nor position', () => {
      touch('pointerdown', 1, 350, 300)
      touch('pointerdown', 2, 450, 300)
      touch('pointerdown', 3, 400, 400)
      const zoom = renderer.camera.zoom
      const position = renderer.camera.position.clone()
      touch('pointermove', 3, 500, 500)
      expect(renderer.camera.zoom).toBe(zoom)
      expect(renderer.camera.position.x).toBe(position.x)
      expect(renderer.camera.position.y).toBe(position.y)
    })

    it('isPanning is true during a touch pan', () => {
      touch('pointerdown', 1, 100, 100)
      touch('pointermove', 1, 150, 100)
      expect(renderer.isPanning).toBe(true)
    })

    it('mouse left-drag still does not pan', () => {
      const before = renderer.camera.position.x
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          button: 0,
          bubbles: true,
        })
      )
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        })
      )
      expect(renderer.camera.position.x).toBe(before)
      expect(renderer.isPanning).toBe(false)
    })
  })

  describe('camera API', () => {
    const setCanvasWidth = (width: number) => {
      Object.defineProperty(canvas, 'clientWidth', {
        value: width,
        configurable: true,
      })
    }

    const expectBoxFilled = () => {
      const [left, top] = renderer.project(0.5, 0.5)
      const [right, bottom] = renderer.project(2.5, 2.5)
      const slack = 1e-6
      expect(left).toBeGreaterThanOrEqual(-slack)
      expect(top).toBeGreaterThanOrEqual(-slack)
      expect(right).toBeLessThanOrEqual(canvas.clientWidth + slack)
      expect(bottom).toBeLessThanOrEqual(canvas.clientHeight + slack)
      const spansWidth = Math.abs(right - left - canvas.clientWidth) < 1e-6
      const spansHeight = Math.abs(bottom - top - canvas.clientHeight) < 1e-6
      expect(spansWidth || spansHeight).toBe(true)
    }

    const useCanvas = (width: number, height: number) => {
      renderer.destroy()
      canvas.remove()
      canvas = makeCanvas(width, height)
      renderer = new MapRenderer(canvas, registry)
    }

    // The whole 4 by 4 bitmap as a box, in CSS pixels of the canvas.
    const bitmapEdges = () => {
      const [left, top] = renderer.project(-0.5, -0.5)
      const [right, bottom] = renderer.project(3.5, 3.5)
      return { left, top, right, bottom }
    }

    const expectBitmapCovers = () => {
      const { left, top, right, bottom } = bitmapEdges()
      const slack = 1e-6
      expect(left).toBeLessThanOrEqual(slack)
      expect(top).toBeLessThanOrEqual(slack)
      expect(right).toBeGreaterThanOrEqual(canvas.clientWidth - slack)
      expect(bottom).toBeGreaterThanOrEqual(canvas.clientHeight - slack)
    }

    beforeEach(() => {
      renderer = new MapRenderer(canvas, registry)
    })

    it('_getView after construction is the contain fit', () => {
      const view = renderer._getView()
      expect(view.centerX).toBeCloseTo(2)
      expect(view.centerY).toBeCloseTo(2)
      expect(view.zoom).toBeCloseTo(1)
    })

    it('setView then _getView round-trips', () => {
      renderer._setView({ centerX: 1, centerY: 3, zoom: 4 })
      const view = renderer._getView()
      expect(view.centerX).toBeCloseTo(1)
      expect(view.centerY).toBeCloseTo(3)
      expect(view.zoom).toBeCloseTo(4)
    })

    it('setView clamps zoom to [0.5, 20]', () => {
      renderer._setView({ zoom: 100 })
      expect(renderer._getView().zoom).toBe(20)
      renderer._setView({ zoom: 0.1 })
      expect(renderer._getView().zoom).toBe(0.5)
    })

    it('fitBounds contains the sector bbox', () => {
      renderer._fitBounds([1, 1, 2, 2], 0, false)
      expectBoxFilled()
    })

    it('keepOnResize fits again after a canvas resize', () => {
      renderer._fitBounds([1, 1, 2, 2], 0, true)
      const zoomBefore = renderer._getView().zoom
      setCanvasWidth(500)
      renderer['_loop']()
      expect(renderer._getView().zoom).not.toBe(zoomBefore)
      expectBoxFilled()
    })

    it('fitBounds contain on a tall canvas leaves a band above and below', () => {
      useCanvas(300, 900)
      renderer._fitBounds([0, 0, 3, 3], 0, false)
      const { top, bottom } = bitmapEdges()
      expect(top).toBeGreaterThan(0)
      expect(bottom).toBeLessThan(canvas.clientHeight)
    })

    it('fitBounds cover on a tall canvas fills both axes', () => {
      useCanvas(300, 900)
      renderer._fitBounds([0, 0, 3, 3], 0, false)
      const containZoom = renderer._getView().zoom
      renderer._fitBounds([0, 0, 3, 3], 0, false, 'cover')
      expectBitmapCovers()
      expect(renderer._getView().zoom).toBeCloseTo(containZoom * 3)
    })

    it('fitBounds cover on a wide canvas fills both axes', () => {
      useCanvas(1200, 300)
      renderer._fitBounds([0, 0, 3, 3], 0, false)
      const containZoom = renderer._getView().zoom
      renderer._fitBounds([0, 0, 3, 3], 0, false, 'cover')
      expectBitmapCovers()
      expect(renderer._getView().zoom).toBeCloseTo(containZoom * 4)
    })

    it('cover with padding keeps a band of padding on the longer axis', () => {
      useCanvas(300, 900)
      renderer._fitBounds([0, 0, 3, 3], 50, false, 'cover')
      const { top, bottom } = bitmapEdges()
      expect(top).toBeCloseTo(50)
      expect(bottom).toBeCloseTo(850)
    })

    it('keepOnResize with cover keeps the fill after a resize', () => {
      useCanvas(300, 900)
      renderer._fitBounds([0, 0, 3, 3], 0, true, 'cover')
      setCanvasWidth(500)
      renderer['_loop']()
      expectBitmapCovers()
    })

    it('a pan after a cover fit stays inside the 10% bound', () => {
      useCanvas(300, 900)
      renderer._fitBounds([0, 0, 3, 3], 0, false, 'cover')
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true })
      )
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
          clientX: 5000,
          clientY: 5000,
          buttons: 4,
          bubbles: true,
        })
      )
      const maxX = registry.width / 2 + registry.width * 0.1
      const maxY = registry.height / 2 + registry.height * 0.1
      expect(Math.abs(renderer.camera.position.x)).toBeLessThanOrEqual(maxX)
      expect(Math.abs(renderer.camera.position.y)).toBeLessThanOrEqual(maxY)
    })

    it('a viewChange handler that throws does not skip the render', () => {
      const render = vi.spyOn(renderer['_backend'], 'render')
      renderer._onViewChange = () => {
        throw new Error('handler failed')
      }
      expect(() => renderer['_loop']()).toThrow('handler failed')
      expect(render).toHaveBeenCalledTimes(1)
      expect(renderer['_isDirty']).toBe(false)
    })

    it('a wheel zoom ends keepOnResize', () => {
      renderer._fitBounds([1, 1, 2, 2], 0, true)
      const zoomFitted = renderer._getView().zoom
      setCanvasWidth(500)
      renderer['_loop']()
      const zoomResized = renderer._getView().zoom
      expect(zoomResized).not.toBe(zoomFitted)
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true })
      )
      const zoomWheeled = renderer._getView().zoom
      expect(zoomWheeled).not.toBe(zoomResized)
      setCanvasWidth(400)
      renderer['_loop']()
      expect(renderer._getView().zoom).toBe(zoomWheeled)
    })
  })

  describe('destroy', () => {
    it('does not throw', () => {
      renderer = new MapRenderer(canvas, registry)
      expect(() => renderer.destroy()).not.toThrow()
    })

    it('second destroy() call does not throw (idempotent)', () => {
      renderer = new MapRenderer(canvas, registry)
      renderer.destroy()
      expect(() => renderer.destroy()).not.toThrow()
    })
  })
})
