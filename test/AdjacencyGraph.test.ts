import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SectorRegistry } from '../src/SectorRegistry'
import { MapEngine } from '../src/MapEngine'
import { toHexKey } from '../src/utils'
import { buildTestBuffer, makeCanvas } from './testUtils'
import type { SectorDefinitionFile } from '../src/types'

describe('AdjacencyGraph — Epic 3', () => {
  it("AC 3.1 — bidirectionality: each sector in the other's adjacency set", () => {
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    expect(registry.adjacency.get('ff0000')!.has('00ff00')).toBe(true)
    expect(registry.adjacency.get('00ff00')!.has('ff0000')).toBe(true)
  })

  it('AC 3.1 — toHexKey consistency: adjacency.get(toHexKey(r,g,b)) is defined for a registered sector', () => {
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    expect(registry.adjacency.get(toHexKey(255, 0, 0))).toBeDefined()
    expect(registry.adjacency.get(toHexKey(0, 255, 0))).toBeDefined()
  })

  it('AC 3.2 — deduplication: long shared border appears exactly once in each set', () => {
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
    expect(registry.adjacency.get('ff0000')!.size).toBe(1)
    expect(registry.adjacency.get('00ff00')!.size).toBe(1)
  })

  it('AC 3.3 — pre-initialization: definition sector with no pixels returns empty set, not undefined', () => {
    const buf = buildTestBuffer(1, 1, [[255, 0, 0]])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'Isolated — no pixels' },
    }
    const registry = new SectorRegistry(buf, 1, 1, def)
    const isolated = registry.adjacency.get('00ff00')
    expect(isolated).toBeDefined()
    expect(isolated!.size).toBe(0)
  })

  it('AC 3.4 — bitmap-only color: not a key and not a value in adjacency', () => {
    // ff0000 defined; 0000ff is bitmap-only
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 0, 255],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    expect(registry.adjacency.has('0000ff')).toBe(false)
    for (const set of registry.adjacency.values()) {
      expect(set.has('0000ff')).toBe(false)
    }
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
    expect(registry.adjacency.get('ff0000')!.size).toBe(0)
    expect(registry.adjacency.get('00ff00')!.size).toBe(0)
  })

  it('AC 3.7 — borderEdges retained: correct values; @deprecated JSDoc verified by code review', () => {
    // @deprecated on borderEdges (SectorRegistry.ts) and BorderEdge (types.ts) is
    // a JSDoc annotation stripped by esbuild — verified by reading source, not fetching.
    const buf = buildTestBuffer(2, 1, [
      [255, 0, 0],
      [0, 255, 0],
    ])
    const def: SectorDefinitionFile = {
      ff0000: { name: 'A' },
      '00ff00': { name: 'B' },
    }
    const registry = new SectorRegistry(buf, 2, 1, def)
    expect(registry.borderEdges).toHaveLength(1)
    expect(registry.borderEdges[0]).toMatchObject({
      x: 0,
      y: 0,
      direction: 'h',
      sectorA: 'ff0000',
      sectorB: '00ff00',
    })
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

    it('AC 3.6a — getNeighbors returns === reference to registry.adjacency.get(hexKey)', () => {
      const result = engine.getNeighbors('ff0000')
      const expected = engine.registry.adjacency.get('ff0000')
      expect(result).toBe(expected)
    })

    it('AC 3.6b — getNeighbors returns undefined for a key not in the definition', () => {
      expect(engine.getNeighbors('aabbcc')).toBeUndefined()
    })

    it('AC 3.6c — getNeighbors returns empty set for a definition sector with no defined neighbors', async () => {
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
        expect(result!.size).toBe(0)
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
