import type { WorkerMessage } from '../types'
import { MappingRequiredError } from '../errors'

/**
 * @internal Main-thread side of the Transferable ring-pool handoff
 * (F-C.7/F-C.8) for `groupBBoxes`. Steady state holds 4 buffers total across
 * both threads (Worker-owned, in-flight, Main-current, Main-pending-bounce) —
 * this class owns only the two Main-side slots.
 *
 * `groupBBoxes` handoffs are received synchronously inside the Worker's
 * `message` event (the swap + bounce-queue enqueue happen in the same
 * handler tick), so a later, separately-scheduled `getGroupBBox()` call can
 * never observe a mid-swap or torn state.
 *
 * Bounce-back is flushed only from `MapRenderer._postRenderHook` (dirty-gated
 * — see `MapRenderer._loop`). Receiving a handoff calls `markDirty()` so a
 * render — and therefore a flush — always follows (Known Risk 3: without
 * this, a Worker that never gets its buffer back stalls the next
 * `aggregateGroups()`).
 */
export class TransferableGroupPool {
  private readonly _worker: Worker
  private readonly _markDirty: () => void
  private _maxGroups: number | null = null
  private _current: Int16Array | null = null
  private _pending: Int16Array | null = null

  constructor(worker: Worker, markDirty: () => void) {
    this._worker = worker
    this._markDirty = markDirty
    this._worker.addEventListener('message', this._onMessage)
  }

  private _onMessage = (e: MessageEvent<WorkerMessage>): void => {
    const msg = e.data
    if (msg.type === 'INIT_GROUPS') {
      // A (re)allocation on the Worker side invalidates any buffers this
      // pool already holds -- they belong to the old-sized pool.
      this._maxGroups = msg.maxGroups
      this._current = null
      this._pending = null
    } else if (msg.type === 'groupBBoxes') {
      this._pending = this._current
      this._current = msg.buffer
      this._markDirty()
    }
  }

  /** Wired as `MapRenderer._postRenderHook`. Safe to call every frame. */
  flushBounces = (): void => {
    if (!this._pending) return
    const buffer = this._pending
    this._pending = null
    this._worker.postMessage(
      { type: 'returnGroupBBoxes', buffer } satisfies WorkerMessage,
      [buffer.buffer]
    )
  }

  getGroupBBox(groupId: number): [number, number, number, number] {
    if (!this._current) {
      throw new MappingRequiredError(
        'getGroupBBox: aggregateGroups() must resolve at least once before getGroupBBox() is called.'
      )
    }
    if (
      !Number.isInteger(groupId) ||
      groupId < 0 ||
      groupId >= this._maxGroups!
    ) {
      throw new RangeError(
        `getGroupBBox: groupId must be an integer in [0, ${this._maxGroups}) — got ${groupId}`
      )
    }
    const o = groupId * 4
    const b = this._current
    return [b[o], b[o + 1], b[o + 2], b[o + 3]]
  }

  /** Torn down alongside `loadMap()`/`dispose()`, which also replace/terminate the Worker. */
  dispose(): void {
    this._worker.removeEventListener('message', this._onMessage)
    this._current = null
    this._pending = null
  }
}

/**
 * @internal Main-thread side of the Transferable ring-pool handoff (CA-8)
 * for `anchors`. A separate pool from `TransferableGroupPool` (not a
 * generalization of it) so each pool's `_onMessage` narrows `WorkerMessage`
 * on its own literal message-type set without a cast.
 *
 * Mirrors `TransferableGroupPool` exactly except: stride 2 (not 4, `[x, y]`
 * per sector rather than a 4-corner bbox), and `getAnchor` throws a plain
 * `Error` when not yet ready -- unlike `getGroupBBox`'s `MappingRequiredError`,
 * no canonical error class is assigned to this precondition (PRD, Epic 7
 * Task 7.2 ruling).
 */
export class TransferableAnchorPool {
  private readonly _worker: Worker
  private readonly _markDirty: () => void
  private _sectorCount: number | null = null
  private _current: Int16Array | null = null
  private _pending: Int16Array | null = null

  constructor(worker: Worker, markDirty: () => void) {
    this._worker = worker
    this._markDirty = markDirty
    this._worker.addEventListener('message', this._onMessage)
  }

  private _onMessage = (e: MessageEvent<WorkerMessage>): void => {
    const msg = e.data
    if (msg.type === 'INIT_ANCHORS') {
      // A (re)allocation on the Worker side invalidates any buffers this
      // pool already holds -- they belong to the old-sized pool.
      this._sectorCount = msg.sectorCount
      this._current = null
      this._pending = null
    } else if (msg.type === 'anchors') {
      this._pending = this._current
      this._current = msg.buffer
      this._markDirty()
    }
  }

  /** Wired as part of the composite `MapRenderer._postRenderHook`. Safe to call every frame. */
  flushBounces = (): void => {
    if (!this._pending) return
    const buffer = this._pending
    this._pending = null
    this._worker.postMessage(
      { type: 'returnAnchors', buffer } satisfies WorkerMessage,
      [buffer.buffer]
    )
  }

  getAnchor(sectorId: number): [number, number] {
    if (!this._current) {
      throw new Error(
        'getAnchor: computeAnchors() must resolve at least once before getAnchor() is called.'
      )
    }
    if (
      !Number.isInteger(sectorId) ||
      sectorId < 0 ||
      sectorId >= this._sectorCount!
    ) {
      throw new RangeError(
        `getAnchor: sectorId must be an integer in [0, ${this._sectorCount}) — got ${sectorId}`
      )
    }
    const o = sectorId * 2
    const b = this._current
    return [b[o], b[o + 1]]
  }

  /** Torn down alongside `loadMap()`/`dispose()`, which also replace/terminate the Worker. */
  dispose(): void {
    this._worker.removeEventListener('message', this._onMessage)
    this._current = null
    this._pending = null
  }
}
