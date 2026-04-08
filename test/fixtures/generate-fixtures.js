// test/fixtures/generate-fixtures.js
// Generates test-4x4.png: a 4×4 pixel PNG with four 2×2 solid-color quadrants.
// Run from the repo root: node test/fixtures/generate-fixtures.js

import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const pixels = Buffer.from([
  // row 0: red, red, green, green  (4 pixels × 3 bytes = 12 bytes)
  255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0,
  // row 1: red, red, green, green
  255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0,
  // row 2: blue, blue, yellow, yellow
  0, 0, 255, 0, 0, 255, 255, 255, 0, 255, 255, 0,
  // row 3: blue, blue, yellow, yellow
  0, 0, 255, 0, 0, 255, 255, 255, 0, 255, 255, 0,
])

// pixels.length must equal 48 (4 * 4 * 3)
if (pixels.length !== 48)
  throw new Error(`Expected 48 bytes, got ${pixels.length}`)

await sharp(pixels, { raw: { width: 4, height: 4, channels: 3 } })
  .png()
  .toFile(join(__dirname, 'test-4x4.png'))

console.log('Generated test/fixtures/test-4x4.png')
