#!/usr/bin/env node
/**
 * Generates example/public/example-map.png and example/public/sectors.json.
 *
 * Run once from the repo root:  node example/generate-map.js
 * Requires sharp (already a root devDependency).
 *
 * Map layout (320×240) — sectors tile the full canvas with no gaps.
 * Sectors are directly adjacent, matching real Paradox-style province bitmaps
 * where colors meet at hard pixel edges with no void border between them.
 *
 *   ┌──────────────────────┬───────────────┬──────────┐
 *   │  Northern Reach      │  Coastal Basin│ Violet   │
 *   │  8b0000 (0,0)        │  004d99       │ Uplands  │
 *   │  160×80              │  (160,0)      │ 5c3d99   │
 *   │                      │  90×80        │ (250,0)  │
 *   ├──────────────────────┼───────────────┤ 70×160   │
 *   │  Verdant March       │  Amber Steppe │          │
 *   │  2d6a4f (0,80)       │  e07b00       │          │
 *   │  160×80              │  (160,80)     │          │
 *   │                      │  90×80        │          │
 *   ├──────────────────────┼───────────────┼──────────┤
 *   │  Crimson Expanse     │  Azure        │ Gilded   │
 *   │  b5451b (0,160)      │  Tidewater    │ Plain    │
 *   │  160×80              │  1a6b8a       │ 7a6b00   │
 *   │                      │  (160,160)    │ (250,160)│
 *   │                      │  90×80        │ 70×80    │
 *   └──────────────────────┴───────────────┴──────────┘
 */

import { mkdir } from 'fs/promises'
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')

await mkdir(publicDir, { recursive: true })

const W = 320
const H = 240

// Each sector: { hex, r, g, b, x, y, w, h }
// Sectors tile exactly — no void pixels, no gaps.
const sectors = [
  { hex: '8b0000', r: 0x8b, g: 0x00, b: 0x00, x: 0, y: 0, w: 160, h: 80 },
  { hex: '004d99', r: 0x00, g: 0x4d, b: 0x99, x: 160, y: 0, w: 90, h: 80 },
  { hex: '5c3d99', r: 0x5c, g: 0x3d, b: 0x99, x: 250, y: 0, w: 70, h: 160 },
  { hex: '2d6a4f', r: 0x2d, g: 0x6a, b: 0x4f, x: 0, y: 80, w: 160, h: 80 },
  { hex: 'e07b00', r: 0xe0, g: 0x7b, b: 0x00, x: 160, y: 80, w: 90, h: 80 },
  { hex: 'b5451b', r: 0xb5, g: 0x45, b: 0x1b, x: 0, y: 160, w: 160, h: 80 },
  { hex: '1a6b8a', r: 0x1a, g: 0x6b, b: 0x8a, x: 160, y: 160, w: 90, h: 80 },
  { hex: '7a6b00', r: 0x7a, g: 0x6b, b: 0x00, x: 250, y: 160, w: 70, h: 80 },
]

// Paint into raw RGB buffer
const buf = Buffer.alloc(W * H * 3, 0)

for (const s of sectors) {
  for (let row = s.y; row < s.y + s.h; row++) {
    for (let col = s.x; col < s.x + s.w; col++) {
      const idx = (row * W + col) * 3
      buf[idx] = s.r
      buf[idx + 1] = s.g
      buf[idx + 2] = s.b
    }
  }
}

const pngPath = path.join(publicDir, 'example-map.png')
await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
  .png()
  .toFile(pngPath)

console.log(`Written: ${pngPath}`)

// Write sectors.json with rich SectorData demonstrating custom fields
const definition = {
  '8b0000': {
    name: 'Northern Reach',
    population: 312000,
    capital: 'Frostmark',
    climate: 'subarctic',
  },
  '004d99': {
    name: 'Coastal Basin',
    population: 890000,
    capital: 'Harborgate',
    climate: 'temperate',
  },
  '5c3d99': {
    name: 'Violet Uplands',
    population: 214000,
    capital: 'Highspire',
    climate: 'highland',
  },
  '2d6a4f': {
    name: 'Verdant March',
    population: 530000,
    capital: 'Greenhollow',
    climate: 'temperate',
  },
  e07b00: {
    name: 'Amber Steppe',
    population: 178000,
    capital: 'Dustridge',
    climate: 'semi-arid',
  },
  b5451b: {
    name: 'Crimson Expanse',
    population: 405000,
    capital: 'Emberfeld',
    climate: 'arid',
  },
  '1a6b8a': {
    name: 'Azure Tidewater',
    population: 623000,
    capital: 'Saltmere',
    climate: 'maritime',
  },
  '7a6b00': {
    name: 'Gilded Plain',
    population: 291000,
    capital: 'Wheatholm',
    climate: 'continental',
  },
}

const jsonPath = path.join(publicDir, 'sectors.json')
writeFileSync(jsonPath, JSON.stringify(definition, null, 2))
console.log(`Written: ${jsonPath}`)
