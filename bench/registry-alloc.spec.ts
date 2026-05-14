import { test } from 'playwright/test'
import { SectorRegistry } from '../src/SectorRegistry'
import type { SectorDefinitionFile } from '../src/types'
import sharp from 'sharp'
import * as path from 'path'
import * as fs from 'fs'

const ROOT = path.resolve(process.cwd())
const LARGE_PNG = path.join(ROOT, 'test/fixtures/maps/large.png')
const RESULT_FILE = path.join(ROOT, 'bench/.last-result.json')

test('registry-alloc', async () => {
  const { data, info } = await sharp(LARGE_PNG)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const buffer = new Uint8ClampedArray(
    data.buffer,
    data.byteOffset,
    data.byteLength
  )
  const { width, height } = info

  // Empty definition: exercises the full O(W×H) scan + borderEdges allocation
  // without sector-specific spatial structures. This is the dominant allocation cost.
  const definition: SectorDefinitionFile = {}

  if (typeof global.gc === 'function') global.gc()

  const before = process.memoryUsage().heapUsed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _registry = new SectorRegistry(buffer, width, height, definition)
  const after = process.memoryUsage().heapUsed

  const delta = Math.max(0, after - before)

  fs.writeFileSync(
    RESULT_FILE,
    JSON.stringify({ delta, timestamp: new Date().toISOString() }, null, 2)
  )

  console.log(`bench:registry-alloc delta=${delta} bytes`)
})
