import { MappingRequiredError } from '../shared/errors'
import type { WorkerMessage } from '../shared/types'

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
  // Schedules a render (and therefore a _postRenderHook flush) after every handoff.
  private readonly _markDirty: () => void
  // Group capacity from the latest INIT_GROUPS; null until the first one arrives.
  private _maxGroups: number | null = null
  // Main-current buffer serving getGroupBBox reads.
  private _current: Int16Array | null = null
  // Superseded buffer awaiting bounce-back to the Worker.
  private _pending: Int16Array | null = null

  /** Wires the handoff listener onto `worker`; `markDirty` is invoked on every received handoff. */
  constructor(worker: Worker, markDirty: () => void) {
    this._worker = worker
    this._markDirty = markDirty
    this._worker.addEventListener('message', this._onMessage)
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

  /**
   * Synchronous `[minX, minY, maxX, maxY]` read for `groupId` from the
   * Main-current buffer. Throws `MappingRequiredError` before the first
   * `aggregateGroups` handoff, or `RangeError` on an out-of-range `groupId`.
   */
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

  /**
   * Handoff listener (an arrow field so `removeEventListener` gets the same
   * reference). `INIT_GROUPS` drops both slots -- a (re)allocation on the
   * Worker side invalidates any buffers this pool already holds, since they
   * belong to the old-sized pool. `groupBBoxes` swaps the incoming buffer
   * into `_current` and queues the superseded one for bounce-back.
   */
  private _onMessage = (e: MessageEvent<WorkerMessage>): void => {
    const msg = e.data
    if (msg.type === 'INIT_GROUPS') {
      this._maxGroups = msg.maxGroups
      this._current = null
      this._pending = null
    } else if (msg.type === 'groupBBoxes') {
      this._pending = this._current
      this._current = msg.buffer
      this._markDirty()
    }
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
  // Schedules a render (and therefore a _postRenderHook flush) after every handoff.
  private readonly _markDirty: () => void
  // Sector capacity from the latest INIT_ANCHORS; null until the first one arrives.
  private _sectorCount: number | null = null
  // Main-current buffer serving getAnchor reads.
  private _current: Int16Array | null = null
  // Superseded buffer awaiting bounce-back to the Worker.
  private _pending: Int16Array | null = null

  /** Wires the handoff listener onto `worker`; `markDirty` is invoked on every received handoff. */
  constructor(worker: Worker, markDirty: () => void) {
    this._worker = worker
    this._markDirty = markDirty
    this._worker.addEventListener('message', this._onMessage)
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

  /**
   * Synchronous `[x, y]` anchor read for `sectorId` from the Main-current
   * buffer. Throws a plain `Error` before the first `computeAnchors`
   * handoff (Epic 7 Task 7.2 ruling -- no canonical error class), or
   * `RangeError` on an out-of-range `sectorId`.
   */
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

  /**
   * Handoff listener (an arrow field so `removeEventListener` gets the same
   * reference). `INIT_ANCHORS` drops both slots -- a (re)allocation on the
   * Worker side invalidates any buffers this pool already holds, since they
   * belong to the old-sized pool. `anchors` swaps the incoming buffer into
   * `_current` and queues the superseded one for bounce-back.
   */
  private _onMessage = (e: MessageEvent<WorkerMessage>): void => {
    const msg = e.data
    if (msg.type === 'INIT_ANCHORS') {
      this._sectorCount = msg.sectorCount
      this._current = null
      this._pending = null
    } else if (msg.type === 'anchors') {
      this._pending = this._current
      this._current = msg.buffer
      this._markDirty()
    }
  }
}

/**
 * @internal Main-thread side of the Transferable ring-pool handoff (CA-6)
 * for `borderEdges`. Structurally different from `TransferableGroupPool`/
 * `TransferableAnchorPool`: those retain a `_current` buffer to serve later
 * indexed reads (`getGroupBBox`/`getAnchor`); here, the GPU VBO upload and
 * the private `.slice()` copy backing `MapEngine.getBorderSegments()` both
 * happen synchronously on receipt (via the injected `onEdges` callback,
 * owned by `MapRenderer` -- see `MapRenderer._receiveBorderEdges`), so this
 * class only needs to hold the `(edges, count)` pair between receipt and the
 * next bounce-back flush. It also cycles a PAIR of buffers per handoff
 * (edges + its paired count), unlike the single-buffer group/anchor pools.
 */
export class TransferableBorderPool {
  private readonly _worker: Worker
  // Injected receiver (MapRenderer._receiveBorderEdges): GPU upload + private copy + dirty flag.
  private readonly _onEdges: (edges: Float32Array, count: number) => void
  // The received (edges, count) pair awaiting bounce-back to the Worker.
  private _pendingEdges: Float32Array | null = null
  private _pendingCount: Uint32Array | null = null

  /** Wires the handoff listener onto `worker`; `onEdges` is invoked synchronously on every received handoff. */
  constructor(
    worker: Worker,
    onEdges: (edges: Float32Array, count: number) => void
  ) {
    this._worker = worker
    this._onEdges = onEdges
    this._worker.addEventListener('message', this._onMessage)
  }

  /** Wired as part of the composite `MapRenderer._postRenderHook`. Safe to call every frame. */
  flushBounces = (): void => {
    if (!this._pendingEdges || !this._pendingCount) return
    const edges = this._pendingEdges
    const count = this._pendingCount
    this._pendingEdges = null
    this._pendingCount = null
    this._worker.postMessage(
      { type: 'returnBorderEdges', edges, count } satisfies WorkerMessage,
      [edges.buffer, count.buffer]
    )
  }

  /** Torn down alongside `loadMap()`/`dispose()`, which also replace/terminate the Worker. */
  dispose(): void {
    this._worker.removeEventListener('message', this._onMessage)
    this._pendingEdges = null
    this._pendingCount = null
  }

  /**
   * Handoff listener (an arrow field so `removeEventListener` gets the same
   * reference). Invokes `_onEdges` on every resolution, including the
   * zero-edge sentinel -- GPU upload, private-copy retention, and the dirty
   * flag do not depend on `BorderRenderer`'s (lazy, non-empty-only) scene
   * construction -- then holds the pair for the next bounce-back flush.
   */
  private _onMessage = (e: MessageEvent<WorkerMessage>): void => {
    const msg = e.data
    if (msg.type === 'borderEdges') {
      this._onEdges(msg.edges, msg.count[0])
      this._pendingEdges = msg.edges
      this._pendingCount = msg.count
    }
  }
}
