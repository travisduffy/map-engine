// Catch-up cap per interval callback -- hitting it resets the accumulator (stall recovery).
const MAX_TICKS_PER_INTERVAL = 10
// Ring capacity for getTelemetry()'s tick-timestamp history.
const TELEMETRY_RING_SIZE = 256

/** Telemetry snapshot: lifetime tick count plus the most recent tick timestamps (ring of `TELEMETRY_RING_SIZE`). */
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
  // Unspent wall time (seconds) carried between _pump callbacks.
  private _accumulator = 0
  // performance.now() at the previous _pump (or start()).
  private _lastTime = 0
  // Lifetime tick counter, exposed via the `elapsed` getter.
  private _elapsed = 0
  private _timerId: ReturnType<typeof setInterval> | null = null
  // Rolling history of recent tick timestamps (capped at TELEMETRY_RING_SIZE).
  private readonly _tickTimestamps: number[] = []

  /** Fixes the tick rate and its per-tick interval; the clock stays stopped until `start()`. */
  constructor(tickHz: number) {
    this._tickHz = tickHz
    this._intervalSeconds = 1 / tickHz
  }

  /** Starts the `setInterval` pump at the tick period; a no-op if already running. */
  start(): void {
    if (this._timerId !== null) return
    this._lastTime = performance.now()
    const periodMs = 1000 / this._tickHz
    this._timerId = setInterval(() => this._pump(), periodMs)
  }

  /** Stops the pump; a no-op if already stopped. Elapsed ticks and telemetry are retained. */
  stop(): void {
    if (this._timerId === null) return
    clearInterval(this._timerId)
    this._timerId = null
  }

  /** Lifetime tick count. */
  get elapsed(): number {
    return this._elapsed
  }

  /** Snapshot of the lifetime tick count plus a copy of the recent tick timestamps. */
  getTelemetry(): TickTelemetry {
    return { tickCount: this._elapsed, timestamps: [...this._tickTimestamps] }
  }

  /**
   * Per-interval accumulator step: converts elapsed wall time into fixed
   * ticks (recording each tick's timestamp into the telemetry ring), capped
   * at `MAX_TICKS_PER_INTERVAL` -- the accumulator is reset when the cap is
   * hit so a stall can't spiral into an unbounded catch-up loop.
   */
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
}
