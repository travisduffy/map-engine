import type { FrameCallback } from '../shared/types.js'

/**
 * Main-thread raw per-frame dt dispatch (Epic 2, B3.b). Owns dt-tracking and
 * the in-tick flag; the frame-callback list itself stays on `MapEngine` so
 * `onFrame`/`offFrame` keep their existing pre-`loadMap()` registration
 * semantics.
 */
export class RenderClock {
  // performance.now() of the previous tick; -1 means no baseline yet (the next tick reports dt 0).
  private _lastFrameTime = -1
  private _isInTick = false

  /** True while `tick()` is mid-dispatch of its frame callbacks. Frozen public name (R10). */
  get inTick(): boolean {
    return this._isInTick
  }

  /**
   * Resets the dt baseline — used on `MapEngine.loadMap()` reload so the
   * first tick of the new session reports dt === 0 rather than a stale gap.
   */
  reset(): void {
    this._lastFrameTime = -1
  }

  /**
   * Computes dt from `performance.now()` (0 on the first call) and
   * dispatches it to `callbacks` in order — over a snapshot copy, so a
   * callback that registers/unregisters mid-dispatch never perturbs this
   * tick, and a throwing callback is logged without aborting the rest.
   * Since Epic 4's LUT-based color pipeline writes are O(1) (no
   * bbox/dirty-rect batching needed), there is no longer a post-dispatch
   * flush step to couple here.
   */
  tick(callbacks: readonly FrameCallback[]): void {
    const now = performance.now()
    const dt =
      this._lastFrameTime === -1 ? 0 : (now - this._lastFrameTime) / 1000
    this._lastFrameTime = now
    this._isInTick = true
    try {
      for (const cb of [...callbacks]) {
        try {
          cb(dt)
        } catch (err) {
          console.error('[map-engine] FrameCallback threw:', err)
        }
      }
    } finally {
      this._isInTick = false
    }
  }
}
