import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SectorRegistry } from '../src/SectorRegistry'
import { MapEngine } from '../src/MapEngine'
import { toHexKey } from '../src/utils'
import { buildTestBuffer, makeCanvas } from './testUtils'
import type { SectorDefinitionFile } from '../src/types'

describe('AdjacencyGraph — Epic 3', () => {
  it("AC 3.1 — bidirectionality: each sector in the other's neighbor list", () => {
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    expect(registry.getNeighbors('ff0000')).toContain('00ff00')
    expect(registry.getNeighbors('00ff00')).toContain('ff0000')
  })

  it('AC 3.1 — toHexKey consistency: getNeighbors(toHexKey(r,g,b)) is defined for a registered sector', () => {
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    // getNeighbors returns [] for unknown keys; known sectors return a real array
    expect(registry.getSector(toHexKey(255, 0, 0))).toBeDefined()
    expect(registry.getSector(toHexKey(0, 255, 0))).toBeDefined()
  })

  it('AC 3.2 — deduplication: long shared border appears exactly once in each neighbor list', () => {
    // Two columns of 2 pixels each — sectors share 2 vertical border segments
    const buf = buildTestBuffer(2, 2, [
      [255, 0, 0],
      [0, 255, 0],
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 2, def)
    expect(registry.getNeighbors('ff0000').length).toBe(1)
    expect(registry.getNeighbors('00ff00').length).toBe(1)
  })

  it('AC 3.3 — pre-initialization: definition sector with no pixels returns empty array, not undefined', () => {
    const buf = buildTestBuffer(1, 1, [[255, 0, 0]])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'Isolated — no pixels' },
    }
    const registry = new SectorRegistry(buf, 1, 1, def)
    const isolated = registry.getNeighbors('00ff00')
    expect(isolated).toBeDefined()
    expect(isolated.length).toBe(0)
  })

  it('AC 3.4 — bitmap-only color: not in definition, not a neighbor of any defined sector', () => {
    // ff0000 defined; 0000ff is bitmap-only
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 0, 255],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    // bitmap-only key is not a known sector
    expect(registry.getSector('0000ff')).toBeUndefined()
    // defined sector's neighbor list does not include bitmap-only color
    expect(registry.getNeighbors('ff0000')).not.toContain('0000ff')
  })

  it('AC 3.5 — 4-connectivity: diagonal-only contact does not create adjacency', () => {
    // Layout: A C / C B — A and B only touch diagonally; C is bitmap-only
    const A: [number, number, number] = [255, 0, 0]
    const B: [number, number, number] = [0, 255, 0]
    const C: [number, number, number] = [0, 0, 255]
    const buf = buildTestBuffer(2, 2, [A, C, C, B])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 2, def)
    expect(registry.getNeighbors('ff0000').length).toBe(0)
    expect(registry.getNeighbors('00ff00').length).toBe(0)
  })

  it('AC 3.7 — borderEdges is zero-initialized Float32Array placeholder (Phase 4 populates)', () => {
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    expect(registry.borderEdges).toBeInstanceOf(Float32Array)
    expect(registry.borderEdgeCount[0]).toBe(0)

    // Contour IS populated: each sector has 1 segment (the shared V-border)
    expect(registry.contourPointers).toBeInstanceOf(Uint32Array)
    expect(registry.contourPointers[1] - registry.contourPointers[0]).toBe(1)
    expect(registry.contourPointers[2] - registry.contourPointers[1]).toBe(1)
    expect(registry.contourPoints).toBeInstanceOf(Int16Array)
  })

  it('AC 3.9 — P-1/P-2: SectorRegistry.ts has no forbidden imports', async () => {
    const text = await fetch('/src/SectorRegistry.ts').then(r => r.text())
    expect(text).not.toMatch(/import.*three/)
    expect(text).not.toMatch(/\bdocument\b/)
    expect(text).not.toMatch(/\bwindow\b/)
    expect(text).not.toMatch(/HTMLCanvasElement/)
    expect(text).not.toMatch(/OffscreenCanvas/)
    expect(text).not.toMatch(/internal\/color/)
  })

  describe('AC 3.6 / 3.11 / pre-load guard — getNeighbors via MapEngine', () => {
    let engine: MapEngine
    let canvas: HTMLCanvasElement

    beforeEach(async () => {
      canvas = makeCanvas()
      engine = new MapEngine()
      await engine.loadMap({
        bitmapUrl: '/test/fixtures/test-4x4.png',
        definitionUrl: '/test/fixtures/test-4x4.json',
        canvas,
      })
    })

    afterEach(() => {
      engine?.destroy()
      canvas?.remove()
    })

    it('AC 3.6a — getNeighbors returns correct neighbors for a known sector', () => {
      const result = engine.getNeighbors('ff0000')
      expect(result).toBeDefined()
      // ff0000 (top-left 2×2) touches 00ff00 (right) and 0000ff (below)
      expect(result).toContain('00ff00')
      expect(result).toContain('0000ff')
      expect(result).not.toContain('ffff00')
    })

    it('AC 3.6b — getNeighbors returns undefined for a key not in the definition', () => {
      expect(engine.getNeighbors('aabbcc')).toBeUndefined()
    })

    it('AC 3.6c — getNeighbors returns empty array for a definition sector with no defined neighbors', async () => {
      // test-4x4-mismatch.json has 'ffffff' (not in bitmap) — isolated sector
      const canvas2 = makeCanvas()
      const engine2 = new MapEngine()
      try {
        await engine2.loadMap({
          bitmapUrl: '/test/fixtures/test-4x4.png',
          definitionUrl: '/test/fixtures/test-4x4-mismatch.json',
          canvas: canvas2,
        })
        const result = engine2.getNeighbors('ffffff')
        expect(result).toBeDefined()
        expect(result!.length).toBe(0)
      } finally {
        engine2.destroy()
        canvas2.remove()
      }
    })

    it('AC 3.6d — getNeighbors returns undefined for a bitmap-only key', async () => {
      // test-4x4-mismatch.json omits 'ffff00'; test-4x4.png has ffff00 pixels → bitmap-only
      const canvas2 = makeCanvas()
      const engine2 = new MapEngine()
      try {
        await engine2.loadMap({
          bitmapUrl: '/test/fixtures/test-4x4.png',
          definitionUrl: '/test/fixtures/test-4x4-mismatch.json',
          canvas: canvas2,
        })
        expect(engine2.getNeighbors('ffff00')).toBeUndefined()
      } finally {
        engine2.destroy()
        canvas2.remove()
      }
    })

    it('AC 3.11 — getNeighbors throws "MapEngine: destroyed" after destroy()', () => {
      engine.destroy()
      expect(() => engine.getNeighbors('ff0000')).toThrow(
        'MapEngine: destroyed'
      )
    })

    it('pre-load guard — getNeighbors throws "not loaded" before loadMap', () => {
      const freshEngine = new MapEngine()
      expect(() => freshEngine.getNeighbors('ff0000')).toThrow(
        'MapEngine: not loaded — call loadMap() first'
      )
    })
  })
})
