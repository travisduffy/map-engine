import { describe, it, expect } from 'vitest'
import { makeCanvas } from './testUtils'
import type { PerfWorkerResult } from './workers/pathfinding-perf-worker'

const FIXTURE_URL = '/test/fixtures/pathfinding/grid-10k.json'
const REFERENCE_TOLERANCE_MS = 2.0
const NOMINAL_TICK_PERIOD_MS = 1000 / 60

/**
 * Perf gate + drift assertion (Epic 5 Task 5.4, F-4.7). grid-10k.json has no
 * corresponding bitmap and the real Worker entry only accepts BOOTSTRAP, so
 * this spec runs a dedicated test worker (test/workers/pathfinding-perf-worker.ts)
 * that constructs the real SpatialGraph directly from the fixture's CSR
 * arrays, runs all 50 fixture pairs through findPath, and hosts a real
 * SimulationClock on the same thread to observe cadence during the burst.
 *
 * Software-rendering tolerance detection (WEBGL_debug_renderer_info) mirrors
 * test/PalettePerf.gl.spec.ts even though this test performs no GPU work --
 * it's the established signal in this repo for "this session is running on
 * a slow/software-rendered CI box" (ROADMAP §12.2), and a throwaway canvas
 * is the cheapest way to query it.
 */
describe('Pathfinding perf gate + drift — Epic 5 Task 5.4 (F-4.7)', () => {
  it('P95 latency < 2ms, the >=500-node pair < 2ms, costs match, drift <= +/-2ms', async () => {
    const canvas = makeCanvas()
    let rendererString: string
    try {
      const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      rendererString = debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
    } finally {
      canvas.remove()
    }
    const isSoftwareRendered = /swiftshader|llvmpipe|software/i.test(
      rendererString
    )
    const toleranceMs = isSoftwareRendered
      ? REFERENCE_TOLERANCE_MS * 5.0
      : REFERENCE_TOLERANCE_MS

    const worker = new Worker(
      new URL('./workers/pathfinding-perf-worker.ts', import.meta.url),
      {
        type: 'module',
      }
    )

    try {
      const resultPromise = new Promise<PerfWorkerResult>(resolve => {
        worker.onmessage = (e: MessageEvent<PerfWorkerResult>): void => {
          if (e.data.type === 'RESULT') resolve(e.data)
        }
      })
      worker.postMessage({ type: 'RUN', fixtureUrl: FIXTURE_URL })
      const { results, unreachable, telemetry } = await resultPromise

      // ---- correctness: every pair accounted for, exactly one unreachable ----
      expect(results.length + unreachable.length).toBe(50)
      expect(unreachable.length).toBe(1)
      expect(unreachable[0].isPathNotFoundError).toBe(true)
      expect(unreachable[0].expectedCost).toBeNull()

      // ---- cost verification: every reachable pair matches the fixture's reference Dijkstra ----
      for (const r of results) {
        expect(r.cost).toBe(r.expectedCost)
      }

      // ---- the >=500-node corridor pair resolves in < 2ms (tolerance-adjusted) ----
      const longPair = results.find(r => r.nodeCount >= 500)
      expect(longPair).toBeDefined()
      console.log(
        `[bench:pathfinding] corridor pair nodeCount=${longPair!.nodeCount} ms=${longPair!.ms.toFixed(3)}`
      )
      expect(longPair!.ms).toBeLessThanOrEqual(toleranceMs)

      // ---- P95 latency over all reachable pairs < 2ms (tolerance-adjusted) ----
      const sortedMs = results.map(r => r.ms).sort((a, b) => a - b)
      const p95Index = Math.min(
        sortedMs.length - 1,
        Math.floor(0.95 * sortedMs.length)
      )
      const p95 = sortedMs[p95Index]

      console.log(
        `[bench:pathfinding] renderer="${rendererString}" p95=${p95.toFixed(3)}ms ` +
          `reachable=${results.length} unreachable=${unreachable.length} ` +
          `samples=${JSON.stringify(sortedMs.map(s => Number(s.toFixed(3))))}`
      )

      expect(p95).toBeLessThanOrEqual(toleranceMs)

      // ---- drift (F-4.7): steady ~60Hz cadence throughout the findPath burst ----
      // Same environment-aware widening as the latency gate above (ROADMAP
      // §12.2: "never let a slow CI box mark a perf gate green/red
      // authoritatively") -- the strict +/-2ms reference-hardware bound
      // applies untolerated only when not software-rendered; a detected
      // software renderer is this repo's existing signal that the session
      // is running on a slow/shared/containerized box, which affects
      // Worker-thread tick cadence exactly as much as it affects render
      // timing.
      const driftToleranceMs = toleranceMs
      expect(telemetry.timestamps.length).toBe(telemetry.tickCount)
      expect(telemetry.tickCount).toBeGreaterThan(0)
      const deltas = telemetry.timestamps
        .slice(1)
        .map((t, i) => t - telemetry.timestamps[i])
      const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
      console.log(
        `[bench:pathfinding] drift meanDelta=${meanDelta.toFixed(3)}ms (nominal=${NOMINAL_TICK_PERIOD_MS.toFixed(3)}ms, tolerance=+/-${driftToleranceMs}ms)`
      )
      expect(Math.abs(meanDelta - NOMINAL_TICK_PERIOD_MS)).toBeLessThanOrEqual(
        driftToleranceMs
      )
    } finally {
      worker.terminate()
    }
  }, 20000)
})
