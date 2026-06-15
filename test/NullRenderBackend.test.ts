import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { NullRenderBackend } from '../src/render/NullRenderBackend'

describe('NullRenderBackend', () => {
  it('can be instantiated without error', () => {
    const backend = new NullRenderBackend()
    expect(backend).toBeTruthy()
  })

  it('exposes camera, scene, mesh, and texture', () => {
    const backend = new NullRenderBackend()
    expect(backend.camera).toBeInstanceOf(THREE.OrthographicCamera)
    expect(backend.scene).toBeInstanceOf(THREE.Scene)
    expect(backend.mesh).toBeInstanceOf(THREE.Mesh)
    expect(backend.texture).toBeInstanceOf(THREE.Texture)
  })

  it('camera is positioned at (0, 0, 1)', () => {
    const backend = new NullRenderBackend()
    expect(backend.camera.position.x).toBe(0)
    expect(backend.camera.position.y).toBe(0)
    expect(backend.camera.position.z).toBe(1)
  })

  it('all no-op methods complete without error', () => {
    const backend = new NullRenderBackend()
    expect(() =>
      backend.uploadBorderEdges(new Float32Array(0), 0)
    ).not.toThrow()
    expect(() => backend.updateUniforms({})).not.toThrow()
    expect(() => backend.render(backend.scene, backend.camera)).not.toThrow()
    expect(() => backend.setSize(800, 600)).not.toThrow()
    expect(() => backend.getThreeScene()).not.toThrow()
    expect(backend.getThreeScene()).toBe(backend.scene)
  })

  it('getThreeRenderer throws', () => {
    const backend = new NullRenderBackend()
    expect(() => backend.getThreeRenderer()).toThrow(
      'NullRenderBackend: no WebGLRenderer'
    )
  })

  it('readSectorIdAt returns 0xffff when no texture has been uploaded', () => {
    const backend = new NullRenderBackend()
    expect(backend.readSectorIdAt(0, 0)).toBe(0xffff)
    expect(backend.readSectorIdAt(-1, -1)).toBe(0xffff)
    expect(backend.readSectorIdAt(100, 100)).toBe(0xffff)
  })

  it('uploadTexture slices image data from an OffscreenCanvas-backed texture; readSectorIdAt returns packed RGB', () => {
    const backend = new NullRenderBackend()

    // 2×2 canvas: top-left = red (ff0000)
    const offscreen = new OffscreenCanvas(2, 2)
    const ctx = offscreen.getContext('2d')!
    const pixels = new Uint8ClampedArray([
      255,
      0,
      0,
      255, // (0,0) red
      0,
      255,
      0,
      255, // (1,0) green
      0,
      0,
      255,
      255, // (0,1) blue
      255,
      255,
      0,
      255, // (1,1) yellow
    ])
    ctx.putImageData(new ImageData(pixels, 2, 2), 0, 0)

    const tex = new THREE.CanvasTexture(offscreen)
    backend.uploadTexture(tex)

    // Slice was captured — bounds-checked lookup returns packed RGB
    expect(backend.readSectorIdAt(0, 0)).toBe(0xff0000) // red
    expect(backend.readSectorIdAt(1, 0)).toBe(0x00ff00) // green
    expect(backend.readSectorIdAt(0, 1)).toBe(0x0000ff) // blue

    // Out-of-bounds returns sentinel
    expect(backend.readSectorIdAt(2, 0)).toBe(0xffff)
    expect(backend.readSectorIdAt(0, 2)).toBe(0xffff)
  })

  it('dispose() clears the sliced image data reference', () => {
    const backend = new NullRenderBackend()

    const offscreen = new OffscreenCanvas(2, 2)
    const ctx = offscreen.getContext('2d')!
    ctx.fillStyle = 'red'
    ctx.fillRect(0, 0, 2, 2)
    const tex = new THREE.CanvasTexture(offscreen)
    backend.uploadTexture(tex)

    // Confirm slice was captured
    expect(backend['_imageData']).not.toBeNull()

    backend.dispose()
    expect(backend['_imageData']).toBeNull()

    // readSectorIdAt is safe after dispose
    expect(backend.readSectorIdAt(0, 0)).toBe(0xffff)
  })
})
