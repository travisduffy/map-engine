import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { RenderClock } from '../src/core/RenderClock'

describe('RenderClock — Epic 2 Task 2.1', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('first tick dt === 0; subsequent ticks report real elapsed dt', () => {
    const clock = new RenderClock()
    const dts: number[] = []
    const cb = (dt: number): void => {
      dts.push(dt)
    }

    clock.tick([cb])
    expect(dts[0]).toBe(0)

    vi.advanceTimersByTime(1000)
    clock.tick([cb])
    expect(dts[1]).toBe(1)

    vi.advanceTimersByTime(500)
    clock.tick([cb])
    expect(dts[2]).toBe(0.5)
  })

  it('dispatches to callbacks in order', () => {
    const clock = new RenderClock()
    const order: string[] = []

    clock.tick([() => order.push('a'), () => order.push('b')])

    expect(order).toEqual(['a', 'b'])
  })

  it('inTick is true only for the duration of the callback dispatch', () => {
    const clock = new RenderClock()
    let hasSeenInTick = false

    clock.tick([
      () => {
        hasSeenInTick = clock.inTick
      },
    ])

    expect(hasSeenInTick).toBe(true)
    expect(clock.inTick).toBe(false)
  })

  it('a callback throwing does not stop subsequent callbacks', () => {
    const clock = new RenderClock()
    const calls: string[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    clock.tick([
      () => {
        calls.push('first')
        throw new Error('boom')
      },
      () => calls.push('second'),
    ])

    expect(calls).toEqual(['first', 'second'])
    errorSpy.mockRestore()
  })

  it('reset() clears the dt baseline so the next tick reports dt === 0', () => {
    const clock = new RenderClock()
    const dts: number[] = []
    const cb = (dt: number): void => {
      dts.push(dt)
    }

    clock.tick([cb])
    vi.advanceTimersByTime(1000)
    clock.tick([cb])
    expect(dts[1]).toBe(1)

    clock.reset()
    vi.advanceTimersByTime(1000)
    clock.tick([cb])
    expect(dts[2]).toBe(0)
  })
})
