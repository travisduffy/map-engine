import { describe, it, expect } from 'vitest'

import { MapEngine } from '../src/core/MapEngine'
import { makeCanvas } from './test-utils'
import type { WorkerMessage } from '../src/shared/types'
import type { TickTelemetry } from '../src/worker/SimulationClock'

const REFERENCE_TOLERANCE_MS = 2.0
const NOMINAL_TICK_PERIOD_MS = 1000 / 60
const BURST_WINDOW_MS = 1100

let nextCallId = 1

/** Direct Worker CALL, bypassing SharedRegistryProxy (mirrors test/SimulationClock.test.ts). */
function callWorker<T>(engine: MapEngine, method: string): Promise<T> {
  const worker = engine['_worker'] as Worker
  const id = nextCallId++
  return new Promise<T>((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerMessage>): void => {
      const msg = e.data
      if (msg.type === 'RESULT' && msg.id === id) {
        worker.removeEventListener('message', onMessage)
        resolve(msg.result as T)
      } else if (msg.type === 'ERROR' && msg.id === id) {
        worker.removeEventListener('message', onMessage)
        reject(new Error(msg.message))
      }
    }
    worker.addEventListener('message', onMessage)
    worker.postMessage({
      type: 'CALL',
      id,
      method,
      params: null,
    } satisfies WorkerMessage)
  })
}

/**
 * Drift assertion (Epic 6 Task 6.4, CA-5): repeated `aggregateGroups()` calls
 * chained back-to-back are exactly the same-thread-burst scenario Epic 5's
 * lessons flagged as capable of starving a co-resident `SimulationClock` even
 * though each call cooperatively yields (`yieldIfNeeded` only yields past its
 * 8ms interval threshold; a sequence of calls that individually resolve
 * under that threshold can run with no macrotask yield in between). This
 * asserts the Worker's tick cadence holds steady throughout such a burst.
 *
 * Uses the real `MapEngine`/Worker entry (unlike PathfindingPerf.gl.spec.ts's
 * dedicated test worker) since every CA-5 fixture has a real bitmap+definition
 * pair and goes through the ordinary BOOTSTRAP path.
 */
describe('Aggregation drift gate — Epic 6 Task 6.4 (CA-5)', () => {
  it('SimulationClock cadence stays within tolerance during a same-thread aggregateGroups() burst', async () => {
    const probeCanvas = makeCanvas()
    let rendererString: string
    try {
      const gl = probeCanvas.getContext('webgl2') as WebGL2RenderingContext
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      rendererString = debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
    } finally {
      probeCanvas.remove()
    }
    const isSoftwareRendered = /swiftshader|llvmpipe|software/i.test(
      rendererString
    )
    const toleranceMs = isSoftwareRendered
      ? REFERENCE_TOLERANCE_MS * 5.0
      : REFERENCE_TOLERANCE_MS

    const canvas = makeCanvas()
    const engine = new MapEngine()
    try {
      const fixtures: Array<{
        mapImage: string
        definition: string
        parentMapping: number[]
        maxGroups: number
      }> = await fetch('/test/fixtures/mappings/regions.json').then(r =>
        r.json()
      )
      // The largest CA-5 fixture (4 sectors, 4x4px) -- see generate-mappings.js.
      const fixture = fixtures.find(f =>
        f.mapImage.endsWith('disjoint-groups.png')
      )!

      await engine.loadMap({
        bitmapUrl: fixture.mapImage,
        definitionUrl: fixture.definition,
        canvas,
      })
      await engine.setParentMapping(
        new Uint16Array(fixture.parentMapping),
        fixture.maxGroups
      )

      // Burst across a real >=1.1s wall-clock window (architecture.md: sample
      // a real window rather than pad with setTimeout(0), which browsers
      // clamp to ~4ms and would alias against the 60Hz tick period).
      const burstStart = performance.now()
      let calls = 0
      while (performance.now() - burstStart < BURST_WINDOW_MS) {
        await engine.aggregateGroups()
        calls++
      }
      expect(calls).toBeGreaterThan(0)

      const telemetry = await callWorker<TickTelemetry>(
        engine,
        'getTickTelemetry'
      )
      expect(telemetry.timestamps.length).toBeGreaterThan(1)

      const deltas = telemetry.timestamps
        .slice(1)
        .map((t, i) => t - telemetry.timestamps[i])
      const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length

      console.log(
        `[bench:aggregation] renderer="${rendererString}" calls=${calls} ` +
          `meanDelta=${meanDelta.toFixed(3)}ms (nominal=${NOMINAL_TICK_PERIOD_MS.toFixed(3)}ms, ` +
          `tolerance=+/-${toleranceMs}ms)`
      )
      expect(Math.abs(meanDelta - NOMINAL_TICK_PERIOD_MS)).toBeLessThanOrEqual(
        toleranceMs
      )
    } finally {
      engine.destroy()
      canvas.remove()
    }
  }, 20000)
})
