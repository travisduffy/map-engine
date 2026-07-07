import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MapEngine } from '../src/MapEngine'
import { GameClock } from '../src/GameClock'
import type { MapRenderer } from '../src/MapRenderer'
import { makeCanvas, advanceFrame } from './testUtils'

describe('GameClock — Epic 2', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement
  let renderer: MapRenderer
  let clock: GameClock

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: '/test/fixtures/test-4x4.png',
      definitionUrl: '/test/fixtures/test-4x4.json',
      canvas,
    })
    renderer = engine['_renderer'] as MapRenderer
    cancelAnimationFrame(renderer['_animFrameId'])
    clock = new GameClock(engine, { ticksPerSecond: 1 })
  })

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
    vi.useRealTimers()
  })

  it('AC 2.1a: tick rate at 1x, 2x, 0.5x; registration order within a tick', () => {
    const ticks: number[] = []
    const orderLog: string[] = []
    clock.onTick(elapsed => {
      ticks.push(elapsed)
      orderLog.push('A')
    })
    clock.onTick(() => orderLog.push('B'))

    advanceFrame(renderer, 1) // prime — dt=0, no ticks
    expect(ticks).toHaveLength(0)

    advanceFrame(renderer, 1000) // dt=1.0s @ 1x → 1 tick (elapsed=1)
    expect(ticks).toHaveLength(1)
    expect(ticks[0]).toBe(1)
    expect(orderLog).toEqual(['A', 'B'])

    clock.setSpeed(2)
    advanceFrame(renderer, 500) // dt=0.5s @ 2x = 1.0s → 1 tick (elapsed=2)
    expect(ticks).toHaveLength(2)
    expect(ticks[1]).toBe(2)

    clock.setSpeed(0.5)
    advanceFrame(renderer, 2000) // dt=2.0s @ 0.5x = 1.0s → 1 tick (elapsed=3)
    expect(ticks).toHaveLength(3)
    expect(ticks[2]).toBe(3)
  })

  it('AC 2.1b: B-5 per-tick snapshot — callback added during tick N fires from tick N+1', () => {
    const newCbElapsed: number[] = []
    const newCb = (elapsed: number) => newCbElapsed.push(elapsed)

    const selfRemovingCb = (elapsed: number) => {
      if (elapsed === 1) {
        clock.onTick(newCb)
        clock.offTick(selfRemovingCb)
      }
    }
    clock.onTick(selfRemovingCb)

    advanceFrame(renderer, 1) // prime — dt=0
    clock.setSpeed(10)
    advanceFrame(renderer, 1000) // dt=1.0s @ 10x = 10.0s → 10 ticks

    // tick 1: selfRemovingCb fires, adds newCb, removes itself
    // ticks 2-10: newCb fires (per-tick re-snapshot picks it up immediately)
    expect(newCbElapsed).toHaveLength(9)
    expect(newCbElapsed[0]).toBe(2)
    expect(newCbElapsed[8]).toBe(10)
    expect(clock['_accumulator']).toBeCloseTo(0, 10)
  })

  it('AC 2.2: pause/resume preserves accumulated progress; redundant pause is a no-op', () => {
    advanceFrame(renderer, 1) // prime

    advanceFrame(renderer, 500) // accumulator=0.5, 0 ticks
    expect(clock.elapsed).toBe(0)
    expect(clock['_accumulator']).toBeCloseTo(0.5, 10)

    clock.pause()
    expect(clock.paused).toBe(true)

    advanceFrame(renderer, 10000) // paused — accumulator unchanged
    expect(clock.elapsed).toBe(0)
    expect(clock['_accumulator']).toBeCloseTo(0.5, 10)

    clock.resume()
    expect(clock.paused).toBe(false)

    advanceFrame(renderer, 500) // accumulator reaches 1.0 → 1 tick
    expect(clock.elapsed).toBe(1)

    // Redundant pause: _lastSpeed invariant must not be corrupted
    clock.pause()
    const lastSpeedAfterPause = clock['_lastSpeed']
    expect(lastSpeedAfterPause).toBeGreaterThan(0)

    clock.pause() // second pause — no-op
    expect(clock.paused).toBe(true)
    expect(clock.speed).toBe(0)
    expect(clock['_lastSpeed']).toBe(lastSpeedAfterPause) // unchanged
    expect(clock['_lastSpeed']).toBeGreaterThan(0)
  })

  it('AC 2.3: setSpeed(0) pauses; negative clamped to 0; positive takes effect immediately', () => {
    expect(clock.paused).toBe(false)
    expect(clock.speed).toBe(1)

    clock.setSpeed(0)
    expect(clock.speed).toBe(0)
    expect(clock.paused).toBe(true)

    clock.setSpeed(-5)
    expect(clock.speed).toBe(0) // clamped
    expect(clock.paused).toBe(true)

    clock.setSpeed(3)
    expect(clock.speed).toBe(3)
    expect(clock.paused).toBe(false)
  })

  it('AC 2.4: elapsed starts at 0; increments before callback receives it; never decreases', () => {
    expect(clock.elapsed).toBe(0)

    const receivedElapsed: number[] = []
    clock.onTick(elapsed => receivedElapsed.push(elapsed))

    advanceFrame(renderer, 1) // prime
    advanceFrame(renderer, 1000) // 1 tick
    expect(clock.elapsed).toBe(1)
    expect(receivedElapsed[0]).toBe(1) // callback receives post-increment value

    advanceFrame(renderer, 1000) // 1 more tick
    expect(clock.elapsed).toBe(2)
    expect(receivedElapsed[1]).toBe(2)

    const elapsedBeforePause = clock.elapsed
    clock.pause()
    advanceFrame(renderer, 10000) // paused — no ticks
    expect(clock.elapsed).toBe(elapsedBeforePause)
    expect(clock.elapsed).toBeGreaterThanOrEqual(elapsedBeforePause)
  })

  it('AC 2.5a: spiral-of-death cap — exactly 10 ticks/frame; accumulator reset; follow-up frame has no ticks', () => {
    advanceFrame(renderer, 1) // prime

    advanceFrame(renderer, 11000) // dt=11.0s → capped at 10 ticks, accumulator reset to 0
    expect(clock.elapsed).toBe(10)
    expect(clock['_accumulator']).toBeCloseTo(0, 10)

    advanceFrame(renderer, 100) // dt=0.1s → 0 ticks (accumulator was reset, not just drained)
    expect(clock.elapsed).toBe(10)
  })

  it('AC 2.5b: below cap — 9.5s produces 9 ticks, accumulator preserved at 0.5', () => {
    advanceFrame(renderer, 1) // prime

    advanceFrame(renderer, 9500) // dt=9.5s → 9 ticks, accumulator=0.5
    expect(clock.elapsed).toBe(9)
    expect(clock['_accumulator']).toBeCloseTo(0.5, 10)
  })

  it('AC 2.6: offTick(itself) during iteration does not corrupt subsequent callbacks', () => {
    const calls: string[] = []

    const cb1 = () => {
      clock.offTick(cb1)
      calls.push('cb1')
    }
    const cb2 = () => calls.push('cb2')

    clock.onTick(cb1)
    clock.onTick(cb2)

    advanceFrame(renderer, 1) // prime
    advanceFrame(renderer, 1000) // 1 tick
    expect(calls).toEqual(['cb1', 'cb2'])

    calls.length = 0
    advanceFrame(renderer, 1000) // 1 more tick — cb1 removed itself
    expect(calls).toEqual(['cb2'])
  })

  it('AC 2.7: destroy() silences clock; second destroy() is a no-op', () => {
    const ticks: number[] = []
    clock.onTick(elapsed => ticks.push(elapsed))

    advanceFrame(renderer, 1) // prime
    advanceFrame(renderer, 1000) // 1 tick
    expect(ticks).toHaveLength(1)

    clock.destroy()
    advanceFrame(renderer, 1000) // no ticks — clock destroyed
    expect(ticks).toHaveLength(1)

    expect(() => clock.destroy()).not.toThrow()
  })

  it('AC 2.8: onTick/offTick are no-ops after destroy()', () => {
    clock.destroy()

    const cb = vi.fn()
    expect(() => clock.onTick(cb)).not.toThrow()
    expect(() => clock.offTick(cb)).not.toThrow()

    advanceFrame(renderer, 1) // prime (no-op for clock — already destroyed)
    advanceFrame(renderer, 1000) // no ticks
    expect(cb).not.toHaveBeenCalled()
  })

  it('AC 2.9: GameClock registers exactly one onFrame callback; destroy() unwires it', async () => {
    const testCanvas = makeCanvas()
    const testEngine = new MapEngine()
    try {
      await testEngine.loadMap({
        bitmapUrl: '/test/fixtures/test-4x4.png',
        definitionUrl: '/test/fixtures/test-4x4.json',
        canvas: testCanvas,
      })
      const testRenderer = testEngine['_renderer'] as MapRenderer
      cancelAnimationFrame(testRenderer['_animFrameId'])

      advanceFrame(testRenderer, 1) // prime

      const testClock = new GameClock(testEngine, { ticksPerSecond: 1 })
      expect(testEngine['_frameCallbacks']).toHaveLength(1)

      advanceFrame(testRenderer, 500) // 0 ticks, accumulator ≈ 0.5
      expect(testClock.elapsed).toBe(0)
      expect(testClock['_accumulator']).toBeCloseTo(0.5, 10)

      testClock.destroy()
      expect(testEngine['_frameCallbacks']).toHaveLength(0)

      advanceFrame(testRenderer, 1000) // no ticks after destroy
      expect(testClock.elapsed).toBe(0)
    } finally {
      testEngine.destroy()
      testCanvas.remove()
    }
  })

  it('AC 2.11: engine.destroy() while clock running — no further ticks; clock.destroy() is no-op; properties return last values', () => {
    const ticks: number[] = []
    clock.onTick(elapsed => ticks.push(elapsed))

    advanceFrame(renderer, 1) // prime
    advanceFrame(renderer, 1000) // 1 tick
    expect(ticks).toHaveLength(1)

    const elapsedSnapshot = clock.elapsed
    const speedSnapshot = clock.speed
    const pausedSnapshot = clock.paused

    engine.destroy()

    // _preRenderHook is null after engine.destroy() — advanceFrame is a no-op
    advanceFrame(renderer, 1000)
    expect(ticks).toHaveLength(1)

    expect(() => clock.destroy()).not.toThrow()

    expect(clock.elapsed).toBe(elapsedSnapshot)
    expect(clock.speed).toBe(speedSnapshot)
    expect(clock.paused).toBe(pausedSnapshot)
  })

  it('AC 2.12: bootstrap pause/resume restores initial speed 1', () => {
    // setSpeed(0) then resume()
    clock.setSpeed(0)
    expect(clock.speed).toBe(0)
    clock.resume()
    expect(clock.speed).toBe(1)

    // pause() immediately after construction then resume()
    clock.pause()
    expect(clock.paused).toBe(true)
    clock.resume()
    expect(clock.speed).toBe(1)
    expect(clock.paused).toBe(false)
  })

  it('AC 2.13: invalid ticksPerSecond throws TypeError with correct message', () => {
    const msg = 'GameClock: ticksPerSecond must be a finite positive number'

    expect(() => new GameClock(engine, { ticksPerSecond: 0 })).toThrow(
      new TypeError(msg)
    )
    expect(() => new GameClock(engine, { ticksPerSecond: -1 })).toThrow(
      TypeError
    )
    expect(() => new GameClock(engine, { ticksPerSecond: Infinity })).toThrow(
      TypeError
    )
    expect(() => new GameClock(engine, { ticksPerSecond: NaN })).toThrow(
      TypeError
    )

    expect(() => new GameClock(engine, { ticksPerSecond: 0.5 })).not.toThrow()
  })

  it('F-3.2: drift fixture — 100-tick sequence at 60hz stays within ±1ms', async () => {
    const fixture = (await fetch(
      '/test/fixtures/game-clock/drift-100tick.json'
    ).then(r => r.json())) as {
      hz: number
      ticks: { tick: number; timestamp: number }[]
    }

    const driftClock = new GameClock(engine, { ticksPerSecond: fixture.hz })
    let prevTimestamp = fixture.ticks[0].timestamp
    advanceFrame(renderer, prevTimestamp) // prime — dt=0 at t=0

    for (let i = 1; i < fixture.ticks.length; i++) {
      const { timestamp } = fixture.ticks[i]
      advanceFrame(renderer, timestamp - prevTimestamp)
      prevTimestamp = timestamp
    }

    const intervalMs = 1000 / fixture.hz
    const expectedTicks = fixture.ticks.length - 1

    // A fixed-timestep accumulator may legitimately hold up to one interval's
    // worth of unfired residue (fired-tick count can lag the ideal count by 1
    // at a sample boundary — this is quantization, not drift).
    expect(driftClock.elapsed).toBeGreaterThanOrEqual(expectedTicks - 1)
    expect(driftClock.elapsed).toBeLessThanOrEqual(expectedTicks)

    // Real drift is whether time is conserved: fired ticks * interval, plus
    // whatever sits unfired in the accumulator, must equal total real elapsed
    // time (prevTimestamp) to within ±1ms — i.e. the clock neither gains nor
    // loses time relative to the wall clock.
    const accountedMs =
      driftClock.elapsed * intervalMs + driftClock['_accumulator'] * 1000
    const drift = Math.abs(accountedMs - prevTimestamp)
    expect(drift).toBeLessThanOrEqual(1)

    driftClock.destroy()
  })

  it('AC 2.14: GameClock has no forbidden imports', async () => {
    const text = await fetch('/src/GameClock.ts').then(r => r.text())
    expect(text).not.toMatch(/\bthree\b/)
    expect(text).not.toMatch(/\bdocument\b/)
    expect(text).not.toMatch(/\bwindow\b/)
    expect(text).not.toMatch(/HTMLCanvasElement/)
    expect(text).not.toMatch(/OffscreenCanvas/)
    expect(text).not.toMatch(/internal\/color/)
  })
})
