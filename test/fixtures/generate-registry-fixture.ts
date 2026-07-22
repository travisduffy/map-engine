/**
 * Deterministic in-process fixture generator for `SectorRegistry` benchmarks.
 *
 * `SectorRegistry`'s constructor takes a raw `Uint8ClampedArray`, so nothing
 * here encodes a PNG: a committed multi-megabyte fixture is avoided, and a
 * `sharp` encode/decode round trip does not pollute the very heap the benchmark
 * samples. `test/fixtures/borders/generate-perimeter-cases.js` is the precedent
 * for scripted deterministic fixtures, but its outputs are git-tracked; this one
 * is never written to disk.
 *
 * Layout is a jittered tile grid rather than noise. Per-row and per-column
 * offsets displace tile boundaries so borders wiggle (giving the contour and
 * adjacency passes realistic work), while the jitter amplitude is capped below
 * half a tile so every tile keeps its own centre pixel — which is what
 * guarantees each declared sector receives at least one pixel and the
 * load-time zero-pixel warning stays quiet.
 *
 * Every pixel is assigned to a sector. Coverage is total by construction, so
 * figures measured against this fixture are an explicit upper bound.
 */
import type { SectorDefinitionFile } from '../../src/shared/types'
import { toHexKey } from '../../src/shared/utils'

export interface RegistryFixtureOptions {
  /** Any integer; the same seed yields a byte-identical buffer. */
  seed: number
  width: number
  height: number
  /** Number of distinct sectors in both the buffer and the definition. */
  sectorCount: number
}

export interface RegistryFixture {
  buffer: Uint8ClampedArray
  width: number
  height: number
  definition: SectorDefinitionFile
  /** Fraction of pixels assigned to a sector rather than void. Always 1 here. */
  coverage: number
}

/** `SectorRegistry` throws SectorLimitExceededError above this count. */
const MAX_SECTORS = 65534

/** Largest boundary displacement, in pixels, before the per-tile cap applies. */
const MAX_JITTER = 8

/** mulberry32 — small, fast, and stable across Node versions. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Maps a sector ID to a distinct non-void packed RGB.
 *
 * Multiplication by an odd constant is a bijection modulo 2^24, so distinct IDs
 * always yield distinct colours; and since `id + 1` never reaches 2^24 (the
 * sector cap is 65534), the product is never congruent to zero — no sector can
 * collide with the `000000` void colour that `.claude/rules/sectors.md` reserves.
 */
function sectorColor(id: number, multiplier: number): number {
  return (Math.imul(id + 1, multiplier) >>> 0) & 0xffffff
}

export function generateRegistryFixture(
  options: RegistryFixtureOptions
): RegistryFixture {
  const { seed, width, height, sectorCount } = options

  if (!Number.isInteger(width) || width < 1) {
    throw new Error(`generateRegistryFixture: width must be >= 1, got ${width}`)
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new Error(
      `generateRegistryFixture: height must be >= 1, got ${height}`
    )
  }
  if (!Number.isInteger(sectorCount) || sectorCount < 1) {
    throw new Error(
      `generateRegistryFixture: sectorCount must be >= 1, got ${sectorCount}`
    )
  }
  if (sectorCount > MAX_SECTORS) {
    throw new Error(
      `generateRegistryFixture: sectorCount ${sectorCount} exceeds the ` +
        `SectorRegistry limit of ${MAX_SECTORS}`
    )
  }
  if (sectorCount > width * height) {
    throw new Error(
      `generateRegistryFixture: sectorCount ${sectorCount} exceeds the ` +
        `${width * height} pixels available at ${width}x${height} — every ` +
        `sector must receive at least one pixel`
    )
  }

  // Tile the plane so tiles are roughly square, then fold any tiles beyond
  // sectorCount (at most one partial row) into the final sector.
  const cols = Math.min(
    width,
    Math.max(1, Math.round(Math.sqrt((sectorCount * width) / height)))
  )
  const rows = Math.min(height, Math.max(1, Math.ceil(sectorCount / cols)))
  if (cols * rows < sectorCount) {
    throw new Error(
      `generateRegistryFixture: cannot fit ${sectorCount} sectors into a ` +
        `${cols}x${rows} tile grid at ${width}x${height}`
    )
  }

  const tileW = width / cols
  const tileH = height / rows

  const random = makeRandom(seed)
  // Odd multiplier, seed-derived: different seeds recolour the whole map.
  const multiplier = (Math.imul(seed + 1, 0x9e3779b1) | 1) >>> 0

  // Jitter stays strictly below half a tile in both axes, so a tile's centre
  // pixel is never displaced out of it.
  const jitter = Math.max(
    0,
    Math.min(Math.floor(tileW / 4), Math.floor(tileH / 4), MAX_JITTER)
  )
  const rowOffsets = new Int32Array(height)
  const colOffsets = new Int32Array(width)
  if (jitter > 0) {
    const span = jitter * 2 + 1
    for (let y = 0; y < height; y++) {
      rowOffsets[y] = Math.floor(random() * span) - jitter
    }
    for (let x = 0; x < width; x++) {
      colOffsets[x] = Math.floor(random() * span) - jitter
    }
  }

  const definition: SectorDefinitionFile = {}
  const channels = new Uint8Array(sectorCount * 3)
  for (let id = 0; id < sectorCount; id++) {
    const packed = sectorColor(id, multiplier)
    const r = (packed >>> 16) & 0xff
    const g = (packed >>> 8) & 0xff
    const b = packed & 0xff
    channels[id * 3] = r
    channels[id * 3 + 1] = g
    channels[id * 3 + 2] = b
    definition[toHexKey(r, g, b)] = { name: `Sector ${id}` }
  }

  const buffer = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const rowOffset = rowOffsets[y]
    const rowBase = y * width * 4
    for (let x = 0; x < width; x++) {
      const jx = x + rowOffset
      const jy = y + colOffsets[x]
      const col = Math.min(cols - 1, Math.max(0, Math.floor(jx / tileW)))
      const row = Math.min(rows - 1, Math.max(0, Math.floor(jy / tileH)))
      const id = Math.min(sectorCount - 1, row * cols + col)

      const o = rowBase + x * 4
      buffer[o] = channels[id * 3]
      buffer[o + 1] = channels[id * 3 + 1]
      buffer[o + 2] = channels[id * 3 + 2]
      buffer[o + 3] = 255
    }
  }

  return { buffer, width, height, definition, coverage: 1 }
}
