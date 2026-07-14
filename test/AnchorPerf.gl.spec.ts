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
 * Drift assertion (Epic 7 Task 7.3, CA-8): repeated `computeAnchors()` calls
 * chained back-to-back over a real >=1.1s window are the same same-thread
 * "many fast calls chained via await" starvation scenario Epic 5's lessons
 * flagged and Epic 6's `AggregationPerf.gl.spec.ts` already gates on.
 *
 * Uses `maps/large.png` (4096x4096, single all-white sector) rather than a
 * small fixture: this sector touches every edge of the bitmap and has zero
 * B1.e interior contour segments, so its anchor is derived entirely from
 * Task 7.1's synthesized map-edge cracks (~16,384 segments) -- this doubles
 * as a stress test of that path, not just a drift-timing vehicle.
 */
describe('Anchors drift gate — Epic 7 Task 7.3 (CA-8)', () => {
  it('SimulationClock cadence stays within tolerance during a same-thread computeAnchors() burst', async () => {
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
      await engine.loadMap({
        bitmapUrl: '/test/fixtures/maps/large.png',
        definitionUrl: '/test/fixtures/maps/large.json',
        canvas,
      })

      // Burst across a real >=1.1s wall-clock window (architecture.md: sample
      // a real window rather than pad with setTimeout(0), which browsers
      // clamp to ~4ms and would alias against the 60Hz tick period).
      const burstStart = performance.now()
      let calls = 0
      while (performance.now() - burstStart < BURST_WINDOW_MS) {
        await engine.computeAnchors()
        calls++
      }
      expect(calls).toBeGreaterThan(0)

      // Sanity: the single sector's anchor really did resolve from
      // synthesized edge cracks, not a degenerate/empty result.
      const [ax, ay] = engine.getAnchor(0)
      expect(ax).toBeGreaterThanOrEqual(0)
      expect(ay).toBeGreaterThanOrEqual(0)

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
        `[bench:anchors] renderer="${rendererString}" calls=${calls} ` +
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
