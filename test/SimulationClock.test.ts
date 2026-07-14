import { describe, it, expect, afterEach, vi } from 'vitest'

import { MapEngine } from '../src/core/MapEngine'
import {
  SimulationClock,
  type TickTelemetry,
} from '../src/worker/SimulationClock'
import { makeCanvas } from './test-utils'
import type { WorkerMessage } from '../src/shared/types'

let nextCallId = 1

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
        reject(new Error(msg.error))
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

describe('SimulationClock — Epic 2 Task 2.3', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('ticks at ~60Hz over a real 1s+ sample window (drift-bound tolerance)', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: '/test/fixtures/test-4x4.png',
      definitionUrl: '/test/fixtures/test-4x4.json',
      canvas,
    })

    // Worker timers run on a real, separate thread — unaffected by Main's
    // (absent, here) fake timers. Sample over >= 1 real second.
    await new Promise(resolve => setTimeout(resolve, 1100))

    const telemetry = await callWorker<TickTelemetry>(
      engine,
      'getTickTelemetry'
    )

    // Generous bound absorbing normal timer/scheduling jitter on shared CI
    // hardware (nominal is 66 ticks over 1100ms at 60Hz).
    expect(telemetry.tickCount).toBeGreaterThanOrEqual(55)
    expect(telemetry.tickCount).toBeLessThanOrEqual(72)

    // Steady cadence: consecutive tick timestamps should cluster around the
    // 16.667ms period, not be bunched or spread by more than the drift bound.
    const { timestamps } = telemetry
    expect(timestamps.length).toBe(telemetry.tickCount)
    const deltas = timestamps.slice(1).map((t, i) => t - timestamps[i])
    const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
    expect(meanDelta).toBeGreaterThan(15)
    expect(meanDelta).toBeLessThan(18)
  }, 10000)

  it('jank isolation: cadence holds steady across a 100ms synchronous Main-thread block', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: '/test/fixtures/test-4x4.png',
      definitionUrl: '/test/fixtures/test-4x4.json',
      canvas,
    })

    await new Promise(resolve => setTimeout(resolve, 300))
    const before = await callWorker<TickTelemetry>(engine, 'getTickTelemetry')

    // Synchronously busy-block Main — the Worker runs on a separate real
    // thread, so its SimulationClock must keep ticking regardless.
    const blockStart = performance.now()
    while (performance.now() - blockStart < 100) {
      /* spin */
    }

    await new Promise(resolve => setTimeout(resolve, 300))
    const after = await callWorker<TickTelemetry>(engine, 'getTickTelemetry')

    const ticksDuringWindow = after.tickCount - before.tickCount
    expect(ticksDuringWindow).toBeGreaterThan(15)

    const deltas = after.timestamps
      .slice(1)
      .map((t, i) => t - after.timestamps[i])
    const maxDelta = Math.max(...deltas)
    // Generous bound (~3 ticks) to absorb normal OS/browser scheduling
    // jitter on shared CI hardware while still catching a genuine stall —
    // a real 100ms Main-thread block would show up as a much larger gap.
    expect(maxDelta).toBeLessThan(50)
  }, 10000)
})

describe('SimulationClock — drift re-verification (Epic 2 Task 2.4)', () => {
  it('F-3.2 fixture replay: 100-tick sequence at 60hz stays within ±1ms (accounted-for time)', async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    try {
      const fixture = (await fetch(
        '/test/fixtures/game-clock/drift-100tick.json'
      ).then(r => r.json())) as {
        hz: number
        ticks: { tick: number; timestamp: number }[]
      }

      const clock = new SimulationClock(fixture.hz)
      let prevTimestamp = fixture.ticks[0].timestamp
      clock['_lastTime'] = prevTimestamp // prime — matches the fixture's t=0 baseline

      for (let i = 1; i < fixture.ticks.length; i++) {
        const { timestamp } = fixture.ticks[i]
        vi.advanceTimersByTime(timestamp - prevTimestamp)
        clock['_pump']()
        prevTimestamp = timestamp
      }

      const intervalMs = 1000 / fixture.hz
      const expectedTicks = fixture.ticks.length - 1

      // Same accumulator-quantization allowance as the original fixed-tick
      // clock baseline (Task 1.1): fired-tick count may lag the ideal count
      // by 1 at a sample boundary.
      expect(clock.elapsed).toBeGreaterThanOrEqual(expectedTicks - 1)
      expect(clock.elapsed).toBeLessThanOrEqual(expectedTicks)

      const accountedMs =
        clock.elapsed * intervalMs + clock['_accumulator'] * 1000
      const drift = Math.abs(accountedMs - prevTimestamp)
      expect(drift).toBeLessThanOrEqual(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
