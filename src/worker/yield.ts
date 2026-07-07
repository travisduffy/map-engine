const YIELD_INTERVAL_MS = 8

/**
 * Cooperative yield for Worker-side computation (B3.b). `state` is a
 * caller-owned `{ lastYield: number }` so every call site along a given
 * computation shares one yield clock. Yields via a `MessageChannel`
 * round-trip only when at least `YIELD_INTERVAL_MS` has elapsed since the
 * last yield; otherwise resolves immediately without a round-trip.
 */
export function yieldIfNeeded(state: { lastYield: number }): Promise<void> {
  const now = performance.now()
  if (now - state.lastYield < YIELD_INTERVAL_MS) {
    return Promise.resolve()
  }
  return new Promise<void>(resolve => {
    const channel = new MessageChannel()
    channel.port2.onmessage = (): void => {
      state.lastYield = performance.now()
      resolve()
    }
    channel.port1.postMessage(0)
  })
}
