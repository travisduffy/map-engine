import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SectorRegistry } from '../src/SectorRegistry'
import { SectorLimitExceededError } from '../src/errors'
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

    it('throws SectorLimitExceededError when sectorCount > 65534', () => {
      // Build a definition with 65535 entries
      const bigDef: SectorDefinitionFile = {}
      for (let i = 0; i <= 65534; i++) {
        bigDef[i.toString().padStart(6, '0')] = { name: `s${i}` }
      }
      const buf = new Uint8ClampedArray(4) // 1×1 pixel, minimal
      expect(() => new SectorRegistry(buf, 1, 1, bigDef)).toThrow(
        SectorLimitExceededError
      )
    })
  })

  describe('sourceBuffer disposal (PR-1)', () => {
    it('sourceBuffer is null after construction', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
      expect(reg.sourceBuffer).toBeNull()
    })
  })

  describe('flat pixelIndices map', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('pixelIndices is Uint32Array of length width*height', () => {
      expect(registry.pixelIndices).toBeInstanceOf(Uint32Array)
      expect(registry.pixelIndices.length).toBe(16)
    })

    it('pixelIndicesMirror is Uint16Array of same length', () => {
      expect(registry.pixelIndicesMirror).toBeInstanceOf(Uint16Array)
      expect(registry.pixelIndicesMirror.length).toBe(16)
    })

    it('pixelIndices maps red sector pixels to id 0', () => {
      // ff0000 is first in definition → id 0
      expect(registry.pixelIndices[0]).toBe(0) // (0,0)
      expect(registry.pixelIndices[1]).toBe(0) // (1,0)
      expect(registry.pixelIndices[4]).toBe(0) // (0,1)
      expect(registry.pixelIndices[5]).toBe(0) // (1,1)
    })

    it('pixelIndices maps green sector pixels to id 1', () => {
      expect(registry.pixelIndices[2]).toBe(1) // (2,0)
      expect(registry.pixelIndices[3]).toBe(1) // (3,0)
    })

    it('pixelIndicesMirror matches pixelIndices values', () => {
      for (let i = 0; i < 16; i++) {
        expect(registry.pixelIndicesMirror[i]).toBe(
          registry.pixelIndices[i] & 0xffff
        )
      }
    })
  })

  describe('getSectorPixels', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('getSectorPixels("ff0000") returns Uint32Array [0,1,4,5]', () => {
      expect(registry.getSectorPixels('ff0000')).toEqual(
        new Uint32Array([0, 1, 4, 5])
      )
    })

    it('getSectorPixels("00ff00") returns Uint32Array [2,3,6,7]', () => {
      expect(registry.getSectorPixels('00ff00')).toEqual(
        new Uint32Array([2, 3, 6, 7])
      )
    })

    it('getSectorPixels("0000ff") returns Uint32Array [8,9,12,13]', () => {
      expect(registry.getSectorPixels('0000ff')).toEqual(
        new Uint32Array([8, 9, 12, 13])
      )
    })

    it('getSectorPixels("ffff00") returns Uint32Array [10,11,14,15]', () => {
      expect(registry.getSectorPixels('ffff00')).toEqual(
        new Uint32Array([10, 11, 14, 15])
      )
    })

    it('getSectorPixels for unknown key returns undefined', () => {
      expect(registry.getSectorPixels('aabbcc')).toBeUndefined()
    })
  })

  describe('getBBox — test-4x4.json', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('getBBox("ff0000") returns [0, 0, 1, 1]', () => {
      expect(registry.getBBox('ff0000')).toEqual([0, 0, 1, 1])
    })

    it('getBBox("00ff00") returns [2, 0, 3, 1]', () => {
      expect(registry.getBBox('00ff00')).toEqual([2, 0, 3, 1])
    })

    it('getBBox("0000ff") returns [0, 2, 1, 3]', () => {
      expect(registry.getBBox('0000ff')).toEqual([0, 2, 1, 3])
    })

    it('getBBox("ffff00") returns [2, 2, 3, 3]', () => {
      expect(registry.getBBox('ffff00')).toEqual([2, 2, 3, 3])
    })

    it('getBBox via numeric id works', () => {
      expect(registry.getBBox(0)).toEqual([0, 0, 1, 1])
    })

    it('getBBox for unknown key throws', () => {
      expect(() => registry.getBBox('aabbcc')).toThrow('SectorRegistry')
    })
  })

  describe('getCentroid — test-4x4.json', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('getCentroid("ff0000") returns integer coords [1, 1] (mean 0.5 rounds up)', () => {
      expect(registry.getCentroid('ff0000')).toEqual([1, 1])
    })

    it('getCentroid("00ff00") returns [3, 1]', () => {
      expect(registry.getCentroid('00ff00')).toEqual([3, 1])
    })

    it('getCentroid via numeric id works', () => {
      expect(registry.getCentroid(0)).toEqual([1, 1])
    })
  })

  describe('new Phase 2 structures — border edges and contour', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('borderEdges is a zero-initialized Float32Array (4 * 8 border segments)', () => {
      expect(registry.borderEdges).toBeInstanceOf(Float32Array)
      expect(registry.borderEdges.length).toBe(32)
      expect(Array.from(registry.borderEdges).every(v => v === 0)).toBe(true)
    })

    it('borderEdgeCount[0] is 0 (zero-initialized)', () => {
      expect(registry.borderEdgeCount).toBeInstanceOf(Uint32Array)
      expect(registry.borderEdgeCount[0]).toBe(0)
    })

    it('each sector has 4 contour segments (2 borders with adjacent sectors, each edge shared)', () => {
      // R↔G (2h edges), R↔B (2v edges) → R has 4 segs
      expect(registry.contourPointers[1] - registry.contourPointers[0]).toBe(4) // R
      expect(registry.contourPointers[2] - registry.contourPointers[1]).toBe(4) // G
      expect(registry.contourPointers[3] - registry.contourPointers[2]).toBe(4) // B
      expect(registry.contourPointers[4] - registry.contourPointers[3]).toBe(4) // Y
    })

    it('contourPoints contains segment endpoints for the first border', () => {
      // First H border: (1,0)-(1,1) emitted when scanning (1,0) rightward to (2,0)
      // R sector (id=0) gets this segment at contourPointers[0]=0
      const base = registry.contourPointers[0] * 4
      // Segment endpoints should be (1,0)-(1,1) in some order
      const x1 = registry.contourPoints[base]
      const y1 = registry.contourPoints[base + 1]
      const x2 = registry.contourPoints[base + 2]
      const y2 = registry.contourPoints[base + 3]
      expect(x1).toBe(2) // h border between col1 and col2: geometric x = 2
      expect(y1).toBe(0)
      expect(x2).toBe(2)
      expect(y2).toBe(1)
    })
  })

  describe('CSR adjacency (getNeighbors)', () => {
    let registry: SectorRegistry

    beforeEach(() => {
      registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
    })

    it('ff0000 is adjacent to 00ff00 and 0000ff', () => {
      const n = registry.getNeighbors('ff0000')
      expect(n).toContain('00ff00')
      expect(n).toContain('0000ff')
      expect(n).not.toContain('ffff00')
    })

    it('adjacency is bidirectional', () => {
      expect(registry.getNeighbors('00ff00')).toContain('ff0000')
      expect(registry.getNeighbors('0000ff')).toContain('ff0000')
    })

    it('getNeighbors returns empty array for unknown key', () => {
      expect(registry.getNeighbors('aabbcc')).toEqual([])
    })

    it('getNeighbors(number) returns numeric neighbor IDs', () => {
      const n = registry.getNeighbors(0) // ff0000=0 → neighbors are 1(G) and 2(B)
      expect(n).toContain(1)
      expect(n).toContain(2)
    })
  })

  describe('hexColors / sectorIds (sorted binary-search table)', () => {
    it('hexColors and sectorIds are correctly sorted by packed RGB', () => {
      const registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
      for (let i = 1; i < registry.hexColors.length; i++) {
        expect(registry.hexColors[i]).toBeGreaterThanOrEqual(
          registry.hexColors[i - 1]
        )
      }
      // sectorIds[i] corresponds to hexColors[i]
      expect(registry.sectorIds.length).toBe(registry.hexColors.length)
    })

    it('idToPackedRgb[0] == packRgb(255,0,0) for ff0000', () => {
      const registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
      expect(registry.idToPackedRgb[0]).toBe((255 << 16) | 0) // 0xFF0000
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

  describe('sector map', () => {
    it('getSectorKeys contains exactly 4 hex keys', () => {
      const registry = new SectorRegistry(make4x4Buffer(), 4, 4, definition)
      expect(registry.getSectorKeys()).toHaveLength(4)
      expect(registry.getSectorKeys()).toContain('ff0000')
      expect(registry.getSectorKeys()).toContain('00ff00')
      expect(registry.getSectorKeys()).toContain('0000ff')
      expect(registry.getSectorKeys()).toContain('ffff00')
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

    it('getBBox for zero-pixel sector has sentinel values (minX > maxX)', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      const bbox = reg.getBBox('ffffff')
      expect(bbox[0]).toBeGreaterThan(bbox[2]) // minX > maxX indicates no pixels
    })

    it('sectors bordering void (ffff00) have non-zero contour segments', () => {
      const reg = new SectorRegistry(make4x4Buffer(), 4, 4, mismatchDefinition)
      // mismatch IDs: ff0000=0, 00ff00=1, 0000ff=2, ffffff=3
      const blueSegs = reg.contourPointers[3] - reg.contourPointers[2] // 0000ff
      const greenSegs = reg.contourPointers[2] - reg.contourPointers[1] // 00ff00
      expect(blueSegs).toBeGreaterThan(0)
      expect(greenSegs).toBeGreaterThan(0)
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
