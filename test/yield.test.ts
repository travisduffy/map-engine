import { describe, it, expect } from 'vitest'

import { yieldIfNeeded } from '../src/worker/yield'

describe('yieldIfNeeded — Epic 2 Task 2.2', () => {
  it('resolves without a MessageChannel round-trip when less than 8ms have elapsed', async () => {
    const state = { lastYield: performance.now() }
    let isResolved = false
    const p = yieldIfNeeded(state).then(() => {
      isResolved = true
    })
    // A same-tick MessageChannel round-trip is impossible — port2.onmessage
    // is always a macrotask. Flushing microtasks only must already resolve.
    await Promise.resolve()
    await Promise.resolve()
    expect(isResolved).toBe(true)
    await p
  })

  it('yields via a MessageChannel round-trip (a real macrotask) once >= 8ms have elapsed', async () => {
    const state = { lastYield: performance.now() - 10 }
    let isResolved = false
    const p = yieldIfNeeded(state).then(() => {
      isResolved = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(isResolved).toBe(false) // still pending after a microtask-only flush
    await p
    expect(isResolved).toBe(true)
    expect(state.lastYield).toBeGreaterThan(performance.now() - 10)
  })

  it('a ~50ms busy-loop calling yieldIfNeeded lets an independently queued message interleave', async () => {
    const externalChannel = new MessageChannel()
    let isExternalMessageProcessed = false
    externalChannel.port2.onmessage = () => {
      isExternalMessageProcessed = true
    }
    externalChannel.port1.postMessage(0)

    const state = { lastYield: performance.now() }
    const start = performance.now()
    while (performance.now() - start < 50) {
      await yieldIfNeeded(state)
    }

    expect(isExternalMessageProcessed).toBe(true)
  })
})
