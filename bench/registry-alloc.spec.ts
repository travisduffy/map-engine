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
  /** Sampled window / scan duration. Below 1.0 means the sampler lost the CPU. */
  samplerCoverage: number
}

/**
 * RSS is a process-wide high-water mark, so a second measurement in this
 * process would inherit the first one's peak as its baseline and report a
 * peak-over-retained gap of roughly zero. `package.json` runs each fixture size
 * through its own `bench:registry-alloc:*` script; this guard makes that a
 * checked invariant rather than a convention a future edit can quietly break.
 */
let hasMeasuredInThisProcess = false

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

/** Upper bound on either sampler handshake; both are a single message round trip. */
const SAMPLER_HANDSHAKE_TIMEOUT_MS = 10_000

async function startSampler(): Promise<{ stop: () => Promise<SamplerResult> }> {
  const worker = new Worker(SAMPLER, {
    workerData: { intervalMs: SAMPLE_INTERVAL_MS },
  })

  // A sampler that dies between the ready handshake and the stop handshake
  // would otherwise leave the run hanging until Playwright's timeout with no
  // diagnostic: an `error` handler attached inside stop() is registered after
  // the failure has already fired, and worker exit was not watched at all.
  // Latch any failure at construction so a later wait can settle from it, and
  // bound every wait so a silently wedged worker still reports something.
  let failure: Error | null = null
  const waiters = new Set<(err: Error) => void>()
  const fail = (err: Error): void => {
    failure ??= err
    for (const reject of waiters) reject(err)
    waiters.clear()
  }
  worker.on('error', fail)
  worker.on('exit', code => {
    if (code !== 0) fail(new Error(`sampler worker exited with code ${code}`))
  })

  function nextMessage(label: string): Promise<unknown> {
    if (failure !== null) return Promise.reject(failure)
    return new Promise<unknown>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = (): void => {
        clearTimeout(timer)
        worker.off('message', onMessage)
        waiters.delete(onFail)
      }
      function onMessage(message: unknown): void {
        cleanup()
        resolve(message)
      }
      function onFail(err: Error): void {
        cleanup()
        reject(err)
      }
      timer = setTimeout(() => {
        cleanup()
        reject(
          new Error(
            `sampler ${label} timed out after ${SAMPLER_HANDSHAKE_TIMEOUT_MS} ms`
          )
        )
      }, SAMPLER_HANDSHAKE_TIMEOUT_MS)
      waiters.add(onFail)
      worker.on('message', onMessage)
    })
  }

  const ready = await nextMessage('ready handshake')
  if (!(ready as { ready?: boolean }).ready) {
    void worker.terminate()
    throw new Error('sampler sent an unexpected first message')
  }

  return {
    stop: async () => {
      try {
        worker.postMessage('stop')
        return (await nextMessage('stop handshake')) as SamplerResult
      } finally {
        void worker.terminate()
      }
    },
  }
}

async function measure(sectorCount: number): Promise<Measurement> {
  if (hasMeasuredInThisProcess) {
    throw new Error(
      'bench:registry-alloc measured twice in one process. RSS is a high-water ' +
        'mark, so the second measurement would inherit the first peak as its ' +
        'baseline and report a near-zero peak-over-retained gap. Run each ' +
        'fixture size through its own script (npm run bench:registry-alloc).'
    )
  }
  hasMeasuredInThisProcess = true

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
    retainedArrayBufferDeltaBytes:
      retained.arrayBuffers - baseline.arrayBuffers,
    samplerIntervalMs: peak.intervalMs,
    samplerSamples: peak.samples,
    samplerCoverage: (peak.samples * peak.intervalMs) / scanMs,
  }
}

function mib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/** Deltas can legitimately be negative — a forced GC can end below baseline. */
function signedMib(bytes: number): string {
  return `${bytes < 0 ? '-' : '+'}${mib(Math.abs(bytes))}`
}

function writeResult(m: Measurement): void {
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
}

function logMeasurement(m: Measurement): void {
  console.log(
    [
      ``,
      `bench:registry-alloc — ${m.width}x${m.height}, ${m.sectorCount} sectors, coverage ${m.coverage * 100}%`,
      `  scan wall-clock   ${m.scanMsMin.toFixed(0)} ms (best of ${m.scanMsSamples.length}: ${m.scanMsSamples.map(s => s.toFixed(0)).join(', ')})`,
      `  peak RSS          ${mib(m.peakRssBytes)} (${signedMib(m.peakRssDeltaBytes)} over baseline ${mib(m.baselineRssBytes)}, ${m.samplerSamples} samples @ ${m.samplerIntervalMs} ms, ${(m.samplerCoverage * 100).toFixed(0)}% coverage)`,
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
  // A sampler starved of CPU while the main thread spins can still take a few
  // samples and still clear the peak-over-retained check below, reporting a
  // plausible-looking peak it never actually observed. Recorded runs sit at
  // ~96%; 0.5 leaves generous headroom for a contended box.
  expect(m.samplerCoverage).toBeGreaterThan(0.5)
  // The transient pixel lists and their typed-array conversions are alive
  // together only inside the constructor. If peak does not clear retained, the
  // sampler missed the window and the run says nothing about the removal.
  expect(m.peakRssDeltaBytes).toBeGreaterThan(m.retainedRssDeltaBytes)
}

// Assert before writing: baselines.json is transcribed by hand from
// .last-result.json, so a run that failed its sanity checks must not leave a
// fully-formed result file behind to be promoted into a baseline by mistake.
test('registry-alloc @1k', async () => {
  const m = await measure(1_000)
  logMeasurement(m)
  assertInstrumentIsLive(m)
  writeResult(m)
})

test('registry-alloc @10k', async () => {
  const m = await measure(10_000)
  logMeasurement(m)
  assertInstrumentIsLive(m)
  writeResult(m)
})
