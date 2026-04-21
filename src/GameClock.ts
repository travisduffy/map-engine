import type { MapEngine } from './MapEngine'
import type { ClockTickCallback } from './types'

const MAX_TICKS_PER_FRAME = 10

export class GameClock {
  private _engine: MapEngine
  private _speed = 1
  private _lastSpeed = 1
  private _elapsed = 0
  private _accumulator = 0
  private _intervalSeconds: number
  private _tickCallbacks: ClockTickCallback[] = []
  private _destroyed = false

  constructor(engine: MapEngine, options?: { ticksPerSecond?: number }) {
    const tps = options?.ticksPerSecond ?? 1
    if (!isFinite(tps) || tps <= 0 || isNaN(tps)) {
      throw new TypeError(
        'GameClock: ticksPerSecond must be a finite positive number'
      )
    }
    this._intervalSeconds = 1 / tps
    this._engine = engine
    engine.onFrame(this._internalFrameCallback)
  }

  private _internalFrameCallback = (dt: number): void => {
    if (this._speed === 0) return

    this._accumulator += dt * this._speed

    let ticks = 0
    while (
      this._accumulator >= this._intervalSeconds &&
      ticks < MAX_TICKS_PER_FRAME
    ) {
      this._accumulator -= this._intervalSeconds
      this._elapsed++
      for (const cb of [...this._tickCallbacks]) {
        try {
          cb(this._elapsed)
        } catch (err) {
          console.error('[map-engine] ClockTickCallback threw:', err)
        }
      }
      ticks++
    }

    if (ticks === MAX_TICKS_PER_FRAME) {
      this._accumulator = 0
    }
  }

  get paused(): boolean {
    return this._speed === 0
  }

  get speed(): number {
    return this._speed
  }

  get elapsed(): number {
    return this._elapsed
  }

  setSpeed(multiplier: number): void {
    if (this._destroyed) return
    const n = Math.max(0, multiplier)
    this._speed = n
    if (n > 0) this._lastSpeed = n
  }

  pause(): void {
    if (this._destroyed || this._speed === 0) return
    this._lastSpeed = this._speed
    this._speed = 0
  }

  resume(): void {
    if (this._destroyed || this._speed > 0) return
    this._speed = this._lastSpeed
  }

  onTick(callback: ClockTickCallback): void {
    if (this._destroyed) return
    this._tickCallbacks.push(callback)
  }

  offTick(callback: ClockTickCallback): void {
    if (this._destroyed) return
    const idx = this._tickCallbacks.indexOf(callback)
    if (idx !== -1) this._tickCallbacks.splice(idx, 1)
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._engine.offFrame(this._internalFrameCallback)
    this._tickCallbacks = []
  }
}
