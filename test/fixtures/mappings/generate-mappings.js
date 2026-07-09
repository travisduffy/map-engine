// test/fixtures/mappings/generate-mappings.js
// Generates the CA-5 (Aggregation) fixture set: companion sector-definition
// JSONs + 8-bit indexed PNGs under test/fixtures/mappings/maps/, and the
// manifest test/fixtures/mappings/regions.json consumed by
// test/integration/aggregation.spec.ts.
//
// `expectedGroupBBoxes` is computed independently of engine code (no
// SectorRegistry/aggregateGroups import) but replicates two engine rules
// exactly so fixtures are reference-grade against the real implementation:
//   1. Numeric sector IDs are assigned by `Object.entries(definition)`
//      iteration order (SectorRegistry.ts Phase 1), NOT raster scan order.
//   2. Per-sector bbox accumulation is a plain per-pixel min/max scan
//      starting from the sentinel [32767, 32767, -32768, -32768]
//      (SectorRegistry.ts Phase 2/3) — group bboxes are unioned from those
//      via the same min/max rule, so an empty group (or an all-sentinel
//      mapping) naturally resolves to the same sentinel.
//
// Run from the repo root: node test/fixtures/mappings/generate-mappings.js

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync, readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mapsDir = join(__dirname, 'maps')

const SENTINEL = Object.freeze([32767, 32767, -32768, -32768])
const VOID_GROUP = 0xffff

/** Builds a raw RGB pixel buffer from a row-major grid of hex color strings. */
function buildRgbBuffer(grid) {
  const height = grid.length
  const width = grid[0].length
  const buf = Buffer.alloc(width * height * 3)
  let o = 0
  for (const row of grid) {
    for (const hex of row) {
      buf[o++] = parseInt(hex.slice(0, 2), 16)
      buf[o++] = parseInt(hex.slice(2, 4), 16)
      buf[o++] = parseInt(hex.slice(4, 6), 16)
    }
  }
  return { buf, width, height }
}

/** Independent per-sector-then-per-group bbox scan (see file header). */
function computeExpectedGroupBBoxes(
  grid,
  definitionEntries,
  parentMapping,
  maxGroups
) {
  const hexToId = new Map(definitionEntries.map(([hex], i) => [hex, i]))
  const sectorBBoxes = definitionEntries.map(() => [...SENTINEL])

  grid.forEach((row, y) => {
    row.forEach((hex, x) => {
      const id = hexToId.get(hex)
      if (id === undefined) return // not a defined sector — no fixture uses void pixels
      const b = sectorBBoxes[id]
      if (x < b[0]) b[0] = x
      if (y < b[1]) b[1] = y
      if (x > b[2]) b[2] = x
      if (y > b[3]) b[3] = y
    })
  })

  const groupBBoxes = Array.from({ length: maxGroups }, () => [...SENTINEL])
  parentMapping.forEach((g, id) => {
    if (g === VOID_GROUP) return
    const sb = sectorBBoxes[id]
    const gb = groupBBoxes[g]
    if (sb[0] < gb[0]) gb[0] = sb[0]
    if (sb[1] < gb[1]) gb[1] = sb[1]
    if (sb[2] > gb[2]) gb[2] = sb[2]
    if (sb[3] > gb[3]) gb[3] = sb[3]
  })
  return groupBBoxes
}

// ── Fixture definitions ───────────────────────────────────────────────────
// Each case's `definitionEntries` order fixes the numeric-ID space that
// `parentMapping` indexes (see file header, rule 1).

const R = 'ff0000'
const G = '00ff00'
const B = '0000ff'
const Y = 'ffff00'

const cases = [
  {
    name: 'identity',
    // 1 sector spanning the whole 2x2 canvas -> 1 group.
    grid: [
      [R, R],
      [R, R],
    ],
    definitionEntries: [[R, { name: 'Solo' }]],
    parentMapping: [0],
    maxGroups: 1,
  },
  {
    name: 'all-to-one',
    // 4 quadrant sectors (2x2 each, 4x4 canvas), all folded into one group.
    grid: [
      [R, R, G, G],
      [R, R, G, G],
      [B, B, Y, Y],
      [B, B, Y, Y],
    ],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
      [B, { name: 'Blue' }],
      [Y, { name: 'Yellow' }],
    ],
    parentMapping: [0, 0, 0, 0],
    maxGroups: 1,
  },
  {
    name: 'disjoint-groups',
    // Same quadrants; left column (red+blue) -> group 0, right column
    // (green+yellow) -> group 1.
    grid: [
      [R, R, G, G],
      [R, R, G, G],
      [B, B, Y, Y],
      [B, B, Y, Y],
    ],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
      [B, { name: 'Blue' }],
      [Y, { name: 'Yellow' }],
    ],
    parentMapping: [0, 1, 0, 1],
    maxGroups: 2,
  },
  {
    name: 'sentinel-partial',
    // Same quadrants; green and yellow are excluded (0xFFFF) from every
    // group, only red+blue fold into group 0.
    grid: [
      [R, R, G, G],
      [R, R, G, G],
      [B, B, Y, Y],
      [B, B, Y, Y],
    ],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
      [B, { name: 'Blue' }],
      [Y, { name: 'Yellow' }],
    ],
    parentMapping: [0, VOID_GROUP, 0, VOID_GROUP],
    maxGroups: 1,
  },
  {
    name: 'sentinel-all',
    // Every sector excluded -- the one group resolves with zero members,
    // i.e. it stays at the sentinel bbox (CA-5 "all-sentinel" acceptance case).
    grid: [
      [R, R, G, G],
      [R, R, G, G],
      [B, B, Y, Y],
      [B, B, Y, Y],
    ],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
      [B, { name: 'Blue' }],
      [Y, { name: 'Yellow' }],
    ],
    parentMapping: [VOID_GROUP, VOID_GROUP, VOID_GROUP, VOID_GROUP],
    maxGroups: 1,
  },
  {
    name: 'single-pixel-groups',
    // 3 single-pixel sectors, each its own group -- degenerate (min===max) bboxes.
    grid: [[R, G, B]],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
      [B, { name: 'Blue' }],
    ],
    parentMapping: [0, 1, 2],
    maxGroups: 3,
  },
]

const manifest = []

for (const c of cases) {
  const { buf, width, height } = buildRgbBuffer(c.grid)
  // sharp requires an integer in [2, 256] for `colors`, even for a
  // single-color source image.
  const distinctColors = Math.max(2, new Set(c.grid.flat()).size)

  const pngPath = join(mapsDir, `${c.name}.png`)
  await sharp(buf, { raw: { width, height, channels: 3 } })
    .png({ palette: true, dither: 0, colors: distinctColors })
    .toFile(pngPath)

  // Verify pixel-exactness: re-decode and compare against the source buffer.
  // sharp's palette-mode quantization only kicks in above `colors` distinct
  // colors, so this must round-trip byte-for-byte with dither disabled.
  const { data: roundTrip } = await sharp(pngPath)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const roundTripRgb = Buffer.alloc(width * height * 3)
  const channels = roundTrip.length / (width * height)
  for (let p = 0; p < width * height; p++) {
    roundTripRgb[p * 3] = roundTrip[p * channels]
    roundTripRgb[p * 3 + 1] = roundTrip[p * channels + 1]
    roundTripRgb[p * 3 + 2] = roundTrip[p * channels + 2]
  }
  if (!buf.equals(roundTripRgb)) {
    throw new Error(
      `generate-mappings: ${c.name}.png failed to round-trip byte-exact — quantization/dither drift detected`
    )
  }

  const definitionPath = join(mapsDir, `${c.name}.json`)
  const definitionObj = Object.fromEntries(c.definitionEntries)
  writeFileSync(definitionPath, JSON.stringify(definitionObj, null, 2) + '\n')

  const expectedGroupBBoxes = computeExpectedGroupBBoxes(
    c.grid,
    c.definitionEntries,
    c.parentMapping,
    c.maxGroups
  )

  manifest.push({
    mapImage: `/test/fixtures/mappings/maps/${c.name}.png`,
    definition: `/test/fixtures/mappings/maps/${c.name}.json`,
    parentMapping: c.parentMapping,
    maxGroups: c.maxGroups,
    expectedGroupBBoxes,
  })

  console.log(`Generated test/fixtures/mappings/maps/${c.name}.png (+.json)`)
}

writeFileSync(
  join(__dirname, 'regions.json'),
  JSON.stringify(manifest, null, 2) + '\n'
)

console.log(
  `Generated test/fixtures/mappings/regions.json (${manifest.length} fixtures)`
)
