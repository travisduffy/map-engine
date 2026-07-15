import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { NullRenderBackend } from '../src/render/NullRenderBackend'

describe('NullRenderBackend', () => {
  it('can be instantiated without error', () => {
    const backend = new NullRenderBackend()
    expect(backend).toBeTruthy()
  })

  it('exposes camera, scene, and mesh', () => {
    const backend = new NullRenderBackend()
    expect(backend.camera).toBeInstanceOf(THREE.OrthographicCamera)
    expect(backend.scene).toBeInstanceOf(THREE.Scene)
    expect(backend.mesh).toBeInstanceOf(THREE.Mesh)
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
    expect(() => backend.reuploadIndexTexture(new Uint16Array(0))).not.toThrow()
    expect(backend.getIndexTexture()).toBeNull()
  })

  it('getThreeRenderer throws', () => {
    const backend = new NullRenderBackend()
    expect(() => backend.getThreeRenderer()).toThrow(
      'NullRenderBackend: no WebGLRenderer'
    )
  })

  it('readSectorIdAt returns 0xffff when constructed without pixelIndices', () => {
    const backend = new NullRenderBackend()
    expect(backend.readSectorIdAt(0, 0)).toBe(0xffff)
    expect(backend.readSectorIdAt(-1, -1)).toBe(0xffff)
    expect(backend.readSectorIdAt(100, 100)).toBe(0xffff)
  })

  it('readSectorIdAt resolves numeric sector IDs from a constructor-provided pixelIndices snapshot (Epic 3 Task 3.4)', () => {
    // 2×2 grid: id 0, id 1 / id 2, VOID (0xffff)
    const pixelIndices = new Uint32Array([0, 1, 2, 0xffff])
    const backend = new NullRenderBackend(pixelIndices, 2, 2)

    expect(backend.readSectorIdAt(0, 0)).toBe(0)
    expect(backend.readSectorIdAt(1, 0)).toBe(1)
    expect(backend.readSectorIdAt(0, 1)).toBe(2)
    expect(backend.readSectorIdAt(1, 1)).toBe(0xffff)

    // Out-of-bounds returns sentinel
    expect(backend.readSectorIdAt(2, 0)).toBe(0xffff)
    expect(backend.readSectorIdAt(0, 2)).toBe(0xffff)
  })

  it('writePaletteEntry retains the last per-entry color patch (F-2.8)', () => {
    const backend = new NullRenderBackend()
    expect(() => backend.writePaletteEntry(3, 10, 20, 30)).not.toThrow()
    expect(backend.getPaletteEntry(3)).toEqual([10, 20, 30])
    expect(backend.getPaletteEntry(4)).toBeUndefined()
  })

  it('updateUniforms({palette}) retains the last full-palette replace (F-2.8)', () => {
    const backend = new NullRenderBackend()
    expect(backend.getLastPalette()).toBeNull()
    const palette = new Uint32Array([0xff0000, 0x00ff00])
    expect(() => backend.updateUniforms({ palette })).not.toThrow()
    expect(backend.getLastPalette()).toEqual(palette)
  })

  it('dispose() does not throw and readSectorIdAt remains safe afterward', () => {
    const pixelIndices = new Uint32Array([0])
    const backend = new NullRenderBackend(pixelIndices, 1, 1)

    expect(() => backend.dispose()).not.toThrow()
    expect(backend.readSectorIdAt(0, 0)).toBe(0)
  })
})
