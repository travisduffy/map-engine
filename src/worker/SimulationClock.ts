const MAX_TICKS_PER_INTERVAL = 10
const TELEMETRY_RING_SIZE = 256

export interface TickTelemetry {
  tickCount: number
  timestamps: number[]
}

/**
 * Worker-side fixed-tick simulation clock (B3.b). Self-schedules via
 * `setInterval` at the tick period; the accumulator absorbs the resulting
 * scheduling jitter the same way a Main-thread rAF-driven fixed-tick
 * accumulator does, including the same `MAX_TICKS_PER_INTERVAL` catch-up cap
 * (resetting the accumulator when hit, so an unyielded Worker stall can't
 * spiral into an unbounded catch-up loop).
 */
export class SimulationClock {
  private readonly _tickHz: number
  private readonly _intervalSeconds: number
  private _accumulator = 0
  private _lastTime = 0
  private _elapsed = 0
  private _timerId: ReturnType<typeof setInterval> | null = null
  private readonly _tickTimestamps: number[] = []

  constructor(tickHz: number) {
    this._tickHz = tickHz
    this._intervalSeconds = 1 / tickHz
  }

  start(): void {
    if (this._timerId !== null) return
    this._lastTime = performance.now()
    const periodMs = 1000 / this._tickHz
    this._timerId = setInterval(() => this._pump(), periodMs)
  }

  stop(): void {
    if (this._timerId === null) return
    clearInterval(this._timerId)
    this._timerId = null
  }

  private _pump(): void {
    const now = performance.now()
    const dt = (now - this._lastTime) / 1000
    this._lastTime = now
    this._accumulator += dt

    let ticks = 0
    while (
      this._accumulator >= this._intervalSeconds &&
      ticks < MAX_TICKS_PER_INTERVAL
    ) {
      this._accumulator -= this._intervalSeconds
      this._elapsed++
      this._tickTimestamps.push(now)
      if (this._tickTimestamps.length > TELEMETRY_RING_SIZE) {
        this._tickTimestamps.shift()
      }
      ticks++
    }
    if (ticks === MAX_TICKS_PER_INTERVAL) {
      this._accumulator = 0
    }
  }

  get elapsed(): number {
    return this._elapsed
  }

  getTelemetry(): TickTelemetry {
    return { tickCount: this._elapsed, timestamps: [...this._tickTimestamps] }
  }
}
