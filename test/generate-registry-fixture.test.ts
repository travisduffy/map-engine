import { describe, it, expect, vi } from 'vitest'

import { generateRegistryFixture } from './fixtures/generate-registry-fixture'
import { SectorRegistry } from '../src/sector/SectorRegistry'
import { toHexKey } from '../src/shared/utils'

/** Collects the distinct hex keys present in a generated RGBA buffer. */
function hexKeysIn(buffer: Uint8ClampedArray): Set<string> {
  const keys = new Set<string>()
  for (let o = 0; o < buffer.length; o += 4) {
    keys.add(toHexKey(buffer[o], buffer[o + 1], buffer[o + 2]))
  }
  return keys
}

describe('generateRegistryFixture', () => {
  it('returns a fully opaque RGBA buffer of width * height * 4', () => {
    const { buffer, width, height } = generateRegistryFixture({
      seed: 1,
      width: 4,
      height: 4,
      sectorCount: 4,
    })

    expect(width).toBe(4)
    expect(height).toBe(4)
    expect(buffer.length).toBe(4 * 4 * 4)
    for (let o = 3; o < buffer.length; o += 4) {
      expect(buffer[o]).toBe(255)
    }
  })

  it('places every declared sector in the buffer at least once', () => {
    const { buffer, definition } = generateRegistryFixture({
      seed: 7,
      width: 64,
      height: 64,
      sectorCount: 16,
    })

    const present = hexKeysIn(buffer)
    expect(Object.keys(definition)).toHaveLength(16)
    for (const key of Object.keys(definition)) {
      expect(present.has(key)).toBe(true)
    }
    // Total coverage: the buffer holds nothing the definition does not declare.
    expect(present.size).toBe(16)
  })

  it('never emits the reserved void colour', () => {
    const { buffer, definition } = generateRegistryFixture({
      seed: 3,
      width: 64,
      height: 64,
      sectorCount: 256,
    })

    expect(hexKeysIn(buffer).has('000000')).toBe(false)
    expect(Object.keys(definition)).not.toContain('000000')
  })

  it('is deterministic per seed and varies across seeds', () => {
    const opts = { width: 32, height: 32, sectorCount: 9 }
    const a = generateRegistryFixture({ seed: 42, ...opts })
    const b = generateRegistryFixture({ seed: 42, ...opts })
    const c = generateRegistryFixture({ seed: 43, ...opts })

    expect(Array.from(a.buffer)).toEqual(Array.from(b.buffer))
    expect(a.definition).toEqual(b.definition)
    expect(Array.from(c.buffer)).not.toEqual(Array.from(a.buffer))
  })

  it('builds a SectorRegistry with no load-time warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { buffer, width, height, definition, coverage } =
        generateRegistryFixture({
          seed: 11,
          width: 64,
          height: 64,
          sectorCount: 16,
        })

      const registry = new SectorRegistry(buffer, width, height, definition)

      expect(registry.idToHex).toHaveLength(16)
      expect(coverage).toBe(1)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('rejects a sector count the pixel budget cannot cover', () => {
    expect(() =>
      generateRegistryFixture({
        seed: 1,
        width: 4,
        height: 4,
        sectorCount: 17,
      })
    ).toThrow(/exceeds the 16 pixels available/)
  })
})
