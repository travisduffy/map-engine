// test/fixtures/borders/generate-perimeter-cases.js
// Generates the CA-6 (Dynamic Perimeter Rendering) fixture set: companion
// sector-definition JSONs + 8-bit indexed PNGs under
// test/fixtures/borders/maps/, and the manifest
// test/fixtures/borders/perimeter-cases.json consumed by the Epic 8 border
// extraction tests.
//
// `expectedEdges` is computed independently of engine code (no
// SectorRegistry/border-handlers import) via a direct per-pixel right/bottom-
// neighbor scan over the source grid — the same interior-only rule
// SectorRegistry.ts's B1.e scan applies (guards `x < width-1` / `y <
// height-1`, so bitmap-boundary-facing sides are never visited; see
// SectorRegistry.ts:163,183). Scanning only right/bottom neighbors also means
// each geometric edge is visited exactly once here, by construction — this
// script does not need (and does not model) the contour-bucket double-
// storage/dedup the real Worker walk must perform over per-sector CSR
// buckets; it independently re-derives the ground-truth edge set from the
// grid alone.
//
// A pixel's *group* is `parentMapping[sectorId]`, where `sectorId` is the
// index into `definitionEntries` (Object.entries order — SectorRegistry.ts
// Phase 1 rule, same as generate-mappings.js). Two adjacent pixels emit a
// qualifying edge iff their groups differ, EXCEPT when both map to the
// `0xFFFF` sentinel (both void — no edge; a sentinel-mapped sector emits
// nothing on its own). A grouped side paired with a sentinel side always
// qualifies (sentinel counts as "void" on the far side).
//
// Run from the repo root: node test/fixtures/borders/generate-perimeter-cases.js

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mapsDir = join(__dirname, 'maps')

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

/** True iff two group values on either side of a pixel boundary emit a qualifying edge. */
function qualifies(groupA, groupB) {
  if (groupA === VOID_GROUP && groupB === VOID_GROUP) return false
  return groupA !== groupB
}

/**
 * Independent per-pixel right/bottom-neighbor scan (see file header).
 * Returns `[x1, y1, x2, y2]` segments in the same geometric convention as
 * SectorRegistry.ts's crack scan: a right-neighbor difference emits a
 * vertical segment at `x+1` spanning `y` to `y+1`; a bottom-neighbor
 * difference emits a horizontal segment at `y+1` spanning `x` to `x+1`.
 */
function computeExpectedEdges(grid, definitionEntries, parentMapping) {
  const hexToId = new Map(definitionEntries.map(([hex], i) => [hex, i]))
  const height = grid.length
  const width = grid[0].length
  const groupOf = hex => parentMapping[hexToId.get(hex)]

  const edges = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = groupOf(grid[y][x])
      if (x < width - 1) {
        const rg = groupOf(grid[y][x + 1])
        if (qualifies(g, rg)) edges.push([x + 1, y, x + 1, y + 1])
      }
      if (y < height - 1) {
        const bg = groupOf(grid[y + 1][x])
        if (qualifies(g, bg)) edges.push([x, y + 1, x + 1, y + 1])
      }
    }
  }
  return edges
}

// ── Fixture definitions ───────────────────────────────────────────────────
// Each case's `definitionEntries` order fixes the numeric-ID space that
// `parentMapping` indexes (see file header).

const R = 'ff0000'
const G = '00ff00'
const B = '0000ff'

const cases = [
  {
    name: 'single-group',
    // Whole 2x2 canvas is one sector folded into one group -- no other
    // group/void to differ against, so zero edges (sanity baseline).
    grid: [
      [R, R],
      [R, R],
    ],
    definitionEntries: [[R, { name: 'Solo' }]],
    parentMapping: [0],
    maxGroups: 1,
  },
  {
    name: 'two-adjacent-groups',
    // Left half (2 cols) -> group 0, right half (2 cols) -> group 1, over a
    // 4x4 canvas. The only qualifying edges are the shared interior vertical
    // boundary at x=2 (one segment per row, not merged/re-counted).
    grid: [
      [R, R, G, G],
      [R, R, G, G],
      [R, R, G, G],
      [R, R, G, G],
    ],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
    ],
    parentMapping: [0, 1],
    maxGroups: 2,
  },
  {
    name: 'group-with-hole',
    // 3x3 ring of Red (group 0) surrounding a single Green hole pixel
    // (group 1, a real second group -- not sentinel). The ring's outer
    // boundary sits entirely on the bitmap edge (never scanned), so the
    // only qualifying edges are the 4 interior segments around the hole.
    grid: [
      [R, R, R],
      [R, G, R],
      [R, R, R],
    ],
    definitionEntries: [
      [R, { name: 'Ring' }],
      [G, { name: 'Hole' }],
    ],
    parentMapping: [0, 1],
    maxGroups: 2,
  },
  {
    name: 'sentinel-all',
    // Every sector excluded (0xFFFF) -- both groupOf values are the sentinel
    // for every pair, so zero edges (CA-6 "all-sentinel" acceptance case).
    grid: [
      [R, R, G, G],
      [R, R, G, G],
      [B, B, G, G],
      [B, B, G, G],
    ],
    definitionEntries: [
      [R, { name: 'Red' }],
      [G, { name: 'Green' }],
      [B, { name: 'Blue' }],
    ],
    parentMapping: [VOID_GROUP, VOID_GROUP, VOID_GROUP],
    maxGroups: 1,
  },
  {
    name: 'single-pixel-group',
    // A single Red pixel (group 0) at the exact center of a 3x3 canvas,
    // surrounded by a Green ring excluded from grouping (sentinel). The
    // Red pixel sits at (1,1) -- strictly interior, not touching the bitmap
    // boundary -- so all 4 of its edges qualify and are asserted exactly
    // (per Task 8.1: place any group whose FULL perimeter is asserted away
    // from the bitmap edge, since map-edge segments are never synthesized).
    grid: [
      [G, G, G],
      [G, R, G],
      [G, G, G],
    ],
    definitionEntries: [
      [G, { name: 'Surround' }],
      [R, { name: 'Center' }],
    ],
    parentMapping: [VOID_GROUP, 0],
    maxGroups: 1,
  },
]

const manifest = []

for (const c of cases) {
  const { buf, width, height } = buildRgbBuffer(c.grid)
  const distinctColors = Math.max(2, new Set(c.grid.flat()).size)

  const pngPath = join(mapsDir, `${c.name}.png`)
  await sharp(buf, { raw: { width, height, channels: 3 } })
    .png({ palette: true, dither: 0, colors: distinctColors })
    .toFile(pngPath)

  // Verify pixel-exactness: re-decode and compare against the source buffer.
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
      `generate-perimeter-cases: ${c.name}.png failed to round-trip byte-exact — quantization/dither drift detected`
    )
  }

  const definitionPath = join(mapsDir, `${c.name}.json`)
  const definitionObj = Object.fromEntries(c.definitionEntries)
  writeFileSync(definitionPath, JSON.stringify(definitionObj, null, 2) + '\n')

  const expectedEdges = computeExpectedEdges(
    c.grid,
    c.definitionEntries,
    c.parentMapping
  )

  manifest.push({
    mapImage: `/test/fixtures/borders/maps/${c.name}.png`,
    definition: `/test/fixtures/borders/maps/${c.name}.json`,
    parentMapping: c.parentMapping,
    maxGroups: c.maxGroups,
    expectedEdgeCount: expectedEdges.length,
    expectedEdges,
  })

  console.log(`Generated test/fixtures/borders/maps/${c.name}.png (+.json)`)
}

writeFileSync(
  join(__dirname, 'perimeter-cases.json'),
  JSON.stringify(manifest, null, 2) + '\n'
)

console.log(
  `Generated test/fixtures/borders/perimeter-cases.json (${manifest.length} fixtures)`
)
