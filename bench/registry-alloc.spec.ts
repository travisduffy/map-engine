/**
 * b1 — the cost of `SectorRegistry`'s O(W×H) scan.
 *
 * Reports scan wall-clock, peak allocation during the scan, and allocation
 * retained after it, against a fixture with total sector coverage (see
 * `test/fixtures/generate-registry-fixture.ts`) — so every figure here is an
 * explicit upper bound for a map of these dimensions.
 *
 * Two counters, two scopes, for the reason spelled out in `bench/rss-sampler.mjs`:
 *
 *   - **Peak** is process-wide RSS, sampled from a worker thread while the
 *     constructor runs. RSS is the only `process.memoryUsage()` field that is
 *     not per-V8-isolate, so it is the only one an out-of-band observer can
 *     read. It is an upper bound: the allocator does not necessarily return
 *     pages to the OS promptly.
 *   - **Retained** is the main thread's own post-GC delta, split into its V8
 *     heap and ArrayBuffer components. The transient pixel lists are heap
 *     objects while the retained spatial buffers are ArrayBuffer-backed, so
 *     either counter alone hides roughly half the footprint.
 *
 * Each fixture size runs in its own process (see `package.json`'s two
 * `bench:registry-alloc:*` scripts). RSS is a high-water mark that a second
 * measurement in the same process would inherit as its baseline, which would
 * flatten the peak-over-retained gap this benchmark exists to show.
 */
import { test, expect } from 'playwright/test'
import { Worker } from 'node:worker_threads'
import * as path from 'node:path'
import * as fs from 'node:fs'

import { SectorRegistry } from '../src/sector/SectorRegistry'
import { generateRegistryFixture } from '../test/fixtures/generate-registry-fixture'

const ROOT = path.resolve(process.cwd())
const SAMPLER = path.join(ROOT, 'bench/rss-sampler.mjs')
const RESULT_FILE = path.join(ROOT, 'bench/.last-result.json')

/** The repo's documented mobile texture cap; `README.md` sizes its heap budget here. */
const WIDTH = 4096
const HEIGHT = 4096
const SEED = 20260721

/** Wall-clock is best-of-N: contention only ever makes a run slower. */
const TIMING_SAMPLES = 3
const SAMPLE_INTERVAL_MS = 5

interface SamplerResult {
  peakRss: number
  samples: number
  intervalMs: number
}

interface Measurement {
  sectorCount: number
  width: number
  height: number
  coverage: number
  scanMsMin: number
  scanMsSamples: number[]
  baselineRssBytes: number
  peakRssBytes: number
  peakRssDeltaBytes: number
  retainedRssDeltaBytes: number
  retainedHeapDeltaBytes: number
  retainedArrayBufferDeltaBytes: number
  samplerIntervalMs: number
  samplerSamples: number
}

/**
 * Fails loudly rather than skipping. The previous revision of this benchmark
 * guarded with `if (typeof global.gc === 'function')` and its npm script passed
 * no flag, so the collection silently never happened and every recorded figure
 * included whatever garbage happened to be live.
 */
function forceGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc
  if (typeof gc !== 'function') {
    throw new Error(
      'bench:registry-alloc requires --expose-gc, which is missing. Run it ' +
        'through `npm run bench:registry-alloc` (which sets NODE_OPTIONS), not ' +
        '`npx playwright test` directly. Without a forced collection the ' +
        'retained-allocation figures are meaningless.'
    )
  }
  gc()
}

async function startSampler(): Promise<{ stop: () => Promise<SamplerResult> }> {
  const worker = new Worker(SAMPLER, {
    workerData: { intervalMs: SAMPLE_INTERVAL_MS },
  })

  await new Promise<void>((resolve, reject) => {
    worker.once('error', reject)
    worker.once('message', message => {
      if ((message as { ready?: boolean }).ready) resolve()
      else reject(new Error(`sampler sent an unexpected first message`))
    })
  })

  return {
    stop: () =>
      new Promise<SamplerResult>((resolve, reject) => {
        worker.once('error', reject)
        worker.once('message', message => {
          void worker.terminate()
          resolve(message as SamplerResult)
        })
        worker.postMessage('stop')
      }),
  }
}

async function measure(sectorCount: number): Promise<Measurement> {
  const fixture = generateRegistryFixture({
    seed: SEED,
    width: WIDTH,
    height: HEIGHT,
    sectorCount,
  })

  forceGc()
  const sampler = await startSampler()
  const baseline = process.memoryUsage()

  const t0 = performance.now()
  const registry = new SectorRegistry(
    fixture.buffer,
    fixture.width,
    fixture.height,
    fixture.definition
  )
  const scanMs = performance.now() - t0

  const peak = await sampler.stop()

  // `registry` is deliberately still reachable here: this delta is what the
  // scan hands back to the caller, not what it burned producing it.
  forceGc()
  const retained = process.memoryUsage()

  expect(registry.idToHex).toHaveLength(sectorCount)

  const scanMsSamples = [scanMs]
  for (let i = 1; i < TIMING_SAMPLES; i++) {
    forceGc()
    const start = performance.now()
    const repeat = new SectorRegistry(
      fixture.buffer,
      fixture.width,
      fixture.height,
      fixture.definition
    )
    scanMsSamples.push(performance.now() - start)
    expect(repeat.idToHex).toHaveLength(sectorCount)
  }

  return {
    sectorCount,
    width: WIDTH,
    height: HEIGHT,
    coverage: fixture.coverage,
    scanMsMin: Math.min(...scanMsSamples),
    scanMsSamples,
    baselineRssBytes: baseline.rss,
    peakRssBytes: peak.peakRss,
    peakRssDeltaBytes: peak.peakRss - baseline.rss,
    retainedRssDeltaBytes: retained.rss - baseline.rss,
    retainedHeapDeltaBytes: retained.heapUsed - baseline.heapUsed,
    retainedArrayBufferDeltaBytes: retained.arrayBuffers - baseline.arrayBuffers,
    samplerIntervalMs: peak.intervalMs,
    samplerSamples: peak.samples,
  }
}

function mib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/** Deltas can legitimately be negative — a forced GC can end below baseline. */
function signedMib(bytes: number): string {
  return `${bytes < 0 ? '-' : '+'}${mib(Math.abs(bytes))}`
}

function report(m: Measurement): void {
  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true })
  // Each fixture size runs in its own process, so the file is merged rather
  // than overwritten — but only across `sectors_*` keys, so output from an
  // earlier revision of this benchmark does not survive as a stale sibling.
  const previous: Record<string, unknown> = fs.existsSync(RESULT_FILE)
    ? JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'))
    : {}
  const existing: Record<string, unknown> = Object.fromEntries(
    Object.entries(previous).filter(([key]) => key.startsWith('sectors_'))
  )
  existing[`sectors_${m.sectorCount}`] = {
    ...m,
    capturedAt: new Date().toISOString(),
  }
  fs.writeFileSync(RESULT_FILE, `${JSON.stringify(existing, null, 2)}\n`)

  console.log(
    [
      ``,
      `bench:registry-alloc — ${m.width}x${m.height}, ${m.sectorCount} sectors, coverage ${m.coverage * 100}%`,
      `  scan wall-clock   ${m.scanMsMin.toFixed(0)} ms (best of ${m.scanMsSamples.length}: ${m.scanMsSamples.map(s => s.toFixed(0)).join(', ')})`,
      `  peak RSS          ${mib(m.peakRssBytes)} (${signedMib(m.peakRssDeltaBytes)} over baseline ${mib(m.baselineRssBytes)}, ${m.samplerSamples} samples @ ${m.samplerIntervalMs} ms)`,
      `  retained RSS      ${signedMib(m.retainedRssDeltaBytes)}`,
      `  retained V8 heap  ${signedMib(m.retainedHeapDeltaBytes)}`,
      `  retained ArrayBuf ${signedMib(m.retainedArrayBufferDeltaBytes)}`,
      ``,
    ].join('\n')
  )
}

/**
 * Sanity assertions, not thresholds. No figure here is a pass/fail gate — the
 * benchmark emits numbers and `bench/baselines.json` records them. These only
 * catch an instrument that is measuring nothing.
 */
function assertInstrumentIsLive(m: Measurement): void {
  expect(m.samplerSamples).toBeGreaterThan(0)
  expect(m.scanMsMin).toBeGreaterThan(0)
  // The transient pixel lists and their typed-array conversions are alive
  // together only inside the constructor. If peak does not clear retained, the
  // sampler missed the window and the run says nothing about the removal.
  expect(m.peakRssDeltaBytes).toBeGreaterThan(m.retainedRssDeltaBytes)
}

test('registry-alloc @1k', async () => {
  const m = await measure(1_000)
  report(m)
  assertInstrumentIsLive(m)
})

test('registry-alloc @10k', async () => {
  const m = await measure(10_000)
  report(m)
  assertInstrumentIsLive(m)
})
