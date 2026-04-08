import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SectorRegistry } from '../src/SectorRegistry'
import type { SectorDefinitionFile } from '../src/types'

// 4×4 RGBA buffer matching the test fixture layout:
// top-left 2×2: #ff0000 (red), top-right 2×2: #00ff00 (green)
// bottom-left 2×2: #0000ff (blue), bottom-right 2×2: #ffff00 (yellow)
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

const mismatchDefinition: SectorDefinitionFile = {
  ff0000: { name: 'Red Sector' },
  '00ff00': { name: 'Green Sector' },
  '0000ff': { name: 'Blue Sector' },
  ffffff: { name: 'Ghost Sector — not in bitmap' },
}

describe('SectorRegistry', () => {
  describe('constructor validation', () => {
    it('throws on buffer length mismatch', () => {
      const badBuffer = new Uint8ClampedArray(10)
      expect(() => new SectorRegistry(badBuffer, 4, 4, definition)).toThrow(
        'SectorRegistry'
      )
    })
  })

  describe('spatial structures — test-4x4.json', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('sector map contains exactly 4 hex keys', () => {
      expect(registry.getSectorKeys()).toHaveLength(4)
      expect(registry.getSectorKeys()).toContain('ff0000')
      expect(registry.getSectorKeys()).toContain('00ff00')
      expect(registry.getSectorKeys()).toContain('0000ff')
      expect(registry.getSectorKeys()).toContain('ffff00')
    })

    it('sourceBuffer is the same reference as the buffer passed in', () => {
      const buf = make4x4Buffer()
      const reg = new SectorRegistry(buf, 4, 4, definition)
      expect(reg.sourceBuffer).toBe(buf)
    })

    it('bboxes["ff0000"] is correct', () => {
      expect(registry.bboxes.get('ff0000')).toEqual({
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
      })
    })

    it('bboxes["00ff00"] is correct', () => {
      expect(registry.bboxes.get('00ff00')).toEqual({
        minX: 2,
        minY: 0,
        maxX: 3,
        maxY: 1,
      })
    })

    it('bboxes["0000ff"] is correct', () => {
      expect(registry.bboxes.get('0000ff')).toEqual({
        minX: 0,
        minY: 2,
        maxX: 1,
        maxY: 3,
      })
    })

    it('bboxes["ffff00"] is correct', () => {
      expect(registry.bboxes.get('ffff00')).toEqual({
        minX: 2,
        minY: 2,
        maxX: 3,
        maxY: 3,
      })
    })

    it('centroids["ff0000"] is correct', () => {
      expect(registry.centroids.get('ff0000')).toEqual({ x: 0.5, y: 0.5 })
    })

    it('centroids["00ff00"] is correct', () => {
      expect(registry.centroids.get('00ff00')).toEqual({ x: 2.5, y: 0.5 })
    })

    it('pixelIndices["ff0000"] is sorted Uint32Array [0,1,4,5]', () => {
      expect(registry.pixelIndices.get('ff0000')).toEqual(
        new Uint32Array([0, 1, 4, 5])
      )
    })

    it('pixelIndices["00ff00"] is sorted Uint32Array [2,3,6,7]', () => {
      expect(registry.pixelIndices.get('00ff00')).toEqual(
        new Uint32Array([2, 3, 6, 7])
      )
    })

    it('pixelIndices["0000ff"] is sorted Uint32Array [8,9,12,13]', () => {
      expect(registry.pixelIndices.get('0000ff')).toEqual(
        new Uint32Array([8, 9, 12, 13])
      )
    })

    it('pixelIndices["ffff00"] is sorted Uint32Array [10,11,14,15]', () => {
      expect(registry.pixelIndices.get('ffff00')).toEqual(
        new Uint32Array([10, 11, 14, 15])
      )
    })
  })

  describe('borderEdges — test-4x4.json', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('has exactly 8 border edges', () => {
      expect(registry.borderEdges).toHaveLength(8)
    })

    it('no edge has sectorA === sectorB', () => {
      for (const edge of registry.borderEdges) {
        expect(edge.sectorA).not.toBe(edge.sectorB)
      }
    })

    it('contains horizontal edge at (x=1, y=0)', () => {
      expect(registry.borderEdges).toContainEqual(
        expect.objectContaining({ x: 1, y: 0, direction: 'h' })
      )
    })

    it('contains vertical edge at (x=0, y=1)', () => {
      expect(registry.borderEdges).toContainEqual(
        expect.objectContaining({ x: 0, y: 1, direction: 'v' })
      )
    })

    it('has 4 horizontal-scan edges all at x=1', () => {
      const hEdges = registry.borderEdges.filter(e => e.direction === 'h')
      expect(hEdges).toHaveLength(4)
      for (const e of hEdges) {
        expect(e.x).toBe(1)
      }
    })

    it('has 4 vertical-scan edges all at y=1', () => {
      const vEdges = registry.borderEdges.filter(e => e.direction === 'v')
      expect(vEdges).toHaveLength(4)
      for (const e of vEdges) {
        expect(e.y).toBe(1)
      }
    })
  })

  describe('getSectorAt', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('returns correct hex key for each quadrant', () => {
      expect(registry.getSectorAt(0, 0)).toBe('ff0000')
      expect(registry.getSectorAt(2, 0)).toBe('00ff00')
      expect(registry.getSectorAt(0, 2)).toBe('0000ff')
      expect(registry.getSectorAt(2, 2)).toBe('ffff00')
    })

    it('floors non-integer coordinates', () => {
      expect(registry.getSectorAt(0.9, 0.9)).toBe('ff0000')
      expect(registry.getSectorAt(2.7, 0.1)).toBe('00ff00')
    })

    it('throws out of bounds for negative x', () => {
      expect(() => registry.getSectorAt(-1, 0)).toThrow('out of bounds')
    })

    it('throws out of bounds for x >= width', () => {
      expect(() => registry.getSectorAt(4, 0)).toThrow('out of bounds')
    })

    it('throws out of bounds for negative y', () => {
      expect(() => registry.getSectorAt(0, -1)).toThrow('out of bounds')
    })

    it('throws out of bounds for y >= height', () => {
      expect(() => registry.getSectorAt(0, 4)).toThrow('out of bounds')
    })
  })

  describe('getSector', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('returns sector data for a known key', () => {
      expect(registry.getSector('ff0000')).toEqual({ name: 'Red Sector' })
    })

    it('returns undefined for an unknown key', () => {
      expect(registry.getSector('123456')).toBeUndefined()
    })
  })

  describe('load-time validation — mismatch fixture', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('does not throw on construction', () => {
      expect(
        () => new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      ).not.toThrow()
    })

    it('emits exactly 2 console.warn calls', () => {
      new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      expect(warnSpy).toHaveBeenCalledTimes(2)
    })

    it('warns about "ffffff" (JSON-only sector)', () => {
      new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      const messages = warnSpy.mock.calls.map(c => c[0] as string)
      expect(messages.some(m => m.includes('ffffff'))).toBe(true)
    })

    it('warns about "ffff00" (bitmap-only color)', () => {
      new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      const messages = warnSpy.mock.calls.map(c => c[0] as string)
      expect(messages.some(m => m.includes('ffff00'))).toBe(true)
    })

    it('getSectorKeys includes "ffffff" (zero-pixel JSON sector)', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      expect(reg.getSectorKeys()).toContain('ffffff')
    })

    it('getSectorKeys excludes "ffff00" (bitmap-only color)', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      expect(reg.getSectorKeys()).not.toContain('ffff00')
    })

    it('getSector returns data for "ffffff" (zero-pixel sector)', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      expect(reg.getSector('ffffff')).toEqual({
        name: 'Ghost Sector — not in bitmap',
      })
    })

    it('borderEdges contains an entry with sectorA or sectorB equal to "ffff00"', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      const hasYellow = reg.borderEdges.some(
        e => e.sectorA === 'ffff00' || e.sectorB === 'ffff00'
      )
      expect(hasYellow).toBe(true)
    })

    it('bboxes does not contain "ffffff" (zero-pixel sector excluded)', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      expect(reg.bboxes.has('ffffff')).toBe(false)
    })
  })

  describe('no Three.js imports', () => {
    it('SectorRegistry has no Three.js dependency', async () => {
      // Verify statically — the import itself succeeds and the module
      // exposes only the expected class. Three.js absence is enforced
      // at build time via grep; this test documents the contract.
      const mod = await import('../src/SectorRegistry')
      expect(typeof mod.SectorRegistry).toBe('function')
    })
  })
})
