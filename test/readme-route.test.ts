import { describe, expect, it } from 'vitest'

import readme from '../docs/REFERENCE.md?raw'

const KEYS = [
  'file:',
  '../map-engine',
  /alias:\s*\{\s*three:/,
  /allow:\s*\[/,
  'server.fs.allow',
  'dedupe',
  'preserveSymlinks',
  'dist/assets',
]

describe('README local route', () => {
  it('names the keys of the local route', () => {
    const block = readme.split('**Local route')[1]?.split('\n## ')[0] ?? ''
    const missing = KEYS.filter(
      key => !(key instanceof RegExp ? key.test(block) : block.includes(key))
    )
    expect(missing).toEqual([])
  })
})
