import { describe, it, expect } from 'vitest'

import { SectorBitmapParser } from '../src/sector/SectorBitmapParser'

/**
 * Decode-half measurement for the map-load path. `bench/registry-alloc.spec.ts`
 * covers the `SectorRegistry` scan, but it runs in Node under Playwright where
 * `createImageBitmap` and `OffscreenCanvas` do not exist, so the decode cost it
 * cannot reach was the last unquantified figure in README's Known limitations.
 *
 * Runs here instead, in Vitest browser mode, on the same 4096x4096 fixture the
 * scan benchmark sizes against — so the two halves are directly addable.
 *
 * Emits figures rather than gating on a threshold, matching the scan benchmark:
 * there is no reference-hardware number to compare against, and inventing one
 * on a contended box would produce a flaky gate rather than a useful signal.
 * Transcribe the log into `bench/baselines.json` under `b4.decode`.
 */
describe('decode cost — SectorBitmapParser', () => {
  it('reports fetch, decode, and readback cost for a 4096x4096 bitmap', async () => {
    const URL_ = '/test/fixtures/maps/large.png'
    const SAMPLES = 5
    const parser = new SectorBitmapParser()

    // Warm up: primes the HTTP cache so later samples measure decode, not
    // first-byte latency, and lets the codec's own lazy init settle.
    const warm = await parser.parse(URL_)
    expect(warm.width).toBe(4096)
    expect(warm.height).toBe(4096)
    expect(warm.buffer.length).toBe(4096 * 4096 * 4)

    // Best-of-N, minimum kept: contention only ever makes a run slower
    // (.claude/rules/testing.md, in the legacy snapshot under log/artifacts/).
    const parseMs: number[] = []
    const decodeMs: number[] = []
    const readbackMs: number[] = []

    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now()
      await parser.parse(URL_)
      parseMs.push(performance.now() - t0)

      // Same steps as parse(), timed apart, to attribute the total. The blob
      // is fetched outside the timed region so neither figure includes I/O.
      const blob = await (await fetch(URL_)).blob()

      const d0 = performance.now()
      const bitmap = await createImageBitmap(blob)
      decodeMs.push(performance.now() - d0)

      const r0 = performance.now()
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      readbackMs.push(performance.now() - r0)

      expect(imageData.data.length).toBe(4096 * 4096 * 4)
      bitmap.close()
    }

    const best = (xs: number[]): number => Math.min(...xs)
    const fmt = (xs: number[]): string =>
      `${best(xs).toFixed(0)} ms (best of ${xs.length}: ${xs.map(x => x.toFixed(0)).join(', ')})`

    console.log(
      [
        ``,
        `bench:decode — 4096x4096 PNG (${URL_})`,
        `  parse() end-to-end  ${fmt(parseMs)}`,
        `  createImageBitmap   ${fmt(decodeMs)}`,
        `  OffscreenCanvas rb  ${fmt(readbackMs)}`,
        ``,
      ].join('\n')
    )

    // Sanity only — proves the instrument measured something, not that the
    // number is good. No threshold is asserted; see the block comment above.
    expect(best(parseMs)).toBeGreaterThan(0)
    expect(best(decodeMs)).toBeGreaterThan(0)
    expect(best(readbackMs)).toBeGreaterThan(0)
  })
})
